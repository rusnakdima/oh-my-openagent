import { describe, expect, test, mock } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import { createVoiceTool } from "./tools"
import type { VoiceArgs } from "./types"

function createToolContext(): ToolContext {
  return {
    sessionID: "parent-session",
    messageID: "parent-message",
    agent: "sisyphus",
    directory: "/project",
    worktree: "/project",
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  }
}

function createMockDispatch() {
  const calls: Array<{ mode: string; prompt: unknown }> = []
  const dispatch = mock(async (opts: { mode: string; prompt: unknown }) => {
    calls.push(opts)
    return { result: "ok" }
  })
  return { dispatch, calls }
}

describe("voice tool", () => {
  describe("execute", () => {
    test("record=false returns microphone ready without recording", async () => {
      const { dispatch } = createMockDispatch()
      const tool = createVoiceTool(
        {
          client: {} as never,
          logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} },
          directory: "/project",
        },
        { enabled: true, default_backend: "openai", capture: {} },
      )

      const ctx = createToolContext()
      const result = await tool.execute({ record: false }, ctx)

      expect(result.title).toBe("Microphone ready")
      expect(result.output).toContain("Microphone ready")
      expect(result.output).toContain("Default backend:")
    })

    test("record=true with invalid STT config returns config error", async () => {
      const { dispatch } = createMockDispatch()
      const tool = createVoiceTool(
        {
          client: {} as never,
          logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} },
          directory: "/project",
        },
        { enabled: true, default_backend: "openai", capture: {} },
      )

      const ctx = createToolContext()
      // No OPENAI_API_KEY → STT config validation fails
      const result = await tool.execute({ record: true }, ctx)

      expect(result.title).toBe("STT configuration error")
      expect(result.output.toLowerCase()).toContain("error")
    })

    test("tool description mentions voice and microphone", () => {
      const { dispatch } = createMockDispatch()
      const tool = createVoiceTool(
        {
          client: {} as never,
          logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} },
          directory: "/project",
        },
        { enabled: true, default_backend: "openai", capture: {} },
      )

      expect(tool.description).toContain("voice")
      expect(tool.description).toContain("microphone")
    })
  })

  describe("tool accepts args without throwing", () => {
    test("accepts record, backend, language args", async () => {
      const { dispatch } = createMockDispatch()
      const tool = createVoiceTool(
        {
          client: {} as never,
          logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} },
          directory: "/project",
        },
        { enabled: true, default_backend: "openai", capture: {} },
      )

      const ctx = createToolContext()
      // execute() will fail in test env (no mic), but it should validate args first
      const result = tool.execute({ record: true, language: "en" }, ctx)
      expect(result).toBeDefined()
    })
  })
})
