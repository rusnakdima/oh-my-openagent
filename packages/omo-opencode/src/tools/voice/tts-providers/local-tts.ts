import * as childProcess from "node:child_process"
import { log } from "../../../shared"
import type { TTSProvider } from "./types"

interface LocalTTSConfig {
  backend: "espeak" | "say" | "edge-tts"
  voice: string
  speed: number
}

export function createLocalTTSProvider(config: LocalTTSConfig): TTSProvider {
  return {
    name: "local-tts",
    validateConfig() {
      const tool = config.backend === "say" ? "say" : "espeak"
      try {
        childProcess.execFileSync("which", [tool], { stdio: "ignore" })
        return { valid: true }
      } catch {
        return {
          valid: false,
          error: `${tool} not found. ${config.backend === "say" ? "macOS 'say' command is built-in." : "Install espeak (apt install espeak or brew install espeak)."}`,
        }
      }
    },
    async speak(text: string): Promise<void> {
      return new Promise((resolve, reject) => {
        const platform = process.platform
        let proc: childProcess.ChildProcess

        if (config.backend === "say") {
          // macOS built-in say command
          proc = childProcess.spawn("say", ["-v", config.voice, text], { stdio: "ignore" })
        } else if (config.backend === "espeak") {
          // Linux espeak
          proc = childProcess.spawn(
            "espeak",
            ["-v", config.voice, "-s", String(config.speed), text],
            { stdio: "ignore" },
          )
        } else {
          // edge-tts (Python)
          proc = childProcess.spawn(
            "edge-tts",
            ["--voice", config.voice, "--text", text, "--play"],
            { stdio: "ignore" },
          )
        }

        proc.on("close", (code) => {
          if (code === 0) resolve()
          else reject(new Error(`Local TTS playback exited with code ${code ?? "unknown"}`))
        })
        proc.on("error", reject)
      })
    },
  }
}
