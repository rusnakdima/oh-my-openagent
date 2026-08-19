import { describe, expect, test, mock } from "bun:test"
import { createSTTProvider } from "./stt-provider-factory"

describe("stt-provider-factory", () => {
  describe("createSTTProvider", () => {
    test("creates openai provider with correct config", () => {
      const provider = createSTTProvider("openai", {
        model: "whisper-large-v3-turbo",
        language: "en",
        temperature: 0.3,
      })

      expect(provider).toBeDefined()
      expect(typeof provider.transcribe).toBe("function")
    })

    test("creates cloudflare provider with correct config", () => {
      const provider = createSTTProvider("cloudflare", {
        model: "@cf/deepgram/nova-3",
        language: "en",
      })

      expect(provider).toBeDefined()
      expect(typeof provider.transcribe).toBe("function")
    })

    test("creates local provider with correct config", () => {
      const provider = createSTTProvider("local", {
        executable: "/usr/local/bin/faster-whisper",
        model: "base",
        device: "cpu",
      })

      expect(provider).toBeDefined()
      expect(typeof provider.transcribe).toBe("function")
    })

    test("throws for unknown backend", () => {
      expect(() =>
        createSTTProvider("unknown" as never, {}),
      ).toThrow()
    })

    test("openai provider transcribe returns text via fetch", async () => {
      const fetchMock = mock(async (_url: string, _opts?: unknown) => {
        return {
          ok: true,
          json: async () => ({
            text: "hello world",
          }),
        }
      })
      globalThis.fetch = fetchMock as typeof fetch

      const provider = createSTTProvider("openai", {
        model: "whisper-large-v3-turbo",
        language: "en",
      })

      const buffer = new Uint8Array([0x00, 0x01, 0x02])
      const result = await provider.transcribe(buffer, { language: "en" })

      expect(result).toBe("hello world")
      expect(fetchMock).toHaveBeenCalled()
    })

    test("openai provider throws on API error", async () => {
      const fetchMock = mock(async () => {
        return {
          ok: false,
          status: 401,
          text: async () => "Unauthorized",
        }
      })
      globalThis.fetch = fetchMock as typeof fetch

      const provider = createSTTProvider("openai", {
        model: "whisper-large-v3-turbo",
      })

      const buffer = new Uint8Array([0x00])
      await expect(provider.transcribe(buffer, {})).rejects.toThrow()
    })

    test("cloudflare provider calls Workers AI endpoint", async () => {
      const fetchMock = mock(async (url: string, _opts?: unknown) => {
        expect(url).toContain("cloudflare")
        return {
          ok: true,
          json: async () => ({
            text: "cloudflare transcription",
          }),
        }
      })
      globalThis.fetch = fetchMock as typeof fetch

      const provider = createSTTProvider("cloudflare", {
        model: "@cf/deepgram/nova-3",
      })

      const buffer = new Uint8Array([0x00])
      const result = await provider.transcribe(buffer, {})

      expect(result).toBe("cloudflare transcription")
    })

    test("local provider throws when executable not found", async () => {
      const provider = createSTTProvider("local", {
        executable: "/nonexistent/faster-whisper",
        model: "base",
      })

      const buffer = new Uint8Array([0x00])
      await expect(provider.transcribe(buffer, {})).rejects.toThrow()
    })
  })
})
