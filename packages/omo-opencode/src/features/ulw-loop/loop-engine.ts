/**
 * ULW Loop Engine
 *
 * Provides the session idle handler that drives persistent per-session goal continuation.
 * While a goal is `active`, each session.idle re-injects a continuation prompt.
 * This module is the shared engine consumed by the `goal` session hook.
 */
import { dispatchInternalPrompt, isInternalPromptDispatchAccepted } from "../../shared/prompt-async-gate"
import type { Goal } from "../../hooks/goal/types"
import { buildContinuationPrompt } from "../../hooks/goal/prompt"

const HOOK_NAME = "goal"
const SETTLE_MS = 150

export type UlwLoopEngineOptions = {
  readonly client: unknown
  readonly sessionID: string
}

const inFlightContinuations = new Set<string>()

export function createUlwLoopEngine() {
  return {
    dispatchIdleContinuation(
      sessionID: string,
      goal: Goal,
      client: unknown,
    ): void {
      if (goal === null || goal.status !== "active") return
      if (inFlightContinuations.has(sessionID)) return

      inFlightContinuations.add(sessionID)
      dispatchPrompt(sessionID, goal, client).finally(() => {
        inFlightContinuations.delete(sessionID)
      })
    },

    cancelContinuations(sessionID: string): void {
      inFlightContinuations.delete(sessionID)
    },
  }
}

async function dispatchPrompt(sessionID: string, goal: Goal, client: unknown): Promise<void> {
  const promptText = buildContinuationPrompt(goal)
  const result = await dispatchInternalPrompt({
    mode: "async",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: client as any,
    sessionID,
    source: `${HOOK_NAME}:idle-continuation`,
    settleMs: SETTLE_MS,
    queueBehavior: "defer",
    input: {
      path: { id: sessionID },
      body: {
        parts: [{ type: "text", text: promptText }],
      },
    },
  })
  if (result.status === "failed" && !isInternalPromptDispatchAccepted(result)) {
    // Log only — the dispatch may still have been accepted by another route.
    // eslint-disable-next-line no-console
    console.warn(`[${HOOK_NAME}] Idle continuation dispatch failed`, result.error)
  }
}
