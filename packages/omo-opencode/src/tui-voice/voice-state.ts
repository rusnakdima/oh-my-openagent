import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { AudioBuffer, AudioRecorder, STTProvider, VoiceConfig } from "../tools/voice/types"
import { createAudioRecorder } from "../tools/voice/audio-recorder"
import { createSTTProvider } from "../tools/voice/stt-provider-factory"
import { injectTranscription } from "../tools/voice/session-injector"
import { log } from "../shared"

export type VoiceState = "idle" | "recording"

export interface TuiVoiceModule {
  readonly state: VoiceState
  /** Update session context before calling toggle(). */
  setSessionContext(sessionID: string, directory: string): void
  toggle(): void
  dispose(): void
}

export function createTuiVoiceModule(
  api: TuiPluginApi,
  voiceConfig: VoiceConfig,
): TuiVoiceModule {
  let state: VoiceState = "idle"
  let recorder: AudioRecorder | null = null
  let currentSessionID: string | null = null
  let currentDirectory: string | null = null
  let sttProvider: STTProvider | null = null
  let recordingPromise: Promise<AudioBuffer> | null = null
  let disposed = false

  const sampleRate = voiceConfig.capture?.sample_rate ?? 16000

  function setState(newState: VoiceState) {
    state = newState
    api.renderer.requestRender()
  }

  function setSessionContext(sessionID: string, directory: string) {
    currentSessionID = sessionID
    currentDirectory = directory
  }

  async function startRecording() {
    const route = api.route.current
    if (route.name !== "session") {
      log("[voice] Cannot start recording: not in a session")
      return
    }
    const params = route.params as { sessionID?: string } | undefined
    if (!params?.sessionID) {
      log("[voice] Cannot start recording: no session ID")
      return
    }

    currentSessionID = params.sessionID
    currentDirectory = api.state.path.directory

    const backend = voiceConfig.default_backend ?? "openai"
    try {
      sttProvider = createSTTProvider(backend, voiceConfig)
    } catch (err) {
      log(`[voice] Failed to create STT provider: ${err}`)
      return
    }

    recorder = createAudioRecorder({ sample_rate: sampleRate })

    const micStatus = await recorder.checkAvailability()
    if (!micStatus.available) {
      log(`[voice] Microphone unavailable: ${micStatus.error}`)
      void api.ui.toast({
        title: "Microphone unavailable",
        message: micStatus.error ?? "Check microphone permissions",
        variant: "error",
        duration: 4000,
      })
      return
    }

    setState("recording")

    const maxDurationMs = (voiceConfig.capture?.max_duration_seconds ?? 60) * 1000

    recordingPromise = recorder.record({
      duration_ms: maxDurationMs,
      silence_threshold_db: voiceConfig.capture?.silence_threshold_db ?? -40,
      min_duration_ms: (voiceConfig.capture?.min_duration_seconds ?? 1) * 1000,
    })
  }

  async function stopAndTranscribe(): Promise<void> {
    if (!recorder || state !== "recording") return

    recorder.stop()

    if (!currentSessionID || !currentDirectory) {
      setState("idle")
      return
    }

    setState("idle")

    if (!recordingPromise) return

    let audioBuffer: AudioBuffer | null = null
    try {
      audioBuffer = await recordingPromise
    } catch (err) {
      log(`[voice] Recording error: ${err}`)
      void api.ui.toast({
        title: "Recording error",
        message: err instanceof Error ? err.message : String(err),
        variant: "error",
        duration: 4000,
      })
      return
    } finally {
      recordingPromise = null
      recorder = null
    }

    if (!audioBuffer || audioBuffer.data.length === 0) {
      void api.ui.toast({
        title: "No audio captured",
        message: "Try speaking louder or check your microphone",
        variant: "warning",
        duration: 4000,
      })
      return
    }

    if (!sttProvider) return

    let transcription: string
    try {
      transcription = await sttProvider.transcribe(audioBuffer)
    } catch (err) {
      log(`[voice] Transcription error: ${err}`)
      void api.ui.toast({
        title: "Transcription failed",
        message: err instanceof Error ? err.message : String(err),
        variant: "error",
        duration: 4000,
      })
      return
    }

    if (!transcription.trim()) {
      void api.ui.toast({
        title: "No speech detected",
        message: "Try again with a clearer voice or longer recording",
        variant: "warning",
        duration: 4000,
      })
      return
    }

    log(`[voice] Transcription: "${transcription.substring(0, 50)}..."`)

    // Inject into session with enqueue (queue up if busy)
    try {
      await injectTranscription({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client: api.client as any,
        sessionID: currentSessionID,
        directory: currentDirectory,
        text: transcription,
        queueBehavior: "enqueue",
      })
    } catch (err) {
      log(`[voice] Injection error: ${err}`)
      void api.ui.toast({
        title: "Voice input captured",
        message: `${transcription}\n\n[Could not auto-inject — paste manually]`,
        variant: "warning",
        duration: 6000,
      })
    }
  }

  function toggle() {
    if (disposed) return
    if (state === "idle") {
      void startRecording()
    } else {
      void stopAndTranscribe()
    }
  }

  function dispose() {
    disposed = true
    if (recorder) {
      recorder.stop()
      recorder = null
    }
    setState("idle")
  }

  return {
    get state() {
      return state
    },
    setSessionContext,
    toggle,
    dispose,
  }
}
