import type { VoiceConfig } from "../../config/schema/voice"
import type { STTProvider } from "./types"
import { createOpenAIWhisperProvider } from "./stt-providers/openai-whisper"
import { createCloudflareDeepgramProvider } from "./stt-providers/cloudflare-deepgram"
import { createLocalFasterWhisperProvider } from "./stt-providers/local-faster-whisper"

export type { STTProvider }

export function createSTTProvider(backend: string, config: VoiceConfig): STTProvider {
  switch (backend) {
    case "openai":
      return createOpenAIWhisperProvider(config.openai ?? { model: "whisper-large-v3", temperature: 0 })
    case "cloudflare":
      return createCloudflareDeepgramProvider(
        config.cloudflare ?? { model: "@cf/deepgram/nova-3", language: "en" },
      )
    case "local":
      return createLocalFasterWhisperProvider(
        config.local ?? { executable: "auto", model: "base", device: "cpu" },
      )
    default:
      throw new Error(`Unknown STT backend: ${backend}. Supported: openai, cloudflare, local`)
  }
}
