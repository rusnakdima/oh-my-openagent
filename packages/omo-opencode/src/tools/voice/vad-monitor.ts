import * as childProcess from "node:child_process"
import { log } from "../../shared"
import { AudioRecorderError } from "./errors"

export interface VADOptions {
  /** Duration in ms of silence to trigger stop (default: 1500ms) */
  silenceDurationMs?: number
  /** Audio level threshold (0-32767, default: 2000) */
  threshold?: number
}

/**
 * Creates a Voice Activity Detection monitor that watches audio input levels
 * in real-time and signals when silence has been detected for the
 * configured duration.
 *
 * Uses `sox <device> -p stat -terse` which continuously streams audio level
 * statistics to stderr while the device is capturing. On Windows, use
 * waveaudio device type; on Unix/macOS, use -d for default input device.
 * Falls back to max_duration if sox is not available.
 */
export function createVADMonitor(
  sampleRate: number,
  opts: VADOptions = {},
): { stop: () => void; promise: Promise<"silence" | "max_duration"> } {
  const silenceDurationMs = opts.silenceDurationMs ?? 1500
  const threshold = opts.threshold ?? 2000

  let stopped = false
  let resolveVAD: (reason: "silence" | "max_duration") => void
  let rejectVAD: (err: Error) => void

  const promise = new Promise<"silence" | "max_duration">((resolve, reject) => {
    resolveVAD = resolve
    rejectVAD = reject
  })

  // Platform-specific input device flag
  const isWindows = process.platform === "win32"
  const inputDevice: string[] = isWindows
    ? ["-t", "waveaudio"]
    : ["-d"] // -d = default input device on Linux/macOS

  // H-1: Force English output from sox so regex patterns match on all locales
  const procEnv = { ...process.env, LC_ALL: "C" }

  const proc = childProcess.spawn(
    "sox",
    [
      ...inputDevice,
      "-r", String(sampleRate),
      "-c", "1",
      "-p", // pipe output (required for continuous stat streaming)
      "stat", // output level statistics continuously
      "-terse", // one-line per stats output
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      // H-1: Force C locale so sox always outputs English-level markers
      env: procEnv,
    },
  )

  let silenceStart: number | null = null
  let lastLevel = 0

  // Collect partial stderr lines
  let stderrBuffer = ""

  proc.stderr?.on("data", (chunk: Buffer) => {
    if (stopped) return
    stderrBuffer += chunk.toString()

    // sox stat -terse outputs one stats block per read cycle.
    // Each block starts with "Samples amplitude:" or "Maximum amplitude".
    // Lines look like: "Maximum amplitude: 0.123456" or "RMS level: -12.345 dB"
    while (stderrBuffer.includes("\n")) {
      const newlineIdx = stderrBuffer.indexOf("\n")
      const line = stderrBuffer.slice(0, newlineIdx)
      stderrBuffer = stderrBuffer.slice(newlineIdx + 1)

      // sox stat -terse uses "Samples amplitude:" not "Maximum amplitude:"
      if (line.includes("Samples amplitude")) {
        const match = line.match(/Samples amplitude:\s*([\d.]+)/)
        if (match) {
          const amplitude = parseFloat(match[1])
          // H-2: NaN guard — parseFloat can produce NaN on localized decimal separators
          lastLevel = Number.isNaN(amplitude) ? 0 : Math.round(amplitude * 32767)
        }
      } else if (line.includes("Maximum amplitude")) {
        const match = line.match(/Maximum amplitude:\s*([\d.]+)/)
        if (match) {
          const amplitude = parseFloat(match[1])
          lastLevel = Number.isNaN(amplitude) ? 0 : Math.round(amplitude * 32767)
        }
      } else if (line.includes("RMS level")) {
        const match = line.match(/RMS level:\s*([\-\d.]+)/)
        if (match) {
          const db = parseFloat(match[1])
          // H-2: NaN guard — parseFloat("0,123") → NaN on German/French locale
          lastLevel = Number.isNaN(db) ? 0 : Math.round(Math.pow(10, db / 20) * 32767)
        }
      }

      if (lastLevel < threshold) {
        if (silenceStart === null) {
          silenceStart = Date.now()
        } else if (Date.now() - silenceStart >= silenceDurationMs) {
          if (!stopped) {
            stopped = true
            try {
              proc.kill()
            } catch {
              // ignore
            }
            log(`[voice] VAD detected silence (${silenceDurationMs}ms threshold)`)
            resolveVAD("silence")
          }
        }
      } else {
        silenceStart = null // reset on sound
      }
    }
  })

  proc.on("error", (err) => {
    if (!stopped) {
      stopped = true
      // sox not installed or not on PATH — fall back to max_duration
      log(`[voice] VAD monitor unavailable: ${err.message}. Relying on max_duration timeout.`)
      resolveVAD("max_duration")
    }
  })

  proc.on("close", (code) => {
    if (!stopped) {
      stopped = true
      // Process exited without triggering VAD
      resolveVAD("max_duration")
    }
  })

  return {
    stop() {
      if (!stopped) {
        stopped = true
        try {
          proc.kill()
        } catch {
          // ignore
        }
        resolveVAD("max_duration")
      }
    },
    promise,
  }
}
