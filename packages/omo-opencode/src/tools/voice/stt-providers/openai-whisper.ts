import { log } from "../../../shared"
import type { AudioBuffer, STTProvider } from "./types"

interface OpenAIWhisperConfig {
  model: "whisper-large-v3" | "whisper-large-v3-turbo"
  language?: string | null
  temperature: number
}

export function createOpenAIWhisperProvider(config: OpenAIWhisperConfig): STTProvider {
  return {
    name: "openai-whisper",
    validateConfig() {
      const apiKey = process.env["OPENAI_API_KEY"]
      if (!apiKey) {
        return {
          valid: false,
          error: "OpenAI API key not found. Set OPENAI_API_KEY environment variable.",
        }
      }
      return { valid: true }
    },
    async transcribe(audio: AudioBuffer): Promise<string> {
      const apiKey = process.env["OPENAI_API_KEY"]
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY not set")
      }

      const formData = new FormData()
      const wavBlob = new Blob([audio.data], { type: "audio/wav" })
      formData.append("file", wavBlob, "recording.wav")
      formData.append("model", config.model)
      if (config.language) {
        formData.append("language", config.language)
      }
      if (config.temperature !== undefined) {
        formData.append("temperature", String(config.temperature))
      }

      log(`[voice] Transcribing via OpenAI Whisper (${config.model})`)

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error")
        throw new Error(`OpenAI Whisper API error ${response.status}: ${errorText}`)
      }

      const result = (await response.json()) as { text?: string }
      if (!result.text) {
        throw new Error("OpenAI Whisper returned empty transcription")
      }

      return result.text.trim()
    },
  }
}
