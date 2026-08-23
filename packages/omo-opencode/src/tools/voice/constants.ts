export const VOICE_DESCRIPTION =
  "Capture voice input from microphone and transcribe it to text. " +
  "Requires `voice.enabled: true` in config. " +
  "Supports OpenAI Whisper API, Cloudflare Workers AI (Deepgram), or local faster-whisper. " +
  "Hold-to-record: starts capturing on tool call, stops on silence or max duration. " +
  "Transcribed text is injected as a user message into the session.";

export const SUPPORTED_BACKENDS = ["openai", "cloudflare", "local"] as const;

export type SupportedBackend = (typeof SUPPORTED_BACKENDS)[number];
