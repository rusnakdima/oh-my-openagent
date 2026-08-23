export class VoiceInputError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "VoiceInputError";
    this.code = code;
  }
}

export class MicrophoneNotFoundError extends VoiceInputError {
  constructor(details: string) {
    super(
      `Microphone not found. ${details}. Ensure a microphone is connected and permissions are granted.`,
      "MICROPHONE_NOT_FOUND",
    );
    this.name = "MicrophoneNotFoundError";
  }
}

export class MicrophonePermissionDeniedError extends VoiceInputError {
  constructor() {
    super(
      "Microphone permission denied. Grant microphone access in your system settings.",
      "MICROPHONE_PERMISSION_DENIED",
    );
    this.name = "MicrophonePermissionDeniedError";
  }
}

export class AudioRecorderError extends VoiceInputError {
  constructor(message: string) {
    super(`Audio recording failed: ${message}`, "AUDIO_RECORDER_ERROR");
    this.name = "AudioRecorderError";
  }
}

export class STTError extends VoiceInputError {
  readonly backend: string;
  constructor(message: string, backend: string) {
    super(message, "STT_ERROR");
    this.name = "STTError";
    this.backend = backend;
  }
}

export class STTConfigError extends VoiceInputError {
  readonly backend: string;
  constructor(message: string, backend: string) {
    super(message, "STT_CONFIG_ERROR");
    this.name = "STTConfigError";
    this.backend = backend;
  }
}

export class SessionInjectionError extends VoiceInputError {
  constructor(message: string) {
    super(
      `Failed to inject voice transcription into session: ${message}`,
      "SESSION_INJECTION_ERROR",
    );
    this.name = "SessionInjectionError";
  }
}

export class NoAudioToolError extends VoiceInputError {
  constructor(details: string) {
    super(
      `No audio recording tool available. ${details}. Install sox (recommended) or ensure ffmpeg is on PATH.`,
      "NO_AUDIO_TOOL",
    );
    this.name = "NoAudioToolError";
  }
}
