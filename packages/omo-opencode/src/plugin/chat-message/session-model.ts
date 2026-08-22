import type { OhMyOpenCodeConfig } from "../../config"
import { subagentSessions, getMainSessionID } from "../../features/claude-code-session-state"
import { getAgentConfigKey } from "../../shared/agent-display-names"
import { getSessionModel, setSessionModel, setSelectedGlobalModel } from "../../shared/session-model-state"
import { log } from "../../shared"
import type { ChatMessageHandlerOutput, ChatMessageInput, SessionModelOverride } from "./types"

// Track previous model per session to detect changes
// Subagent sessionIDs also write globalTuiModel — map includes ALL sessions (primary + subagent)
const previousModels = new Map<string, { providerID: string; modelID: string }>()
let lastGlobalPreviousModel: { providerID: string; modelID: string } | null = null

function hasExplicitAgentModelOverride(
  agent: string | undefined,
  pluginConfig: OhMyOpenCodeConfig,
): boolean {
  const configuredAgents = pluginConfig.agents
  const normalizedAgent = typeof agent === "string" ? getAgentConfigKey(agent) : undefined
  if (!normalizedAgent || !configuredAgents || !(normalizedAgent in configuredAgents)) {
    return false
  }

  const configuredAgent = configuredAgents[normalizedAgent as keyof typeof configuredAgents]
  const configuredModel = configuredAgent?.model
  return typeof configuredModel === "string" && configuredModel.trim().length > 0
}

export function getStoredMainSessionModel(
  input: ChatMessageInput,
  pluginConfig: OhMyOpenCodeConfig,
  isFirstMessage: boolean,
): SessionModelOverride | undefined {
  if (isFirstMessage) {
    return undefined
  }

  if (subagentSessions.has(input.sessionID)) {
    return undefined
  }

  if (getMainSessionID() !== input.sessionID) {
    return undefined
  }

  if (hasExplicitAgentModelOverride(input.agent, pluginConfig)) {
    return undefined
  }

  return getSessionModel(input.sessionID)
}

export function recordSessionModel(input: ChatMessageInput, output: ChatMessageHandlerOutput): void {
  log("[recordSessionModel]", { inputModel: input.model, outputModel: output.message.model, sessionID: input.sessionID.slice(0, 8) })
  // First priority: input.model from TUI picker (current live selection — always wins)
  if (input.model) {
    let parsed: { providerID: string; modelID: string } | null = null

    if (
      typeof input.model === "object" &&
      "providerID" in input.model &&
      "modelID" in input.model
    ) {
      parsed = {
        providerID: (input.model as { providerID: string }).providerID,
        modelID: (input.model as { modelID: string }).modelID,
      }
    } else if (typeof input.model === "string") {
      const modelStr = input.model as string
      if (modelStr.includes("/")) {
        const parts = modelStr.split("/")
        const modelID = parts.pop()!
        const providerID = parts.join("/")
        parsed = { providerID, modelID }
      }
    }

    if (parsed) {
      setSessionModel(input.sessionID, parsed)

      // Detect model change → update the global selected model (includes subagent sessions)
      const prev = previousModels.get(input.sessionID)
      const isPerSessionChanged = !prev || prev.providerID !== parsed.providerID || prev.modelID !== parsed.modelID
      const isGlobalChanged = !lastGlobalPreviousModel || lastGlobalPreviousModel.providerID !== parsed.providerID || lastGlobalPreviousModel.modelID !== parsed.modelID
      if (isPerSessionChanged || isGlobalChanged) {
        setSelectedGlobalModel(parsed)
        previousModels.set(input.sessionID, parsed)
        lastGlobalPreviousModel = parsed
      }
      return
    }
  }

  // Second priority: output.message.model set by our plugin (fallback when no input.model)
  const modelOverride = output.message.model
  if (
    modelOverride &&
    typeof modelOverride === "object" &&
    "providerID" in modelOverride &&
    "modelID" in modelOverride
  ) {
    const providerID = (modelOverride as { readonly providerID?: string }).providerID
    const modelID = (modelOverride as { readonly modelID?: string }).modelID
    if (typeof providerID === "string" && typeof modelID === "string") {
      setSessionModel(input.sessionID, { providerID, modelID })

      // Also update global selected model on change (includes subagent sessions)
      const prev = previousModels.get(input.sessionID)
      const parsed = { providerID, modelID }
      const isPerSessionChanged = !prev || prev.providerID !== parsed.providerID || prev.modelID !== parsed.modelID
      const isGlobalChanged = !lastGlobalPreviousModel || lastGlobalPreviousModel.providerID !== parsed.providerID || lastGlobalPreviousModel.modelID !== parsed.modelID
      if (isPerSessionChanged || isGlobalChanged) {
        setSelectedGlobalModel(parsed)
        previousModels.set(input.sessionID, parsed)
        lastGlobalPreviousModel = parsed
      }
    }
  }
}
