import { describe, expect, test, mock } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import { injectTranscription } from "./session-injector"
import { SessionInjectionError } from "./errors"

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
  }
}

describe("session-injector", () => {
  describe("injectTranscription", () => {
    test("calls dispatchInternalPrompt with correct session id and text parts", async () => {
      const calls: Array<{ mode: string; prompt: unknown }> = []
      const dispatch = mock(async (opts: { mode: string; prompt: unknown }) => {
        calls.push(opts)
        return { result: "ok" }
      })

      const ctx = createToolContext()
      await injectTranscription({
        text: "hello world",
        dispatchInternalPrompt: dispatch as never,
        sessionID: ctx.sessionID,
      })

      expect(calls.length).toBe(1)
      expect(calls[0]!.mode).toBe("async")
      const prompt = calls[0]!.prompt as { parts: Array<{ type: string; text: string }> }
      expect(prompt.parts.length).toBe(1)
      expect(prompt.parts[0]!.type).toBe("text")
      expect(prompt.parts[0]!.text).toBe("hello world")
    })

    test("throws SessionInjectionError when dispatch fails", async () => {
      const dispatch = mock(async () => {
        throw new Error("Session gone")
      })

      const ctx = createToolContext()
      await expect(
        injectTranscription({
          text: "test",
          dispatchInternalPrompt: dispatch as never,
          sessionID: ctx.sessionID,
        }),
      ).rejects.toThrow(SessionInjectionError)
    })

    test("SessionInjectionError has descriptive message", async () => {
      const dispatch = mock(async () => {
        throw new Error("connection refused")
      })

      const ctx = createToolContext()
      try {
        await injectTranscription({
          text: "test",
          dispatchInternalPrompt: dispatch as never,
          sessionID: ctx.sessionID,
        })
        expect.fail("should have thrown")
      } catch (e) {
        expect(e).toBeInstanceOf(SessionInjectionError)
        expect((e as SessionInjectionError).message).toContain("connection refused")
      }
    })
  })
})
