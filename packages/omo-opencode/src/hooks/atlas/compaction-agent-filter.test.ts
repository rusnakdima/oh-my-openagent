declare const require: (name: string) => any;
const {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
  afterAll,
} = require("bun:test");
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  clearBoulderState,
  writeBoulderState,
} from "../../features/boulder-state";
import {
  _resetForTesting,
  registerAgentName,
} from "../../features/claude-code-session-state";
import type { BoulderState } from "../../features/boulder-state";
import * as originalInjectorConstants from "../../features/hook-message-injector/constants";
import * as messageDirModule from "../../shared/opencode-message-dir";
import * as storageDetection from "../../shared/opencode-storage-detection";

const TEST_STORAGE_ROOT = join(
  tmpdir(),
  `atlas-compaction-storage-${randomUUID()}`,
);
const TEST_MESSAGE_STORAGE = join(TEST_STORAGE_ROOT, "message");
const TEST_PART_STORAGE = join(TEST_STORAGE_ROOT, "part");

beforeEach(() => {
  mock.restore();
  mock.module("../../features/hook-message-injector/constants", () => ({
    OPENCODE_STORAGE: TEST_STORAGE_ROOT,
    MESSAGE_STORAGE: TEST_MESSAGE_STORAGE,
    PART_STORAGE: TEST_PART_STORAGE,
  }));
});

afterEach(() => {
  mock.module(
    "../../features/hook-message-injector/constants",
    () => originalInjectorConstants,
  );
  mock.restore();
});

afterAll(() => {
  mock.module(
    "../../features/hook-message-injector/constants",
    () => originalInjectorConstants,
  );
  mock.restore();
});

const { createAtlasHook } = await import("./index");

describe("atlas hook compaction agent filtering", () => {
  let testDirectory: string;

  function createMockPluginInput() {
    const promptMock = mock(() => Promise.resolve());
    return {
      directory: testDirectory,
      client: {
        session: {
          prompt: promptMock,
          promptAsync: promptMock,
        },
      },
      _promptMock: promptMock,
    } as Parameters<typeof createAtlasHook>[0] & {
      _promptMock: ReturnType<typeof mock>;
    };
  }

  function writeMessage(
    sessionID: string,
    fileName: string,
    agent: string,
  ): void {
    const messageDir = join(TEST_MESSAGE_STORAGE, sessionID);
    mkdirSync(messageDir, { recursive: true });
    writeFileSync(
      join(messageDir, fileName),
      JSON.stringify({
        agent,
        model: { providerID: "anthropic", modelID: "claude-opus-4-7" },
      }),
    );
  }

  beforeEach(() => {
    mock.restore();
    spyOn(messageDirModule, "getMessageDir").mockImplementation(
      (sessionID: string) => {
        const directory = join(TEST_MESSAGE_STORAGE, sessionID);
        return existsSync(directory) ? directory : null;
      },
    );
    spyOn(storageDetection, "isSqliteBackend").mockReturnValue(false);
    testDirectory = join(tmpdir(), `atlas-compaction-test-${randomUUID()}`);
    mkdirSync(testDirectory, { recursive: true });
    clearBoulderState(testDirectory);
    _resetForTesting();
    registerAgentName("atlas");
    registerAgentName("sisyphus");
  });

  afterEach(() => {
    clearBoulderState(testDirectory);
    rmSync(testDirectory, { recursive: true, force: true });
    _resetForTesting();
    mock.restore();
  });

  test("should inject continuation when the latest message is compaction but the previous agent matches atlas", async () => {
    // given
    const sessionID = "main-session-after-compaction";
    const planPath = join(testDirectory, "test-plan.md");
    writeFileSync(planPath, "# Plan\n- [ ] Task 1\n- [ ] Task 2");

    const state: BoulderState = {
      active_plan: planPath,
      started_at: "2026-01-02T10:00:00Z",
      session_ids: [sessionID],
      plan_name: "test-plan",
      agent: "atlas",
    };
    writeBoulderState(testDirectory, state);
    writeMessage(sessionID, "msg_001.json", "atlas");
    writeMessage(sessionID, "msg_002.json", "compaction");

    const mockInput = createMockPluginInput();
    const hook = createAtlasHook(mockInput);

    // when
    await hook.handler({
      event: {
        type: "session.idle",
        properties: { sessionID },
      },
    });

    // then
    expect(mockInput._promptMock).toHaveBeenCalledTimes(1);
  });
});
