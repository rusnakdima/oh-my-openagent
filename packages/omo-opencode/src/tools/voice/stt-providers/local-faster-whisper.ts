import * as childProcess from "node:child_process"
import * as fs from "node:fs"
import { tmpdir } from "node:os"
import { randomUUID } from "node:crypto"
import { log } from "../../../shared"
import type { AudioBuffer, STTProvider } from "./types"

interface LocalFasterWhisperConfig {
  executable: string
  model: "tiny" | "base" | "small" | "medium" | "large-v3"
  device: "cpu" | "cuda"
}

export function createLocalFasterWhisperProvider(config: LocalFasterWhisperConfig): STTProvider {
  function findExecutableSync(): string | null {
    if (config.executable !== "auto") {
      return config.executable
    }
    // Try to find faster-whisper CLI on PATH
    try {
      const stdout = childProcess.execFileSync("which", ["faster-whisper-cli"], {
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      })
      return stdout.toString().trim() || null
    } catch {
      return null
    }
  }

  return {
    name: "local-faster-whisper",
    validateConfig() {
      return { valid: true } // Always valid, will fail at transcribe time if not available
    },
    async transcribe(audio: AudioBuffer): Promise<string> {
      const executable = findExecutableSync()
      if (!executable) {
        throw new Error(
          "faster-whisper CLI not found. Install with: pip install faster-whisper (or set voice.local.executable to the binary path)",
        )
      }

      // Write audio to a temp file for faster-whisper to process
      const tmpWav = `${tmpdir()}/omo-voice-${randomUUID()}.wav`
      await Bun.write(tmpWav, audio.data)

      log(`[voice] Transcribing via local faster-whisper (${config.model})`)

      try {
        const stdout = childProcess.execFileSync(executable, [
          tmpWav,
          "--model",
          config.model,
          "--device",
          config.device,
          "--output-json",
        ], {
          timeout: 120000,
          stdio: ["pipe", "pipe", "pipe"],
        })

        const result = JSON.parse(stdout.toString().trim()) as { text?: string }
        if (!result.text) {
          throw new Error("faster-whisper returned empty transcription")
        }

        return result.text.trim()
      } finally {
        // Cleanup temp file — delete, not truncate
        try {
          await fs.promises.unlink(tmpWav)
        } catch {
          // ignore cleanup errors
        }
      }
    },
  }
}
