export interface TTSProvider {
  readonly name: string
  speak(text: string): Promise<void>
  validateConfig(): { valid: boolean; error?: string }
}

export interface TTSConfig {
  enabled: boolean
  default_backend: "openai" | "local"
  openai?: {
    model: "gpt-4o-mini-tts" | "tts-1" | "tts-1-hd"
    voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"
    format: "mp3" | "opus" | "aac" | "flac"
    speed: number
  }
  local?: {
    backend: "espeak" | "say" | "edge-tts"
    voice: string
    speed: number
  }
}
