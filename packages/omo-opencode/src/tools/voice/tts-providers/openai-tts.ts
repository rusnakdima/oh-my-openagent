import * as childProcess from "node:child_process"
import { tmpdir } from "node:os"
import { log } from "../../../shared"
import type { TTSProvider } from "./types"

interface OpenAITTSTConfig {
  model: "gpt-4o-mini-tts" | "tts-1" | "tts-1-hd"
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"
  format: "mp3" | "opus" | "aac" | "flac"
  speed: number
}

export function createOpenAITTSProvider(config: OpenAITTSTConfig): TTSProvider {
  return {
    name: "openai-tts",
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
    async speak(text: string): Promise<void> {
      const apiKey = process.env["OPENAI_API_KEY"]
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY not set")
      }

      const body = {
        model: config.model,
        input: text,
        voice: config.voice,
        response_format: config.format,
        speed: config.speed,
      }

      log(`[voice] TTS via OpenAI (${config.model}, voice=${config.voice})`)

      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error")
        throw new Error(`OpenAI TTS API error ${response.status}: ${errorText}`)
      }

      // Stream audio to a temp file and play it
      const outputPath = `${tmpdir()}/omo-tts-${Date.now()}.${config.format}`
      const fileStream = await import("node:fs").then(
        (fs) => fs.createWriteStream(outputPath) as unknown as { write: (chunk: Uint8Array) => boolean; end: () => void },
      )

      if (!response.body) {
        throw new Error("OpenAI TTS returned empty response body")
      }

      const reader = response.body.getReader()
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          fileStream.write(value)
        }
        fileStream.end()
      } finally {
        reader.releaseLock()
      }

      // Play the audio file
      await playAudioFile(outputPath)
    },
  }
}

async function playAudioFile(filePath: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs")

  const platform = process.platform
  const player = platform === "win32" ? "powershell" : platform === "darwin" ? "afplay" : "aplay"
  const args =
    platform === "win32"
      ? ["-c", `Add-Type -AssemblyName System.Media; [System.Media.SoundPlayer]::new("${filePath.replace(/\\/g, "\\\\")}").PlaySync()`]
      : platform === "darwin"
        ? [filePath]
        : [filePath]

  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn(player, args, { stdio: "ignore" })
    proc.on("close", async (code) => {
      try {
        await fs.promises.unlink(filePath)
      } catch {
        // ignore cleanup errors
      }
      if (code === 0) resolve()
      else reject(new Error(`Audio playback exited with code ${code}`))
    })
    proc.on("error", reject)
  })
}
