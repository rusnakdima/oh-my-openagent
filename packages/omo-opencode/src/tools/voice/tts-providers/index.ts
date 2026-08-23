import type { TTSConfig, TTSProvider } from "./types"
import { createOpenAITTSProvider } from "./openai-tts"
import { createLocalTTSProvider } from "./local-tts"

export type { TTSProvider } from "./types"
export { type TTSConfig }

export function createTTSProvider(backend: string, config: TTSConfig): TTSProvider {
  switch (backend) {
    case "openai":
      return createOpenAITTSProvider(
        config.openai ?? { model: "gpt-4o-mini-tts", voice: "alloy", format: "mp3", speed: 1.0 },
      )
    case "local":
      return createLocalTTSProvider(
        config.local ?? { backend: "espeak", voice: "en", speed: 160 },
      )
    default:
      throw new Error(`Unknown TTS backend: ${backend}. Supported: openai, local`)
  }
}
