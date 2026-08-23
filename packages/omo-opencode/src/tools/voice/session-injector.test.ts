import { describe, expect, mock, test, vi } from "bun:test";
import type { ToolContext } from "@opencode-ai/plugin/tool";

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

describe("session-injector", () => {
  describe("injectTranscription", () => {
    test("dispatches /voice via session.promptAsync with correct parts", async () => {
      const calls: Array<
        {
          mode: string;
          input: { body: { parts: Array<{ type: string; text: string }> } };
        }
      > = [];
      vi.mock("../../shared/prompt-async-gate", () => ({
        dispatchInternalPrompt: mock(
          async (
            opts: {
              mode: string;
              input: { body: { parts: Array<{ type: string; text: string }> } };
            },
          ) => {
            calls.push(opts);
            return { status: "dispatched" as const };
          },
        ),
      }));

      const { injectTranscription } = await import("./session-injector");

      const ctx = createToolContext();
      await injectTranscription({
        text: "/voice",
        sessionID: ctx.sessionID,
      });

      expect(calls.length).toBe(1);
      expect(calls[0]!.mode).toBe("async");
      const body = calls[0]!.input!.body;
      expect(body.parts[0]!.text).toBe("/voice");
      expect(body.parts[0]!.type).toBe("text");
    });

    test("dispatches transcription text via session.promptAsync", async () => {
      const calls: Array<
        {
          mode: string;
          input: { body: { parts: Array<{ type: string; text: string }> } };
        }
      > = [];
      vi.mock("../../shared/prompt-async-gate", () => ({
        dispatchInternalPrompt: mock(
          async (
            opts: {
              mode: string;
              input: { body: { parts: Array<{ type: string; text: string }> } };
            },
          ) => {
            calls.push(opts);
            return { status: "dispatched" as const };
          },
        ),
      }));

      const { injectTranscription } = await import("./session-injector");

      const ctx = createToolContext();
      await injectTranscription({
        text: "hello world transcribed",
        sessionID: ctx.sessionID,
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
