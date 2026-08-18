import { describe, expect, test } from "bun:test"
import { VoiceConfigSchema } from "./voice"

describe("VoiceConfigSchema", () => {
  test("parses empty object with defaults", () => {
    const result = VoiceConfigSchema.parse({})
    expect(result.enabled).toBe(false)
    expect(result.default_backend).toBe("openai")
    expect(result.capture?.silence_threshold_db).toBe(-40)
    expect(result.capture?.max_duration_seconds).toBe(60)
    expect(result.capture?.min_duration_seconds).toBe(1)
    expect(result.capture?.sample_rate).toBe(16000)
  })

  test("parses full config", () => {
    const result = VoiceConfigSchema.parse({
      enabled: true,
      default_backend: "cloudflare",
      openai: { model: "whisper-large-v3-turbo", language: "en", temperature: 0.5 },
      cloudflare: { model: "@cf/deepgram/nova-3", language: "en" },
      local: { executable: "/usr/local/bin/faster-whisper", model: "base", device: "cuda" },
      capture: { silence_threshold_db: -50, max_duration_seconds: 30 },
    })
    expect(result.enabled).toBe(true)
    expect(result.default_backend).toBe("cloudflare")
    expect(result.openai?.model).toBe("whisper-large-v3-turbo")
    expect(result.openai?.temperature).toBe(0.5)
    expect(result.local?.device).toBe("cuda")
    expect(result.capture?.max_duration_seconds).toBe(30)
  })

  test("rejects invalid backend", () => {
    expect(() =>
      VoiceConfigSchema.parse({ default_backend: "invalid" }),
    ).toThrow()
  })

  test("rejects invalid openai model", () => {
    expect(() =>
      VoiceConfigSchema.parse({ openai: { model: "invalid-model" } }),
    ).toThrow()
  })

  test("rejects max_duration_seconds out of range", () => {
    expect(() =>
      VoiceConfigSchema.parse({ capture: { max_duration_seconds: 0 } }),
    ).toThrow()
    expect(() =>
      VoiceConfigSchema.parse({ capture: { max_duration_seconds: 301 } }),
    ).toThrow()
  })
})
