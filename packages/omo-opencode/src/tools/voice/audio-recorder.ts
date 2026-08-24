import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { log } from "../../shared";
import {
  type AudioBuffer,
  type AudioRecorder,
  type RecordOptions,
} from "./types";
import {
  AudioRecorderError,
  MicrophoneNotFoundError,
  NoAudioToolError,
} from "./errors";
import { getPreferredRecorderTool } from "./platform-detect";
import { createVADMonitor } from "./vad-monitor";

export { type AudioBuffer, type AudioRecorder, type RecordOptions };

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
  try {
    const stats = await fs.promises.stat(outputPath);
    if (stats.size <= 44) {
      throw new AudioRecorderError("Recording produced empty file");
    }
    const buffer = await fs.promises.readFile(outputPath);
    const durationMs = Date.now() - startTime;
    return {
      data: new Uint8Array(buffer),
      format: "wav",
      sampleRate,
      channels: 1,
      duration_ms: durationMs,
    };
  } finally {
    // Always clean up the temp file, even if read fails
    try {
      await fs.promises.unlink(outputPath);
    } catch {
      // Ignore cleanup errors — file may already be gone
    }
  }
}

function createUnixRecorder(sampleRate: number = 16000): AudioRecorder {
  let activeProcess: childProcess.ChildProcess | null = null;
  let vadHandle: {
    stop: () => void;
    promise: Promise<"silence" | "max_duration">;
  } | null = null;
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    async checkAvailability() {
      const tool = getPreferredRecorderTool();
      if (!tool) {
        return {
          available: false,
          error:
            "No audio recording tool found. Install sox (`brew install sox` or `apt install sox`) or ffmpeg.",
          tool: undefined,
        };
      }
      return { available: true, tool };
    },

    async record(opts: RecordOptions): Promise<AudioBuffer> {
      const tool = getPreferredRecorderTool();
      if (!tool) {
        throw new NoAudioToolError(
          "No audio recording tool found. Install sox or ffmpeg.",
        );
      }

      const outputPath = `${tmpdir()}/omo-voice-${randomUUID()}.wav`;

      return new Promise((resolve, reject) => {
        let settled = false;
        const startTime = Date.now();

        function settle(
          res: (buf: AudioBuffer) => void,
          rej: (err: Error) => void,
        ) {
          if (settled) return;
          settled = true;
          // CR-4: Clear safety timer on settle
          if (safetyTimer !== null) {
            clearTimeout(safetyTimer);
            safetyTimer = null;
          }
          // CR-5 + M-4: Stop VAD monitor on settle
          if (vadHandle !== null) {
            vadHandle.stop();
            vadHandle = null;
          }
        }

        // sox command: record from default audio device, convert to wav
        // silence command: trim silence at start, stop when silence > 0.5s below threshold
        const args = tool === "sox"
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
          ];

        log(`[voice] Starting recording with ${tool}: ${JSON.stringify(args)}`);

        activeProcess = childProcess.spawn(tool, args, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        activeProcess.on("error", (err) => {
          settle(() => {}, () => {});
          reject(
            new AudioRecorderError(`Failed to start recording: ${err.message}`),
          );
        });

        activeProcess.on("close", () => {
          activeProcess = null;
          // Only settle if we haven't already (VAD or timeout may have fired first)
          settle(() => {}, () => {});
          void readAudioFile(outputPath, startTime, sampleRate)
            .then(resolve)
            .catch((err) => reject(new AudioRecorderError(err.message)));
        });

        // Safety timeout — stop recording if max duration exceeded
        // CR-4: Store handle so we can clear it when recording ends early
        safetyTimer = setTimeout(() => {
          safetyTimer = null;
          if (activeProcess && !activeProcess.killed) {
            activeProcess.kill("SIGTERM");
          }
          // CR-5 + M-4: Stop VAD when timeout fires
          if (vadHandle !== null) {
            vadHandle.stop();
            vadHandle = null;
          }
          settle(() => {}, () => {});
          void readAudioFile(outputPath, startTime, sampleRate)
            .then(resolve)
            .catch(() =>
              reject(
                new AudioRecorderError(
                  "Recording timed out with no audio captured",
                ),
              )
            );
        }, opts.duration_ms + 5000);

        // Start VAD monitor for real-time silence detection (early stop)
        const silenceThresholdLinear = Math.round(
          Math.pow(10, opts.silence_threshold_db / 20) * 32767,
        );
        vadHandle = createVADMonitor(sampleRate, {
          silenceDurationMs: 1200,
          threshold: Math.max(silenceThresholdLinear, 500),
        });

        void vadHandle.promise
          .then((reason) => {
            if (reason === "silence") {
              log(`[voice] VAD triggered early stop (silence detected)`);
              if (activeProcess && !activeProcess.killed) {
                activeProcess.kill("SIGTERM");
              }
              settle(() => {}, () => {});
              void readAudioFile(outputPath, startTime, sampleRate)
                .then(resolve)
                .catch((err) => reject(new AudioRecorderError(err.message)));
            }
          })
          .catch(() => {
            // VAD error — ignore, let timeout handle it
          });
      });
    },

    stop() {
      // CR-4: Clear safety timer
      if (safetyTimer !== null) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      // CR-5 + M-4: Stop VAD monitor
      if (vadHandle !== null) {
        vadHandle.stop();
        vadHandle = null;
      }
      if (activeProcess && !activeProcess.killed) {
        activeProcess.kill("SIGTERM");
        activeProcess = null;
      }
    },
  };
}

export function createAudioRecorder(
  config?: { sample_rate?: number },
): AudioRecorder {
  const sampleRate = config?.sample_rate ?? 16000;
  return createUnixRecorder(sampleRate);
}
