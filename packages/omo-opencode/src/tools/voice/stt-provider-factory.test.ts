import { describe, expect, test } from "bun:test"
import { createSTTProvider } from "./stt-provider-factory"

describe("stt-provider-factory", () => {
  describe("createSTTProvider", () => {
    test("creates openai provider with correct interface", () => {
      const provider = createSTTProvider("openai", {
        model: "whisper-large-v3-turbo",
        language: "en",
        temperature: 0.3,
      })

      expect(provider).toBeDefined()
      expect(typeof provider.transcribe).toBe("function")
      expect(typeof provider.validateConfig).toBe("function")
      expect(provider.name).toBe("openai-whisper")
    })

    test("creates cloudflare provider with correct interface", () => {
      const provider = createSTTProvider("cloudflare", {
        model: "@cf/deepgram/nova-3",
        language: "en",
      })

      expect(provider).toBeDefined()
      expect(typeof provider.transcribe).toBe("function")
      expect(typeof provider.validateConfig).toBe("function")
      expect(provider.name).toBe("cloudflare-deepgram")
    })

    test("creates local provider with correct interface", () => {
      const provider = createSTTProvider("local", {
        executable: "/usr/local/bin/faster-whisper",
        model: "base",
        device: "cpu",
      })

      expect(provider).toBeDefined()
      expect(typeof provider.transcribe).toBe("function")
      expect(typeof provider.validateConfig).toBe("function")
      expect(provider.name).toBe("local-faster-whisper")
    })

    test("throws for unknown backend", () => {
      expect(() =>
        createSTTProvider("unknown" as never, {}),
      ).toThrow()
    })

    test("openai provider validateConfig returns invalid without API key", () => {
      const provider = createSTTProvider("openai", {
        model: "whisper-large-v3-turbo",
      })
      const result = provider.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.error).toContain("OPENAI_API_KEY")
    })

    test("cloudflare provider validateConfig returns invalid without CF_ACCOUNT_ID", () => {
      const provider = createSTTProvider("cloudflare", {
        model: "@cf/deepgram/nova-3",
      })
      const result = provider.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.error).toContain("CF_ACCOUNT_ID")
    })

    test("cloudflare provider validateConfig returns invalid without CF_API_TOKEN", () => {
      // Set CF_ACCOUNT_ID but not CF_API_TOKEN
      const original = process.env["CF_ACCOUNT_ID"]
      process.env["CF_ACCOUNT_ID"] = "test-account-id"
      delete process.env["CF_API_TOKEN"]
      try {
        const provider = createSTTProvider("cloudflare", {
          model: "@cf/deepgram/nova-3",
        })
        const result = provider.validateConfig()
        expect(result.valid).toBe(false)
        expect(result.error).toContain("CF_API_TOKEN")
      } finally {
        if (original !== undefined) process.env["CF_ACCOUNT_ID"] = original
        else delete process.env["CF_ACCOUNT_ID"]
      }
    })

    test("local provider validateConfig returns valid when executable and model are set", () => {
      const provider = createSTTProvider("local", {
        executable: "/usr/local/bin/faster-whisper",
        model: "base",
      })
      expect(provider.validateConfig()).toEqual({ valid: true })
    })

    test("openai provider validateConfig returns invalid without model", () => {
      const provider = createSTTProvider("openai", {})
      const result = provider.validateConfig()
      expect(result.valid).toBe(false)
      expect(result.error).toContain("OPENAI_API_KEY")
    })

    test("cloudflare provider validateConfig returns invalid without token", () => {
      const provider = createSTTProvider("cloudflare", {})
      const result = provider.validateConfig()
      expect(result.valid).toBe(false)
      // CR-1 fix: now checks CF_ACCOUNT_ID first, then CF_API_TOKEN
      expect(result.error).toMatch(/CF_ACCOUNT_ID|CF_API_TOKEN/)
    })
  })
})
