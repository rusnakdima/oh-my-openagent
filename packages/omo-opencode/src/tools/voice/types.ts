import type { VoiceConfig } from "../../config/schema/voice";
import type { SupportedBackend } from "./constants";

export type { VoiceConfig };

export interface VoiceArgs {
  /** STT backend to use. Defaults to config default. */
  backend?: SupportedBackend;
  /** If true, record and transcribe. If false, just check mic status. */
  record?: boolean;
  /** Override the default recording duration in seconds. */
  duration_seconds?: number;
}

export interface AudioBuffer {
  data: Uint8Array;
  format: "wav";
  sampleRate: number;
  channels: number;
  duration_ms: number;
}

export interface RecordOptions {
  duration_ms: number;
  silence_threshold_db: number;
  min_duration_ms: number;
}

export interface AudioRecorder {
  checkAvailability(): Promise<
    { available: boolean; error?: string; tool?: string }
  >;
  record(opts: RecordOptions): Promise<AudioBuffer>;
  stop(): void;
}

export interface STTProvider {
  readonly name: string;
  transcribe(audio: AudioBuffer): Promise<string>;
  validateConfig(): { valid: boolean; error?: string };
}
