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
 * Creates a Voice Activity Detection monitor that watches a WAV file being written
 * by the recorder process and signals when silence has been detected for the
 * configured duration.
 *
 * This runs as a separate process using `sox -n` which reads audio from the
 * same device and monitors levels. When silence persists for `silenceDurationMs`,
 * the returned promise resolves and the caller should stop the recorder.
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

  // Use sox -n to monitor input levels in real-time
  // -t wav because we're reading from a pipe (not a real device)
  const proc = childProcess.spawn(
    "sox",
    [
      "-t", "waveaudio", // device type (works on Windows; on Unix use -d for default device)
      "-r", String(sampleRate),
      "-c", "1",
      "-t", "wav",
      "/dev/null", // output to null
      "stat", // output level statistics
      "-terse", // one-line output
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  )

  let silenceStart: number | null = null
  let lastLevel = 0

  proc.stderr?.on("data", (chunk: Buffer) => {
    if (stopped) return
    const line = chunk.toString()

    // sox stat -terse outputs "Hostname: ...\n" followed by level lines
    // The "Maximum amplitude" line tells us the current audio level
    if (line.includes("Maximum amplitude")) {
      const match = line.match(/Maximum amplitude:\s*([\d.]+)/)
      if (match) {
        const amplitude = parseFloat(match[1])
        // Convert to 0-32767 range
        lastLevel = Math.round(amplitude * 32767)
      }
    } else if (line.includes("RMS level")) {
      const match = line.match(/RMS level:\s*([\-\d.]+)/)
      if (match) {
        const db = parseFloat(match[1])
        // Approximate linear level from dB
        lastLevel = Math.round(Math.pow(10, db / 20) * 32767)
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
  })

  proc.on("error", (err) => {
    if (!stopped) {
      stopped = true
      rejectVAD(new AudioRecorderError(`VAD monitor error: ${err.message}`))
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
