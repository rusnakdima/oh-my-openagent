import {
  type PluginInput,
  tool,
  type ToolDefinition,
} from "@opencode-ai/plugin";
import { SUPPORTED_BACKENDS, VOICE_DESCRIPTION } from "./constants";
import { log } from "../../shared";
import type { VoiceArgs, VoiceConfig } from "./types";
import { createAudioRecorder } from "./audio-recorder";
import { createSTTProvider } from "./stt-provider-factory";
import { injectTranscription } from "./session-injector";
import {
  MicrophoneNotFoundError,
  MicrophonePermissionDeniedError,
} from "./errors";

export { type VoiceArgs, type VoiceConfig };

export function createVoiceTool(
  ctx: PluginInput,
  config: VoiceConfig,
): ToolDefinition {
  return tool({
    description: VOICE_DESCRIPTION,
    args: {
      /** STT backend to use. Defaults to config default. */
      backend: tool.schema
        .enum(SUPPORTED_BACKENDS as unknown as [string, ...string[]])
        .optional()
        .describe(
          "Speech-to-text backend: openai (Whisper API), cloudflare (Workers AI Deepgram), or local (faster-whisper)",
        ),
      /** If true, record and transcribe immediately. If false, just check mic status. */
      record: tool.schema.boolean().default(true).describe(
        "Whether to record audio or just check microphone availability",
      ),
      /** Override the default recording duration in seconds. */
      duration_seconds: tool.schema
        .number()
        .min(1)
        .max(300)
        .optional()
        .describe("Maximum recording duration in seconds (default: 60)"),
    },
    async execute(rawArgs, toolContext) {
      const args = rawArgs as VoiceArgs;
      const backend =
        (args.backend ?? config.default_backend ?? "openai") as string;

      log(
        `[voice] Tool called with backend=${backend}, record=${
          rawArgs.record ?? true
        }`,
      );

      // Create recorder
      const recorder = createAudioRecorder({
        sample_rate: config.capture?.sample_rate,
      });

      // Check microphone availability
      const micStatus = await recorder.checkAvailability();
      if (!micStatus.available) {
        const error = micStatus.error ?? "Unknown error";
        if (error.includes("permission")) {
          return {
            title: "Microphone permission denied",
            output: new MicrophonePermissionDeniedError().message,
          };
        }
        return {
          title: "Microphone unavailable",
          output: new MicrophoneNotFoundError(error).message,
        };
      }

      if (rawArgs.record === false) {
        return {
          title: "Microphone ready",
          output:
            `Microphone ready. Recording tool: ${micStatus.tool}. Default backend: ${backend}.`,
        };
      }

      // Validate STT config
      const sttProvider = createSTTProvider(backend, config);
      const configValidation = sttProvider.validateConfig();
      if (!configValidation.valid) {
        const hint = backend === "openai"
          ? " Set OPENAI_API_KEY in your shell environment or config file."
          : backend === "cloudflare"
          ? " Set CF_API_TOKEN in your shell environment or config file."
          : " Install faster-whisper-cli (`pip install faster-whisper-cli`) or check the executable path in your config.";
        return {
          title: "STT not configured",
          output: `${
            configValidation.error ?? "Unknown configuration error"
          }.${hint}`,
        };
      }

      // Record audio
      const durationMs =
        (rawArgs.duration_seconds ?? config.capture?.max_duration_seconds ??
          60) * 1000;

      log(`[voice] Starting recording (max ${durationMs}ms)`);

      let audioBuffer;
      try {
        audioBuffer = await recorder.record({
          duration_ms: durationMs,
          silence_threshold_db: config.capture?.silence_threshold_db ?? -40,
          min_duration_ms: (config.capture?.min_duration_seconds ?? 1) * 1000,
        });
      } catch (recError) {
        log(`[voice] Recording error: ${recError}`);
        return {
          title: "Recording failed",
          output: recError instanceof Error
            ? recError.message
            : String(recError),
        };
      } finally {
        recorder.stop();
      }

      if (audioBuffer.data.length === 0) {
        return {
          title: "No audio captured",
          output:
            "No audio was captured. Try speaking louder or check your microphone.",
        };
      }

      log(
        `[voice] Recorded ${audioBuffer.data.length} bytes, ${audioBuffer.duration_ms}ms`,
      );

      // Transcribe with retry on transient failures
      const MAX_RETRIES = 2;
      let transcription = "";
      let lastTranscribeError: Error | null = null;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          transcription = await sttProvider.transcribe(audioBuffer);
          lastTranscribeError = null;
          break;
        } catch (transcribeError) {
          lastTranscribeError = transcribeError as Error;
          const isRetryable = [429, 500, 502, 503, 504].includes(
            (transcribeError as { status?: number }).status ?? 0,
          ) ||
            (transcribeError as Error).message?.includes("network");
          if (!isRetryable || attempt === MAX_RETRIES) break;
          const delayMs = 2 ** attempt * 500;
          log(
            `[voice] Transient transcription error (attempt ${attempt + 1}/${
              MAX_RETRIES + 1
            }), retrying in ${delayMs}ms`,
          );
          await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        }
      }
      if (lastTranscribeError !== null) {
        log(`[voice] Transcription error: ${lastTranscribeError}`);
        return {
          title: "Transcription failed",
          output: lastTranscribeError instanceof Error
            ? `Transcription failed: ${lastTranscribeError.message}`
            : `Transcription failed: ${String(lastTranscribeError)}`,
        };
      }

      if (!transcription.trim()) {
        return {
          title: "Empty transcription",
          output:
            "No speech detected. Try again with a clearer voice or longer recording.",
        };
      }

      // Inject into session
      try {
        await injectTranscription({
          client: ctx.client,
          sessionID: toolContext.sessionID,
          directory: toolContext.directory,
          text: transcription,
        });
      } catch (injectError) {
        log(`[voice] Injection error: ${injectError}`);
        // Still return the transcription even if injection failed
        return {
          title: "Voice input captured (injection failed)",
          output:
            `${transcription}\n\n[Warning: Could not auto-inject into session. Paste the above text manually.]`,
        };
      }

      return {
        title: "Voice input captured",
        output: transcription,
      };
    },
  });
}
