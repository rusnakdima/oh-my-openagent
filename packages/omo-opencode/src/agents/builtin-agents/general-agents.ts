import type { AgentConfig } from "@opencode-ai/sdk";
import type {
  AgentOverrides,
  AgentPromptMetadata,
  BuiltinAgentName,
} from "../types";
import type { CategoryConfig, GitMasterConfig } from "../../config/schema";
import type { BrowserAutomationProvider } from "../../config/schema";
import type { AvailableAgent } from "../dynamic-agent-prompt-builder";
import { AGENT_MODEL_REQUIREMENTS, isModelAvailable } from "../../shared";
import { buildAgent } from "../agent-builder";
import { resolveAgentSkills } from "../agent-skill-resolution";
import { applyOverrides } from "./agent-overrides";
import { applyEnvironmentContext } from "./environment-context";
import { applyModelResolution } from "./model-resolution";
import { log } from "../../shared/logger";

export function collectPendingBuiltinAgents(input: {
  agentSources: Record<
    BuiltinAgentName,
    import("../agent-builder").AgentSource
  >;
  agentMetadata: Partial<Record<BuiltinAgentName, AgentPromptMetadata>>;
  disabledAgents: string[];
  agentOverrides: AgentOverrides;
  directory?: string;
  systemDefaultModel?: string;
  defaultModel?: string;
  mergedCategories: Record<string, CategoryConfig>;
  gitMasterConfig?: GitMasterConfig;
  browserProvider?: BrowserAutomationProvider;
  uiSelectedModel?: string;
  availableModels: Set<string>;
  isFirstRunNoCache: boolean;
  disabledSkills?: Set<string>;
  teamModeEnabled?: boolean;
  useTaskSystem?: boolean;
  disableOmoEnv?: boolean;
}): {
  pendingAgentConfigs: Map<string, AgentConfig>;
  availableAgents: AvailableAgent[];
} {
  const {
    agentSources,
    agentMetadata,
    disabledAgents,
    agentOverrides,
    directory,
    systemDefaultModel,
    defaultModel,
    mergedCategories,
    gitMasterConfig,
    browserProvider,
    uiSelectedModel,
    availableModels,
    isFirstRunNoCache: _isFirstRunNoCache,
    disabledSkills,
    teamModeEnabled,
    disableOmoEnv = false,
  } = input;

  const availableAgents: AvailableAgent[] = [];
  const pendingAgentConfigs: Map<string, AgentConfig> = new Map();

  for (const [name, source] of Object.entries(agentSources)) {
    const agentName = name as BuiltinAgentName;

    if (agentName === "sisyphus") continue;
    if (agentName === "hephaestus") continue;
    if (agentName === "atlas") continue;
    if (agentName === "sisyphus-junior") continue;
    if (
      disabledAgents.some((name) =>
        name.toLowerCase() === agentName.toLowerCase()
      )
    ) continue;

    // Filter out mode from override to prevent user config from overriding correct builtin mode
    const rawOverride = agentOverrides[agentName] ??
      Object.entries(agentOverrides).find(([key]) =>
        key.toLowerCase() === agentName.toLowerCase()
      )?.[1];
    const { mode: _overrideMode, ...override } = rawOverride ?? {};
    const requirement = AGENT_MODEL_REQUIREMENTS[agentName];

    // Check if agent requires a specific model
    if (requirement?.requiresModel && availableModels) {
      if (!isModelAvailable(requirement.requiresModel, availableModels)) {
        log(
          "[agent-registration] Agent skipped: required model not available",
          {
            agent: agentName,
            requiredModel: requirement.requiresModel,
          },
        );
        continue;
      }
    }

    // Determine userModel: per-agent override takes priority, otherwise use global defaultModel
    const resolvedUserModel = override?.model ?? defaultModel;

    let resolution = applyModelResolution({
      uiSelectedModel: override?.model === undefined
        ? uiSelectedModel
        : undefined,
      userModel: resolvedUserModel,
      requirement,
      availableModels,
      systemDefaultModel,
    });
    if (!resolution) {
      log(
        "[agent-registration] Agent skipped: model resolution returned no result",
        {
          agent: agentName,
          configuredModel: override?.model,
        },
      );
      continue;
    }
    const { model, variant: resolvedVariant } = resolution;

    let config = buildAgent(source, model, mergedCategories);

    // Apply resolved variant from model fallback chain
    if (resolvedVariant) {
      config = { ...config, variant: resolvedVariant };
    }

    if (agentName === "librarian") {
      config = applyEnvironmentContext(config, directory, { disableOmoEnv });
    }

    config = applyOverrides(config, override, mergedCategories, directory);
    config = resolveAgentSkills(config, {
      gitMasterConfig,
      browserProvider,
      disabledSkills,
      teamModeEnabled,
    });

    // Store for later - will be added after sisyphus and hephaestus
    pendingAgentConfigs.set(name, config);

    const metadata = agentMetadata[agentName];
    if (metadata) {
      availableAgents.push({
        name: agentName,
        description: config.description ?? "",
        metadata,
      });
    }
  }

  return { pendingAgentConfigs, availableAgents };
}
