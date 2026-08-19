import { tool, type PluginInput } from "@opencode-ai/plugin"
import { log } from "../../shared"
import { createTTSProvider } from "./tts-providers"
import type { VoiceConfig } from "./types"

const SPEAK_DESCRIPTION =
  "Convert text to speech and play audio through the speaker. " +
  "Requires voice.tts.enabled: true and voice.tts.default_backend in config. " +
  "Supports OpenAI TTS API (gpt-4o-mini-tts, tts-1, tts-1-hd) or local (espeak/say)."

export function createSpeakTool(_ctx: PluginInput, config: VoiceConfig): ReturnType<typeof tool> {
  const ttsConfig = config.tts
  if (!ttsConfig?.enabled) {
    // Return a no-op tool when TTS is disabled
    return tool({
      description: SPEAK_DESCRIPTION,
      args: {
        text: tool.schema.string().describe("Text to speak"),
        backend: tool.schema.enum(["openai", "local"]).optional(),
      },
      async execute(rawArgs) {
        return {
          title: "TTS disabled",
          output: "Text-to-speech is not enabled. Set voice.tts.enabled: true in your config.",
        }
      },
    })
  }

  return tool({
    description: SPEAK_DESCRIPTION,
    args: {
      /** Text to convert to speech. */
      text: tool.schema.string().min(1).describe("Text to speak"),
      /** TTS backend override. Defaults to config default. */
      backend: tool.schema.enum(["openai", "local"]).optional(),
    },
    async execute(rawArgs, _toolContext) {
      const args = rawArgs as { text?: string; backend?: "openai" | "local" }
      const text = args.text ?? ""
      const backend = args.backend ?? ttsConfig.default_backend ?? "openai"

      if (!text.trim()) {
        return { title: "Empty text", output: "No text provided to speak." }
      }

      log(`[voice] TTS request: backend=${backend}, text="${text.substring(0, 50)}..."`)

      const ttsProvider = createTTSProvider(backend, ttsConfig)

      const configValidation = ttsProvider.validateConfig()
      if (!configValidation.valid) {
        const hint =
          backend === "openai"
            ? " Set OPENAI_API_KEY environment variable."
            : " Install espeak (Linux) or use the built-in 'say' (macOS)."
        return {
          title: "TTS not configured",
          output: `${configValidation.error}.${hint}`,
        }
      }

      try {
        await ttsProvider.speak(text)
        return {
          title: "Speech played",
          output: `Played ${text.length} characters via ${backend} TTS.`,
        }
      } catch (err) {
        log(`[voice] TTS error: ${err}`)
        return {
          title: "TTS failed",
          output: err instanceof Error ? `TTS failed: ${err.message}` : `TTS failed: ${String(err)}`,
        }
      }
    },
  })
}
