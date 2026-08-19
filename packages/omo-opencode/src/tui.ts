import type { Renderable, TuiPluginModule } from "@opencode-ai/plugin/tui"

import { computeView, viewKey } from "./features/tui-sidebar/compute-view"
import { POLL_INTERVAL_MS } from "./features/tui-sidebar/constants"
import { deriveAgents, deriveConfig, deriveJobBoard, deriveLoop, deriveRoster } from "./features/tui-sidebar/derivers"
import type { ViewNode } from "./features/tui-sidebar/element-helpers"
import { readMirror } from "./features/tui-sidebar/mirror-io"
import { buildViewNodes } from "./features/tui-sidebar/render-view"
import type { ModelPickerModalState, RosterRow } from "./features/tui-sidebar/state-types"
import type { SidebarView } from "./features/tui-sidebar/state-types"
import { log } from "./shared/logger"
import { setupTuiVoice } from "./tui-voice/index"

type SolidRuntime<Node> = {
  readonly createElement: (tag: string) => Node
  readonly insert: (parent: Node, child: Node | string) => unknown
  readonly setProp: (node: Node, name: string, value: unknown) => unknown
}

type SidebarSlotRegistration<Node> = {
  readonly order: number
  readonly slots: {
    readonly sidebar_content: () => Node
  }
}

type RegisterSidebarContentSlotInput<Node> = {
  readonly registerSlot: (registration: SidebarSlotRegistration<Node>) => void
  readonly requestRender: () => void
  readonly renderSidebar: () => Node
}

function registerSidebarContentSlot<Node>({
  registerSlot,
  requestRender,
  renderSidebar,
}: RegisterSidebarContentSlotInput<Node>): void {
  registerSlot({
    order: 900,
    slots: {
      sidebar_content: renderSidebar,
    },
  })
  requestRender()
}

function materialize<Node>(nodes: readonly ViewNode[], solid: SolidRuntime<Node>): Node {
  const root = solid.createElement("box")
  solid.setProp(root, "flexDirection", "column")
  for (const node of nodes) {
    solid.insert(root, materializeNode(node, solid))
  }
  return root
}

function materializeNode<Node>(node: ViewNode, solid: SolidRuntime<Node>): Node {
  const element = solid.createElement(node.kind)
  for (const [name, value] of Object.entries(node.props)) {
    solid.setProp(element, name, value)
  }
  if (node.kind === "text") {
    solid.insert(element, node.text ?? "")
  }
  for (const child of node.children ?? []) {
    solid.insert(element, materializeNode(child, solid))
  }
  return element
}

type RosterResolver = (
  directory: string,
  tuiSelectedModel?: { providerID: string; modelID: string },
  perAgentModels?: Record<string, { providerID: string; modelID: string }>,
) => RosterRow[]
type PluginValidation = {
  readonly valid: boolean
  readonly messages: readonly string[]
  readonly config: {
    readonly tui?: {
      readonly sidebar?: {
        readonly enabled?: boolean
      }
    }
  }
}

async function loadPluginValidation(directory: string): Promise<PluginValidation> {
  const { validatePluginConfig } = await import("./config/validate")
  return validatePluginConfig(directory)
}

async function loadRosterRows(
  directory: string,
  tuiSelectedModel?: { providerID: string; modelID: string },
  perAgentModels?: Record<string, { providerID: string; modelID: string }>,
): Promise<readonly RosterRow[]> {
  const { resolveRoster } = await import("./features/tui-sidebar/roster-resolver")
  const resolver: RosterResolver = resolveRoster
  return resolver(directory, tuiSelectedModel, perAgentModels)
}

async function readView(
  directory: string,
  modal: ModelPickerModalState,
  availableModels: Array<{ providerID: string; modelID: string; label: string }>,
): Promise<SidebarView> {
  const validation = await loadPluginValidation(directory)
  const mirror = readMirror(directory)
  const roster = await loadRosterRows(
    directory,
    mirror?.tuiSelectedModel ?? undefined,
    mirror?.perAgentModels ?? undefined,
  )
  return computeView({
    config: deriveConfig(validation),
    roster: deriveRoster(roster),
    agents: deriveAgents(mirror),
    jobs: deriveJobBoard(mirror),
    loop: deriveLoop(mirror),
    modal,
    availableModels,
  })
}

// Available models for the modal picker - read from OpenCode's model cache
function getAvailableModels(): Array<{ providerID: string; modelID: string; label: string }> {
  try {
    const { getModelCacheState } = require("./shared/model-cache-state")
    const cache = getModelCacheState()
    if (!cache) return []
    const models: Array<{ providerID: string; modelID: string; label: string }> = []
    for (const [key, value] of Object.entries(cache)) {
      if (key.includes("/") && typeof value === "object" && value !== null) {
        const [providerID, modelID] = key.split("/")
        models.push({ providerID, modelID, label: modelID })
      }
    }
    // Sort by modelID for consistent display
    models.sort((a, b) => a.modelID.localeCompare(b.modelID))
    return models
  } catch {
    return []
  }
}

// Find the roster row at a given click index
function findRosterRowAtIndex(
  rows: readonly RosterRow[],
  index: number,
): { agentName: string; model: string } | null {
  // Index 0 = "Models" section header, 1..N = rows, N+1 = "Set Global Model"
  const rowIndex = index - 1
  if (rowIndex >= 0 && rowIndex < rows.length) {
    return { agentName: rows[rowIndex].label, model: rows[rowIndex].effectiveModel }
  }
  return null
}

export function handleTuiPollError(
  error: unknown,
  reportPollError: (error: Error) => void = (pollError) => log("[tui-sidebar] polling failed", { error: pollError }),
): void {
  if (error instanceof Error) {
    reportPollError(error)
    return
  }
  throw error
}

const module: TuiPluginModule = {
  id: "oh-my-openagent:tui",
  tui: async (api) => {
    const solid = await import("@opentui/solid").catch(() => null)
    if (!solid) {
      return
    }

    const directory = api.state.path.directory
    if ((await loadPluginValidation(directory)).config.tui?.sidebar?.enabled === false) {
      return
    }

    // Modal state: "closed" or the currently open modal
    let currentModal: ModelPickerModalState = { kind: "closed" }
    let currentView = await readView(directory, currentModal, getAvailableModels())
    let currentKey = viewKey(currentView)
    let disposed = false
    let inFlight = false
    let timer: ReturnType<typeof setTimeout> | null = null

    // Get initial roster rows for click mapping
    const mirror = readMirror(directory)
    const initialRoster = await loadRosterRows(
      directory,
      mirror?.tuiSelectedModel ?? undefined,
      mirror?.perAgentModels ?? undefined,
    )

    function requestRenderWithModal(): void {
      api.renderer.requestRender()
    }

    registerSidebarContentSlot({
      registerSlot: (registration) => {
        api.slots.register(registration)
      },
      requestRender: requestRenderWithModal,
      renderSidebar: () => materialize(buildViewNodes(currentView, api.theme.current, getAvailableModels()), solid),
    })

    // Handle sidebar click events from OpenCode TUI
    // Click events are passed via the client.onChatMessage or a dedicated click handler
    // We use the slot's onClick support that OpenCode provides
    try {
      // @ts-ignore - sidebar click handler may not be in types
      if (api.client?.tui?.onSidebarClick) {
        // @ts-ignore
        api.client.tui.onSidebarClick((event: { index: number }) => {
          void handleSidebarClick(event.index, initialRoster, directory)
        })
      }
    } catch {
      // onSidebarClick not available in this OpenCode version
    }

    async function handleSidebarClick(
      index: number,
      roster: readonly RosterRow[],
      dir: string,
    ): Promise<void> {
      // Index 0 = "Models" section header
      // 1..N = roster rows
      // N+1 = "Set Global Model" button
      // N+2..N+2+modelCount = model picker items (when modal is open)
      // N+2+modelCount = "Clear" button (per-agent modal only)
      // N+2+modelCount+1 = "Close" button

      if (currentModal.kind === "open") {
        // Modal is open - handle modal interactions
        const rosterRowCount = roster.length
        const setGlobalIndex = rosterRowCount + 1
        const clearIndex = setGlobalIndex + 1
        const closeIndex = clearIndex + 1
        const modelListStart = setGlobalIndex

        if (index === setGlobalIndex) {
          // "Set Global Model" clicked in modal → close modal, reopen as global picker
          currentModal = { kind: "open", targetAgent: "__global__", selectedModel: null }
        } else if (index === clearIndex) {
          // "Clear" clicked → clear per-agent override, close modal
          if (currentModal.kind === "open" && currentModal.targetAgent !== "__global__") {
            await clearAgentModelOverride(currentModal.targetAgent)
          }
          currentModal = { kind: "closed" }
        } else if (index === closeIndex) {
          // "Close" clicked → close modal
          currentModal = { kind: "closed" }
        } else if (index >= modelListStart) {
          // A model was selected
          const availableModels = getAvailableModels()
          const modelIndex = index - modelListStart
          if (modelIndex >= 0 && modelIndex < availableModels.length) {
            const selected = availableModels[modelIndex]
            await applyModelSelection(currentModal.kind === "open" ? currentModal.targetAgent : "__global__", selected)
            currentModal = { kind: "closed" }
          }
        }
      } else {
        // Modal is closed - check if a roster row was clicked
        if (index === 0) {
          // "Models" header - no action
          return
        }
        const rowIndex = index - 1
        if (rowIndex >= 0 && rowIndex < roster.length) {
          // Open modal for this agent
          const row = roster[rowIndex]
          currentModal = { kind: "open", targetAgent: row.label, selectedModel: row.effectiveModel }
        } else if (rowIndex === roster.length) {
          // "Set Global Model" button
          currentModal = { kind: "open", targetAgent: "__global__", selectedModel: null }
        }
      }

      // Refresh view with new modal state
      currentView = await readView(dir, currentModal, getAvailableModels())
      const nextKey = viewKey(currentView)
      if (nextKey !== currentKey) {
        currentKey = nextKey
        requestRenderWithModal()
      }
    }

    async function applyModelSelection(agentName: string, model: { providerID: string; modelID: string }): Promise<void> {
      try {
        // Import the setter functions from session-model-state
        const { setGlobalTuiModel, setPerAgentModel, clearAllPerAgentModels } = await import(
          "./shared/session-model-state"
        )
        if (agentName === "__global__") {
          // Setting global model clears all per-agent overrides
          setGlobalTuiModel(model)
          clearAllPerAgentModels()
          log("[tui] set global model", { providerID: model.providerID, modelID: model.modelID })
        } else {
          setPerAgentModel(agentName, model)
          log("[tui] set per-agent model", { agent: agentName, providerID: model.providerID, modelID: model.modelID })
        }
        // Trigger immediate mirror flush so the plugin picks up the new state
        const { getTuiStateMirrorSingleton } = await import(
          "./features/tui-sidebar/mirror-manager"
        )
        void getTuiStateMirrorSingleton()?.flush()
      } catch (err) {
        log("[tui] failed to apply model selection", { error: err })
      }
    }

    async function clearAgentModelOverride(agentName: string): Promise<void> {
      try {
        const { clearPerAgentModel } = await import("./shared/session-model-state")
        clearPerAgentModel(agentName)
        log("[tui] cleared per-agent model override", { agent: agentName })
        // Trigger immediate mirror flush
        const { getTuiStateMirrorSingleton } = await import(
          "./features/tui-sidebar/mirror-manager"
        )
        void getTuiStateMirrorSingleton()?.flush()
      } catch (err) {
        log("[tui] failed to clear per-agent model", { error: err })
      }
    }

    const schedule = (): void => {
      timer = setTimeout(tick, POLL_INTERVAL_MS)
    }

    const tick = async (): Promise<void> => {
      if (disposed || inFlight) {
        if (!disposed) schedule()
        return
      }
      inFlight = true
      try {
        const nextView = await readView(directory, currentModal, getAvailableModels())
        const nextKey = viewKey(nextView)
        if (nextKey !== currentKey) {
          currentView = nextView
          currentKey = nextKey
          api.renderer.requestRender()
        }
      } catch (error) {
        handleTuiPollError(error)
      } finally {
        inFlight = false
        if (!disposed) schedule()
      }
    }

    schedule()
    api.lifecycle.onDispose(() => {
      disposed = true
      if (timer) clearTimeout(timer)
    })

    // Set up push-to-talk voice mode (shortcut + indicator)
    void setupTuiVoice(api)
  },
}

export default module
