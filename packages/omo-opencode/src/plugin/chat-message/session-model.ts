import type { OhMyOpenCodeConfig } from "../../config"
import { subagentSessions, getMainSessionID } from "../../features/claude-code-session-state"
import { getAgentConfigKey } from "../../shared/agent-display-names"
import { getSessionModel, setSessionModel } from "../../shared/session-model-state"
import type { ChatMessageHandlerOutput, ChatMessageInput, SessionModelOverride } from "./types"

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

  if (input.model) {
    return undefined
  }

  if (hasExplicitAgentModelOverride(input.agent, pluginConfig)) {
    return undefined
  }

  return getSessionModel(input.sessionID)
}

export function recordSessionModel(input: ChatMessageInput, output: ChatMessageHandlerOutput): void {
  // First priority: output.message.model set by our plugin (highest priority)
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
    }
    return
  }

  // Second priority: input.model from TUI picker (SessionModel object or bare string)
  if (input.model) {
    if (
      typeof input.model === "object" &&
      "providerID" in input.model &&
      "modelID" in input.model
    ) {
      // input.model is a SessionModel object — use it directly
      setSessionModel(input.sessionID, {
        providerID: (input.model as { providerID: string }).providerID,
        modelID: (input.model as { modelID: string }).modelID,
      })
    } else if (typeof input.model === "string" && input.model.includes("/")) {
      // input.model is a "provider/model" string — parse it
      const parts = input.model.split("/")
      const modelID = parts.pop()!
      const providerID = parts.join("/")
      setSessionModel(input.sessionID, { providerID, modelID })
    }
    // Bare string without "/" is not a valid model identifier — ignore
  }
}
