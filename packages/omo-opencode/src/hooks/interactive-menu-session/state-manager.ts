import { loadInteractiveMenuSessionState, saveInteractiveMenuSessionState, type InteractiveMenuSessionState } from "./storage"
import { OMO_MENU_PANE_PREFIX } from "./constants"

export function getOrCreateMenuState(sessionId: string): InteractiveMenuSessionState {
  const existing = loadInteractiveMenuSessionState(sessionId)
  if (existing) return existing
  const state: InteractiveMenuSessionState = {
    sessionId,
    trackedPanes: [],
    lastActivity: Date.now(),
  }
  saveInteractiveMenuSessionState(sessionId, state)
  return state
}

export function killAllTrackedMenuPanes(sessionId: string): void {
  const state = loadInteractiveMenuSessionState(sessionId)
  if (!state) return
  for (const pane of state.trackedPanes) {
    if (pane.startsWith(OMO_MENU_PANE_PREFIX)) {
      try {
        const { spawn } = require("bun")
        spawn({ cmd: ["/bin/bash", "-c", `tmux kill-session -t '${pane}' 2>/dev/null || true`], stdout: "pipe", stderr: "pipe" })
      } catch { /* best effort */ }
    }
  }
}
