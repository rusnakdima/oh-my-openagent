import { z } from "zod"

export const VoiceConfigSchema = z.object({
  /** Enable the voice input tool (default: false) */
  enabled: z.boolean().default(false),
  /** Default STT backend: "openai" | "cloudflare" | "local" */
  default_backend: z.enum(["openai", "cloudflare", "local"]).default("openai"),
  /** OpenAI Whisper API settings */
  openai: z
    .object({
      /** Model to use: "whisper-large-v3" | "whisper-large-v3-turbo" */
      model: z.enum(["whisper-large-v3", "whisper-large-v3-turbo"]).default("whisper-large-v3"),
      /** Language code (e.g. "en", "zh"). null = auto-detect */
      language: z.string().nullable().default(null),
      /** Temperature 0-1 */
      temperature: z.number().min(0).max(1).default(0),
    })
    .optional(),
  /** Cloudflare Workers AI Deepgram settings */
  cloudflare: z
    .object({
      /** Model: "@cf/deepgram/nova-3" | "@cf/deepgram/aura-2-en" */
      model: z
        .enum(["@cf/deepgram/nova-3", "@cf/deepgram/aura-2-en"])
        .default("@cf/deepgram/nova-3"),
      /** Language: "en" | "es" or auto */
      language: z.string().default("en"),
    })
    .optional(),
  /** Local faster-whisper settings */
  local: z
    .object({
      /** Path to faster-whisper executable or "auto" to detect */
      executable: z.string().default("auto"),
      /** Model: "tiny" | "base" | "small" | "medium" | "large-v3" */
      model: z.enum(["tiny", "base", "small", "medium", "large-v3"]).default("base"),
      /** Device: "cpu" | "cuda" */
      device: z.enum(["cpu", "cuda"]).default("cpu"),
    })
    .optional(),
  /** Audio capture settings */
  capture: z
    .object({
      /** Silence threshold in dB (below this is silence) */
      silence_threshold_db: z.number().default(-40),
      /** Max recording duration in seconds */
      max_duration_seconds: z.number().min(1).max(300).default(60),
      /** Min recording duration before VAD activates (seconds) */
      min_duration_seconds: z.number().min(0).max(10).default(1),
      /** Sample rate for capture */
      sample_rate: z.number().default(16000),
    })
    .default({ silence_threshold_db: -40, max_duration_seconds: 60, min_duration_seconds: 1, sample_rate: 16000 }),
})

export type VoiceConfig = z.infer<typeof VoiceConfigSchema>
