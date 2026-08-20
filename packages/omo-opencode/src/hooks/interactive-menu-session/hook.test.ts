/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { clearInteractiveMenuSessionState } from "./storage"

let checkWindowExistsResult = true
let recreateCalled = false
let runTmuxCmd = ""
let killPanesCalled = false

mock.module("./state-manager", () => ({
  checkWindowExists: async (name: string) => checkWindowExistsResult,
  recreateMenuWindow: async (_sessionId: string) => {
    recreateCalled = true
    return true
  },
  runTmuxCommand: async (cmd: string) => {
    runTmuxCmd = cmd
    return { success: true, output: "" }
  },
  killAllTrackedMenuPanes: (_sessionId: string) => {
    killPanesCalled = true
  },
}))

mock.module("./storage", () => ({
  loadInteractiveMenuSessionState: (sessionId: string) => {
    if (sessionId === "ses_has_window") {
      return {
        sessionId,
        trackedPanes: [],
        lastActivity: Date.now(),
        windowName: "omo-menu-123",
        status: "open" as const,
        prompt: "Pick a color",
        options: ["Red", "Green", "Blue"],
      }
    }
    return null
  },
  saveInteractiveMenuSessionState: () => {},
  clearInteractiveMenuSessionState,
}))

const { createInteractiveMenuSessionHook } = await import("./hook")

function resetState() {
  checkWindowExistsResult = true
  recreateCalled = false
  runTmuxCmd = ""
  killPanesCalled = false
}

describe("createInteractiveMenuSessionHook", () => {
  beforeEach(() => {
    mock.restore()
    resetState()
  })

  afterEach(() => {
    mock.restore()
  })

  describe("chat.message handler", () => {
    test("#given session has open menu window #when window still exists #then does NOT call recreateMenuWindow", async () => {
      checkWindowExistsResult = true
      const hook = createInteractiveMenuSessionHook()
      await hook["chat.message"]({ sessionID: "ses_has_window" })
      expect(recreateCalled).toBe(false)
    })

    test("#given session has open menu window #when window was closed by user #then calls recreateMenuWindow", async () => {
      checkWindowExistsResult = false
      const hook = createInteractiveMenuSessionHook()
      await hook["chat.message"]({ sessionID: "ses_has_window" })
      expect(recreateCalled).toBe(true)
    })

    test("#given session has no state #when chat.message fires #then returns early without checking window", async () => {
      const hook = createInteractiveMenuSessionHook()
      await hook["chat.message"]({ sessionID: "ses_unknown" })
      expect(recreateCalled).toBe(false)
    })

    test("#given session with no sessionID #when chat.message fires #then returns early", async () => {
      const hook = createInteractiveMenuSessionHook()
      await hook["chat.message"]({ sessionID: undefined })
      expect(recreateCalled).toBe(false)
    })
  })

  describe("event: session.deleted handler", () => {
    test("#given session has menu window state #when session deleted #then kills tracked panes AND named window", async () => {
      const hook = createInteractiveMenuSessionHook()
      await hook["event"]({
        event: {
          type: "session.deleted",
          properties: { sessionID: "ses_has_window" },
        },
      })
      expect(killPanesCalled).toBe(true)
      expect(runTmuxCmd).toContain("tmux kill-window")
    })

    test("#given session has no state #when session deleted #then only kills tracked panes", async () => {
      const hook = createInteractiveMenuSessionHook()
      await hook["event"]({
        event: {
          type: "session.deleted",
          properties: { sessionID: "ses_unknown" },
        },
      })
      expect(killPanesCalled).toBe(true)
      expect(runTmuxCmd).toBe("")
    })

    test("#given event type is not session.deleted #when event fires #then does nothing", async () => {
      const hook = createInteractiveMenuSessionHook()
      await hook["event"]({
        event: {
          type: "session.created",
          properties: { sessionID: "ses_has_window" },
        },
      })
      expect(killPanesCalled).toBe(false)
      expect(runTmuxCmd).toBe("")
    })
  })
})
