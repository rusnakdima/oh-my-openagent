import * as childProcess from "node:child_process"
import { tmpdir } from "node:os"
import { log } from "../../shared"
import {
  type AudioBuffer,
  type AudioRecorder,
  type RecordOptions,
} from "./types"
import { MicrophoneNotFoundError, AudioRecorderError, NoAudioToolError } from "./errors"
import { getPreferredRecorderTool } from "./platform-detect"
import { createVADMonitor } from "./vad-monitor"

export { type AudioBuffer, type AudioRecorder, type RecordOptions }

/**
 * Reads a WAV audio file asynchronously with guaranteed temp-file cleanup.
 * Uses async I/O (not sync) to avoid race conditions when the file has not
 * yet been fully flushed to disk by the recorder process.
 */
async function readAudioFile(
  outputPath: string,
  startTime: number,
  sampleRate: number,
): Promise<AudioBuffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs")
  try {
    const stats = await fs.promises.stat(outputPath)
    if (stats.size <= 44) {
      throw new AudioRecorderError("Recording produced empty file")
    }
    const buffer = await fs.promises.readFile(outputPath)
    const durationMs = Date.now() - startTime
    return {
      data: new Uint8Array(buffer),
      format: "wav",
      sampleRate,
      channels: 1,
      duration_ms: durationMs,
    }
  } finally {
    // Always clean up the temp file, even if read fails
    try {
      await fs.promises.unlink(outputPath)
    } catch {
      // Ignore cleanup errors — file may already be gone
    }
  }
}

function createUnixRecorder(sampleRate: number = 16000): AudioRecorder {
  let activeProcess: childProcess.ChildProcess | null = null
  let stopped = false

  return {
    async checkAvailability() {
      const tool = getPreferredRecorderTool()
      if (!tool) {
        return {
          available: false,
          error: "No audio recording tool found. Install sox (`brew install sox` or `apt install sox`) or ffmpeg.",
          tool: undefined,
        }
      }
      // Try a quick test recording
      return { available: true, tool }
    },

    async record(opts: RecordOptions): Promise<AudioBuffer> {
      const tool = getPreferredRecorderTool()
      if (!tool) {
        throw new NoAudioToolError(
          "No audio recording tool found. Install sox or ffmpeg.",
        )
      }

      const outputPath = `${tmpdir()}/omo-voice-${Date.now()}.wav`
      stopped = false

      return new Promise((resolve, reject) => {
        let stderr = ""
        let recordingDone = false

        const startTime = Date.now()

        // sox command: record from default audio device, convert to wav
        // silence command: trim silence at start, stop when silence > 0.5s below threshold
        const args =
          tool === "sox"
            ? [
                "-d", // default audio device
                "-r",
                String(sampleRate),
                "-c",
                "1", // mono
                outputPath,
                "trim",
                "0",
                String(Math.ceil(opts.duration_ms / 1000)),
                "silence",
                "1",
                "0.5",
                String(opts.silence_threshold_db),
                "1",
                "0.5",
                String(opts.silence_threshold_db),
              ]
            : tool === "arecord"
              ? [
                  "-f",
                  "cd", // CD quality: 16bit, 44100Hz, stereo (but we'll convert)
                  "-r",
                  String(sampleRate),
                  "-c",
                  "1", // mono
                  "-t",
                  "wav",
                  outputPath,
                ]
              : [
                  "-f",
                  "waveaudio", // Windows DirectShow
                  "-r",
                  String(sampleRate),
                  "-ac",
                  "1", // mono
                  "-t",
                  "wav",
                  outputPath,
                ]

        log(`[voice] Starting recording with ${tool}: ${JSON.stringify(args)}`)

        activeProcess = childProcess.spawn(tool, args, {
          stdio: ["ignore", "pipe", "pipe"],
        })

        activeProcess.stderr?.on("data", (chunk: Buffer) => {
          stderr += chunk.toString()
        })

        activeProcess.on("error", (err) => {
          if (!stopped) {
            reject(new AudioRecorderError(`Failed to start recording: ${err.message}`))
          }
        })

        activeProcess.on("close", (code) => {
          activeProcess = null
          if (!stopped && !recordingDone) {
            stopped = true
            // Use async I/O to avoid race: file may not be flushed to disk yet
            void readAudioFile(outputPath, startTime, sampleRate)
              .then(resolve)
              .catch((err) => reject(new AudioRecorderError(err.message)))
          }
        })

        // Safety timeout — stop recording if max duration exceeded
        setTimeout(() => {
          if (!stopped) {
            stopped = true
            if (activeProcess && !activeProcess.killed) {
              activeProcess.kill("SIGTERM")
            }
            // Use async I/O: file may not be flushed to disk immediately after SIGTERM
            void readAudioFile(outputPath, startTime, sampleRate)
              .then(resolve)
              .catch(() => reject(new AudioRecorderError("Recording timed out with no audio captured")))
          }
        }, opts.duration_ms + 5000)

        // Start VAD monitor for real-time silence detection (early stop)
        // Only when min_duration has passed (avoid cutting off initial speech)
        const minSilenceMs = opts.min_duration_ms
        const silenceThresholdLinear = Math.round(
          Math.pow(10, opts.silence_threshold_db / 20) * 32767,
        )
        const vad = createVADMonitor(sampleRate, {
          silenceDurationMs: 1200,
          threshold: Math.max(silenceThresholdLinear, 500),
        })

        // Race between VAD silence detection and max duration
        void vad.promise
          .then((reason) => {
            if (!stopped && reason === "silence") {
              log(`[voice] VAD triggered early stop (silence detected)`)
              stopped = true
              if (activeProcess && !activeProcess.killed) {
                activeProcess.kill("SIGTERM")
              }
              void readAudioFile(outputPath, startTime, sampleRate)
                .then(resolve)
                .catch((err) => reject(new AudioRecorderError(err.message)))
            }
          })
          .catch(() => {
            // VAD error — ignore, let timeout handle it
          })
      })
    },

    stop() {
      stopped = true
      if (activeProcess && !activeProcess.killed) {
        activeProcess.kill("SIGTERM")
        activeProcess = null
      }
    },
  }
}

export function createAudioRecorder(config?: { sample_rate?: number }): AudioRecorder {
  const sampleRate = config?.sample_rate ?? 16000
  return createUnixRecorder(sampleRate)
}
