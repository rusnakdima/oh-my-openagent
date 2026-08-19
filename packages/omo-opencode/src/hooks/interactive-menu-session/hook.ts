import { killAllTrackedMenuPanes, recreateMenuWindow, checkWindowExists, updateMenuWindowStatus } from "./state-manager"
import { loadInteractiveMenuSessionState } from "./storage"
import { OMO_MENU_PANE_PREFIX } from "./constants"

interface ToolExecuteAfterInput {
  tool: string
  sessionID?: string
  args?: Record<string, unknown>
}

interface ToolExecuteAfterOutput {
  title: string
  output: string
  metadata?: unknown
}

interface EventInput {
  event: {
    type: string
    properties?: Record<string, unknown>
  }
}

interface ChatMessageInput {
  sessionID?: string
  message?: unknown
}

export function createInteractiveMenuSessionHook() {
  return {
    async "chat.message"(input: ChatMessageInput) {
      if (!input.sessionID) return

      // Check if there's an open menu window for this session
      const state = loadInteractiveMenuSessionState(input.sessionID)
      if (!state || !state.windowName || state.status !== "open") return

      // Check if window still exists
      const exists = await checkWindowExists(state.windowName)
      if (!exists) {
        // Window was closed by user — recreate it
        state.status = "closed"
        await recreateMenuWindow(input.sessionID)
      }
    },

    async "tool.execute.after"(input: ToolExecuteAfterInput, _output: ToolExecuteAfterOutput) {
      if (input.tool !== "interactive_menu" || !input.sessionID) return
      // Window lifecycle is managed by the tool itself via JSON state.
      // Hook's job is to monitor and recreate closed windows (handled in chat.message).
    },

    async "event"(input: EventInput) {
      const props = input.event.properties
      if (input.event.type === "session.deleted" && props?.sessionID) {
        const sessionId = props.sessionID as string
        killAllTrackedMenuPanes(sessionId)

        // Also kill the named menu window if it exists
        const state = loadInteractiveMenuSessionState(sessionId)
        if (state?.windowName) {
          const { spawn } = require("bun")
          try {
            spawn({
              cmd: ["/bin/bash", "-c", `tmux kill-window -t '${state.windowName}' 2>/dev/null || true`],
              stdout: "pipe",
              stderr: "pipe",
            })
          } catch { /* best effort */ }
        }
      }
    },
  }
}
