import type { PluginInput } from "@opencode-ai/plugin"
import { dispatchInternalPrompt, isInternalPromptDispatchAccepted } from "../../shared/prompt-async-gate"
import { log } from "../../shared"
import { SessionInjectionError } from "./errors"

interface InjectTranscriptionOptions {
  client: PluginInput["client"]
  sessionID: string
  directory: string
  text: string
  /** "enqueue" = wait in queue if busy, "defer" = skip if busy (default) */
  queueBehavior?: "enqueue" | "defer"
}

export async function injectTranscription(opts: InjectTranscriptionOptions): Promise<void> {
  log(`[voice] Injecting transcription into session ${opts.sessionID}: "${opts.text.substring(0, 50)}..."`)

  const result = await dispatchInternalPrompt({
    mode: "async",
    client: opts.client,
    sessionID: opts.sessionID,
    source: "voice-input",
    dedupeKey: `voice:${opts.sessionID}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    postDispatchHoldMs: 2000,
    queueBehavior: opts.queueBehavior ?? "defer",
    queueRetryMs: 5000,
    input: {
      path: { id: opts.sessionID },
      body: {
        parts: [{ type: "text", text: opts.text }],
      },
      query: { directory: opts.directory },
    },
  })

  if (!isInternalPromptDispatchAccepted(result)) {
    throw new SessionInjectionError(
      `dispatchInternalPrompt returned status: ${result.status}`,
    )
  }

  log(`[voice] Transcription injected successfully`)
}
