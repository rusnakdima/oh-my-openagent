import { log } from "../../../shared"
import type { AudioBuffer, STTProvider } from "./types"

interface CloudflareDeepgramConfig {
  model: "@cf/deepgram/nova-3" | "@cf/deepgram/aura-2-en"
  language: string
}

export function createCloudflareDeepgramProvider(config: CloudflareDeepgramConfig): STTProvider {
  return {
    name: "cloudflare-deepgram",
    validateConfig() {
      const apiToken = process.env["CF_API_TOKEN"]
      if (!apiToken) {
        return {
          valid: false,
          error: "Cloudflare API token not found. Set CF_API_TOKEN environment variable.",
        }
      }
      return { valid: true }
    },
    async transcribe(audio: AudioBuffer): Promise<string> {
      const apiToken = process.env["CF_API_TOKEN"]
      if (!apiToken) {
        throw new Error("CF_API_TOKEN not set")
      }

      const base64Audio = Buffer.from(audio.data).toString("base64")
      const audioDataUrl = `data:audio/wav;base64,${base64Audio}`

      log(`[voice] Transcribing via Cloudflare Workers AI (${config.model})`)

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${apiToken}/ai/run/${config.model}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            audio: audioDataUrl,
          }),
        },
      )

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error")
        throw new Error(`Cloudflare Workers AI error ${response.status}: ${errorText}`)
      }

      const result = (await response.json()) as { result?: { text?: string } }
      const text = result?.result?.text
      if (!text) {
        throw new Error("Cloudflare Workers AI returned empty transcription")
      }

      return text.trim()
    },
  }
}
