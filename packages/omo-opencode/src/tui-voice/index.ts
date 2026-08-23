import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createTuiVoiceModule, type TuiVoiceModule } from "./voice-state"
import { createVoiceIndicator } from "./tui-voice-indicator"
import { log } from "../shared"

export { type TuiVoiceModule, type VoiceState } from "./voice-state"

/**
 * Sets up push-to-talk voice mode in the OpenCode TUI.
 * Call this from the TUI plugin entry point (tui.ts).
 *
 * Registers:
 * - A keybinding (meta+v on macOS, ctrl+shift+v elsewhere) that toggles recording
 * - A voice indicator in the session_prompt_right slot (shows mic icon while recording)
 */
export async function setupTuiVoice(api: TuiPluginApi): Promise<TuiVoiceModule> {
  const solid = await import("@opentui/solid").catch(() => null)
  if (!solid) {
    log("[voice] TUI voice indicator unavailable: @opentui/solid not found")
    return {
      get state() {
        return "idle" as const
      },
      setSessionContext() {},
      toggle() {},
      dispose() {},
    }
  }

  // Access voice config from the plugin config
  // api.state.config is Frozen<TuiConfigView> which includes the full plugin config
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tuiConfig = api.state.config as any
  const voiceConfig = tuiConfig?.voice ?? {}

  const voice = createTuiVoiceModule(api, voiceConfig)

  // Register the voice indicator in the session prompt (top-right area).
  // IMPORTANT: Pass the function REFERENCE (not an IIFE result) so the TUI calls
  // it on each render cycle and re-evaluates voice.state dynamically.
  // This matches the pattern used by sidebar_content in tui.ts:
  //   sidebar_content: renderSidebar  (function reference, NOT renderSidebar())
  api.slots.register({
    order: 800,
    slots: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session_prompt_right: () =>
        createVoiceIndicator(solid, voice.state) as any,
    },
  })

  // Register platform-specific push-to-talk keybinding
  // - macOS: meta+v (Ctrl+Shift+V = Terminal paste conflict)
  // - Windows/Linux: ctrl+shift+v (cross-platform, no conflict in standard terminals)
  const platform = api.keymap.getHostMetadata().platform
  const voiceShortcut = platform === "macos" ? "meta+v" : "ctrl+shift+v"
  const pluginDirectory = api.state.path.directory

  const unregisterKeymap = api.keymap.registerLayer({
    bindings: [
      {
        key: voiceShortcut,
        cmd: "voice.ptt",
      },
    ],
    commands: [
      {
        name: "voice.ptt",
        run: () => {
          // Only work inside an active session
          const route = api.route.current
          if (route.name !== "session") return
          const params = route.params as { sessionID?: string; directory?: string } | undefined
          if (!params?.sessionID) return
          // Update session context for the voice module
          voice.setSessionContext(params.sessionID, params.directory ?? pluginDirectory)
          voice.toggle()
        },
      },
    ],
  })

  api.lifecycle.onDispose(() => {
    voice.dispose()
    unregisterKeymap()
  })

  return voice
}
