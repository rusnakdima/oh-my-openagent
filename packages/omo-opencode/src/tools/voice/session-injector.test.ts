import { afterEach, describe, expect, spyOn, test } from "bun:test";
import type { ToolContext } from "@opencode-ai/plugin/tool";
import * as promptAsyncGate from "../../shared/prompt-async-gate";

function createToolContext(): ToolContext {
  return {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "sisyphus",
    directory: "/project",
    worktree: "/project",
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  };
}

type DispatchCall = {
  mode: string;
  input: { body: { parts: Array<{ type: string; text: string }> } };
};

// Spy on the gate's dispatch function instead of vi.mock/mock.module, which
// permanently replaces the module for every later test file in the process.
const calls: DispatchCall[] = [];
let dispatchSpy: ReturnType<
  typeof spyOn<typeof promptAsyncGate, "dispatchInternalPrompt">
> | undefined;

function recordDispatch(opts: DispatchCall): Promise<unknown> {
  calls.push(opts);
  return Promise.resolve({ status: "dispatched" as const });
}

describe("session-injector", () => {
  afterEach(() => {
    calls.length = 0;
    dispatchSpy?.mockRestore();
    dispatchSpy = undefined;
  });

  describe("injectTranscription", () => {
    test("dispatches /voice via session.promptAsync with correct parts", async () => {
      dispatchSpy = spyOn(
        promptAsyncGate,
        "dispatchInternalPrompt",
      ).mockImplementation(recordDispatch);

      const { injectTranscription } = await import("./session-injector");

      const ctx = createToolContext();
      await injectTranscription({
        client: ctx.sessionID as never,
        sessionID: ctx.sessionID,
        directory: "/project",
        text: "/voice",
      });

      expect(calls.length).toBe(1);
      expect(calls[0]!.mode).toBe("async");
      const body = calls[0]!.input!.body;
      expect(body.parts[0]!.text).toBe("/voice");
      expect(body.parts[0]!.type).toBe("text");
    });

    test("dispatches transcription text via session.promptAsync", async () => {
      dispatchSpy = spyOn(
        promptAsyncGate,
        "dispatchInternalPrompt",
      ).mockImplementation(recordDispatch);

      const { injectTranscription } = await import("./session-injector");

      const ctx = createToolContext();
      await injectTranscription({
        client: ctx.sessionID as never,
        sessionID: ctx.sessionID,
        directory: "/project",
        text: "hello world transcribed",
      });

      const body = calls[0]!.input!.body;
      expect(body.parts[0]!.text).toBe("hello world transcribed");
    });
  });

  describe("SessionInjectionError", () => {
    test("is exported from errors module", async () => {
      const { SessionInjectionError } = await import("./errors");
      expect(new SessionInjectionError("test").message).toContain("test");
    });

    test("extends VoiceInputError", async () => {
      const { SessionInjectionError, VoiceInputError } = await import(
        "./errors"
      );
      expect(new SessionInjectionError("test")).toBeInstanceOf(VoiceInputError);
    });
  });
});
