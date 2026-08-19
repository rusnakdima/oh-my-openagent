import { killAllTrackedMenuPanes } from "./state-manager"
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

export function createInteractiveMenuSessionHook() {
  return {
    async "tool.execute.after"(input: ToolExecuteAfterInput, output: ToolExecuteAfterOutput) {
      if (input.tool !== "interactive_menu" || !input.sessionID) return
      // Track panes created by this tool - cleanup handled in tool's finally block
      void input
      void output
    },
    async "event"(input: EventInput) {
      const props = input.event.properties
      if (input.event.type === "session.deleted" && props?.sessionID) {
        const sessionId = props.sessionID as string
        killAllTrackedMenuPanes(sessionId)
      }
    },
  }
}
