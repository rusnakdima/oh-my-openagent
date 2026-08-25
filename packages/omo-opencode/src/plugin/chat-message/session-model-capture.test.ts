import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { unsafeTestValue } from "../../../../../test-support/unsafe-test-value";
import type { OhMyOpenCodeConfig } from "../../config";
import {
  _resetForTesting,
  registerAgentName,
  setMainSession,
  subagentSessions,
} from "../../features/claude-code-session-state";
import { _resetConfigDefaultModelCacheForTesting } from "../../shared/config-default-model";
import {
  _resetGlobalModelStoreCacheForTesting,
  readPersistedGlobalModel,
} from "../../shared/global-model-store";
import {
  clearGlobalTuiModel,
  getSelectedGlobalModelLive,
  setSelectedGlobalModel,
} from "../../shared/session-model-state";
import { createChatMessageHandler } from "../chat-message";
import type { ChatMessageInput } from "./types";

type HandlerArgs = Parameters<typeof createChatMessageHandler>[0];

function makeHandler(): (
  input: ChatMessageInput,
  output: { message: Record<string, unknown>; parts: [] },
) => Promise<void> {
  const args = unsafeTestValue<HandlerArgs>({
    ctx: unsafeTestValue<HandlerArgs["ctx"]>({
      client: { tui: { showToast: async () => {} } },
    }),
    pluginConfig: unsafeTestValue<OhMyOpenCodeConfig>({}),
    firstMessageVariantGate: {
      shouldOverride: () => false,
      markApplied: () => {},
    },
    hooks: unsafeTestValue<HandlerArgs["hooks"]>({
      stopContinuationGuard: null,
      backgroundNotificationHook: null,
      keywordDetector: null,
      claudeCodeHooks: null,
      autoSlashCommand: null,
      startWork: null,
      goal: null,
    }),
  });
  return createChatMessageHandler(args);
}

function makeOutput(): { message: Record<string, unknown>; parts: [] } {
  return { message: {}, parts: [] };
}

const GPT55 = { providerID: "openai", modelID: "gpt-5.5" };
const MINIMAX = {
  providerID: "minimax",
  modelID: "MiniMax-M2.7-highspeed",
};
const OPUS5 = { providerID: "anthropic", modelID: "claude-opus-5" };

describe("session-baseline global model capture (detectUserModelPick)", () => {
  let tempDataHome = "";
  let tempConfigHome = "";
  let originalXdgDataHome: string | undefined;
  let originalXdgConfigHome: string | undefined;

  beforeEach(() => {
    tempDataHome = mkdtempSync(join(tmpdir(), "model-capture-data-"));
    tempConfigHome = mkdtempSync(join(tmpdir(), "model-capture-config-"));
    originalXdgDataHome = process.env.XDG_DATA_HOME;
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    process.env.XDG_DATA_HOME = tempDataHome;
    process.env.XDG_CONFIG_HOME = tempConfigHome;
    // Boot default the TUI would read from opencode.jsonc
    mkdirSync(join(tempConfigHome, "opencode"), { recursive: true });
    writeFileSync(
      join(tempConfigHome, "opencode", "opencode.jsonc"),
      JSON.stringify({ model: `${GPT55.providerID}/${GPT55.modelID}` }),
    );
    _resetConfigDefaultModelCacheForTesting();
    _resetGlobalModelStoreCacheForTesting();
    clearGlobalTuiModel();
    _resetForTesting();
    // Simulate the server process having registered OMO agents at config time
    for (
      const name of [
        "sisyphus",
        "atlas",
        "hephaestus",
        "prometheus",
        "librarian",
      ]
    ) {
      registerAgentName(name);
    }
  });

  afterEach(() => {
    clearGlobalTuiModel();
    _resetForTesting();
    _resetConfigDefaultModelCacheForTesting();
    _resetGlobalModelStoreCacheForTesting();
    if (originalXdgDataHome === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = originalXdgDataHome;
    }
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }
    rmSync(tempDataHome, { recursive: true, force: true });
    rmSync(tempConfigHome, { recursive: true, force: true });
  });

  test("(a) first message carrying the boot-default model is a restore, not a pick", async () => {
    //#given — global pick differs from the opencode.jsonc boot default
    setSelectedGlobalModel(OPUS5);
    setMainSession("ses_baseline");
    const handler = makeHandler();

    //#when — very first observation of this session+agent pair is the
    // boot-default model OpenCode starts every fresh mode on
    const output = makeOutput();
    await handler(
      { sessionID: "ses_baseline", agent: "sisyphus", model: GPT55 },
      output,
    );

    //#then — store untouched; the existing global pick still drives the call
    expect(getSelectedGlobalModelLive()).toEqual(OPUS5);
    expect(readPersistedGlobalModel()).toEqual(OPUS5);
    expect(output.message.model).toEqual(OPUS5);
  });

  test("(a2) pick made BEFORE the first message of a fresh session propagates instantly", async () => {
    //#given — fresh launch: global is the old pick; user picks minimax in the
    // /models dialog before sending anything
    setSelectedGlobalModel(OPUS5);
    setMainSession("ses_fresh_pick");
    const handler = makeHandler();

    //#when — FIRST message of the session already carries the picked model
    const output = makeOutput();
    await handler(
      { sessionID: "ses_fresh_pick", agent: "sisyphus", model: MINIMAX },
      output,
    );

    //#then — this very message's call uses the pick and the store follows
    expect(output.message.model).toEqual(MINIMAX);
    expect(getSelectedGlobalModelLive()).toEqual(MINIMAX);
    expect(readPersistedGlobalModel()).toEqual(MINIMAX);
  });

  test("(b) mid-session pick updates the store AND the same message's applied model", async () => {
    //#given — baseline established on message 1
    setSelectedGlobalModel(GPT55);
    setMainSession("ses_pick");
    const handler = makeHandler();
    await handler(
      { sessionID: "ses_pick", agent: "sisyphus", model: GPT55 },
      makeOutput(),
    );

    //#when — user picks a different model via /models, then sends
    const output = makeOutput();
    await handler(
      { sessionID: "ses_pick", agent: "sisyphus", model: MINIMAX },
      output,
    );

    //#then — no one-message lag: THIS message's call uses the pick…
    expect(output.message.model).toEqual(MINIMAX);
    //#then — …and heap + cross-process store agree on it
    expect(getSelectedGlobalModelLive()).toEqual(MINIMAX);
    expect(readPersistedGlobalModel()).toEqual(MINIMAX);
  });

  test("(c) subagent model changes never capture; parent inheritance keeps applying the global", async () => {
    //#given — a delegated subagent session with its own assigned models
    setSelectedGlobalModel(OPUS5);
    subagentSessions.add("ses_sub");
    const handler = makeHandler();

    //#when — the subagent's input.model differs from the global (twice)
    const first = makeOutput();
    await handler(
      {
        sessionID: "ses_sub",
        agent: "librarian",
        model: { providerID: "zai-coding-plan", modelID: "glm-5" },
      },
      first,
    );
    const second = makeOutput();
    await handler(
      {
        sessionID: "ses_sub",
        agent: "librarian",
        model: { providerID: "google", modelID: "gemini-3-pro" },
      },
      second,
    );

    //#then — global pick survives both; subagent calls still inherit it
    expect(getSelectedGlobalModelLive()).toEqual(OPUS5);
    expect(first.message.model).toEqual(OPUS5);
    expect(second.message.model).toEqual(OPUS5);
  });

  test("(d) mode-switch restore never reverts the pick (EVIDENCE.md scenario)", async () => {
    //#given — baseline restore on msg1, then the minimax pick captured on msg2
    setSelectedGlobalModel(GPT55);
    setMainSession("ses_modes");
    const handler = makeHandler();
    await handler(
      { sessionID: "ses_modes", agent: "sisyphus", model: GPT55 },
      makeOutput(),
    );
    await handler(
      { sessionID: "ses_modes", agent: "sisyphus", model: MINIMAX },
      makeOutput(),
    );
    expect(getSelectedGlobalModelLive()).toEqual(MINIMAX);

    //#when — switch to Hephaestus, whose stale per-mode restore is gpt-5.5
    const restoreOutput = makeOutput();
    await handler(
      { sessionID: "ses_modes", agent: "hephaestus", model: GPT55 },
      restoreOutput,
    );

    //#then — restore does NOT clobber the store…
    expect(getSelectedGlobalModelLive()).toEqual(MINIMAX);
    expect(readPersistedGlobalModel()).toEqual(MINIMAX);
    //#then — …and Hephaestus's actual call still uses the picked model
    expect(restoreOutput.message.model).toEqual(MINIMAX);

    //#and when — back in Hephaestus the user picks yet another model
    const GLM = { providerID: "zai-coding-plan", modelID: "glm-5.2-highspeed" };
    const pickOutput = makeOutput();
    await handler(
      { sessionID: "ses_modes", agent: "hephaestus", model: GLM },
      pickOutput,
    );

    //#then — genuine mid-mode pick captures instantly, same message
    expect(pickOutput.message.model).toEqual(GLM);
    expect(getSelectedGlobalModelLive()).toEqual(GLM);
    expect(readPersistedGlobalModel()).toEqual(GLM);
  });
});
