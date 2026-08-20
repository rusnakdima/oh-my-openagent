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
      const accountId = process.env["CF_ACCOUNT_ID"]
      const apiToken = process.env["CF_API_TOKEN"]
      if (!accountId) {
        return {
          valid: false,
          error: "Cloudflare account ID not found. Set CF_ACCOUNT_ID environment variable.",
        }
      }
      if (!apiToken) {
        return {
          valid: false,
          error: "Cloudflare API token not found. Set CF_API_TOKEN environment variable.",
        }
      }
      return { valid: true }
    },
    async transcribe(audio: AudioBuffer): Promise<string> {
      const accountId = process.env["CF_ACCOUNT_ID"]
      const apiToken = process.env["CF_API_TOKEN"]
      if (!accountId || !apiToken) {
        throw new Error("CF_ACCOUNT_ID and CF_API_TOKEN must both be set")
      }

      const base64Audio = Buffer.from(audio.data).toString("base64")
      const audioDataUrl = `data:audio/wav;base64,${base64Audio}`

      log(`[voice] Transcribing via Cloudflare Workers AI (${config.model})`)

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${config.model}`,
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
