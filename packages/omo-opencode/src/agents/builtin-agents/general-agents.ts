import type { AgentConfig } from "@opencode-ai/sdk"
import type { BuiltinAgentName, AgentOverrides, AgentPromptMetadata } from "../types"
import type { CategoryConfig, GitMasterConfig } from "../../config/schema"
import type { BrowserAutomationProvider } from "../../config/schema"
import type { AvailableAgent } from "../dynamic-agent-prompt-builder"
import { buildAgent, isFactory } from "../agent-builder"
import { resolveAgentSkills } from "../agent-skill-resolution"
import { applyOverrides } from "./agent-overrides"
import { applyEnvironmentContext } from "./environment-context"
import { applyModelResolution } from "./model-resolution"
import { log } from "../../shared/logger"

export function collectPendingBuiltinAgents(input: {
  agentSources: Record<BuiltinAgentName, import("../agent-builder").AgentSource>
  agentMetadata: Partial<Record<BuiltinAgentName, AgentPromptMetadata>>
  disabledAgents: string[]
  agentOverrides: AgentOverrides
  directory?: string
  systemDefaultModel?: string
  mergedCategories: Record<string, CategoryConfig>
  gitMasterConfig?: GitMasterConfig
  browserProvider?: BrowserAutomationProvider
  uiSelectedModel?: string
  availableModels: Set<string>
  isFirstRunNoCache?: boolean
  disabledSkills?: Set<string>
  teamModeEnabled?: boolean
  disableOmoEnv?: boolean
}): { pendingAgentConfigs: Map<string, AgentConfig>; availableAgents: AvailableAgent[] } {
  const {
    agentSources,
    agentMetadata,
    disabledAgents,
    agentOverrides,
    directory,
    systemDefaultModel,
    mergedCategories,
    gitMasterConfig,
    browserProvider,
    uiSelectedModel,
    availableModels,
    disabledSkills,
    teamModeEnabled,
    disableOmoEnv = false,
  } = input

  const availableAgents: AvailableAgent[] = []
  const pendingAgentConfigs: Map<string, AgentConfig> = new Map()

  for (const [name, source] of Object.entries(agentSources)) {
    const agentName = name as BuiltinAgentName

    if (agentName === "sisyphus") continue
    if (agentName === "hephaestus") continue
    if (agentName === "atlas") continue
    if (agentName === "sisyphus-junior") continue
    if (disabledAgents.some((name) => name.toLowerCase() === agentName.toLowerCase())) continue

    const override = agentOverrides[agentName]
      ?? Object.entries(agentOverrides).find(([key]) => key.toLowerCase() === agentName.toLowerCase())?.[1]

    // All agents use the global TUI selection (or system default)
    const resolution = applyModelResolution({
      uiSelectedModel,
      availableModels,
      systemDefaultModel,
    })
    if (!resolution) {
      log("[agent-registration] Agent skipped: no model resolved", {
        agent: agentName,
      })
      continue
    }
    const { model, variant: resolvedVariant } = resolution

    let config = buildAgent(source, model, mergedCategories)

    // Apply resolved variant from resolved model
    if (resolvedVariant) {
      config = { ...config, variant: resolvedVariant }
    }

    if (agentName === "librarian") {
      config = applyEnvironmentContext(config, directory, { disableOmoEnv })
    }

    // Apply user config overrides (but not model - that comes from global TUI)
    config = applyOverrides(config, override, mergedCategories, directory)
    config = resolveAgentSkills(config, { gitMasterConfig, browserProvider, disabledSkills, teamModeEnabled })

    // Store for later - will be added after sisyphus and hephaestus
    pendingAgentConfigs.set(name, config)

    const metadata = agentMetadata[agentName]
    if (metadata) {
      availableAgents.push({
        name: agentName,
        description: config.description ?? "",
        metadata,
      })
    }
  }

  return { pendingAgentConfigs, availableAgents }
}
