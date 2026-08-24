import type { AgentConfig } from "@opencode-ai/sdk";
import type { AgentOverrides } from "../types";
import type { CategoryConfig } from "../../config/schema";
import type {
  AvailableAgent,
  AvailableCategory,
  AvailableSkill,
} from "../dynamic-agent-prompt-builder";
import { AGENT_MODEL_REQUIREMENTS } from "../../shared";
import { log } from "../../shared/logger";
import { createHephaestusAgent } from "../hephaestus";
import { applyEnvironmentContext } from "./environment-context";
import { applyCategoryOverride, mergeAgentConfig } from "./agent-overrides";
import { applyModelResolution } from "./model-resolution";
import { applyFrontierToolSchemaPermission } from "../frontier-tool-schema-guard";

export function maybeCreateHephaestusConfig(input: {
  disabledAgents: string[];
  agentOverrides: AgentOverrides;
  availableModels: Set<string>;
  systemDefaultModel?: string;
  defaultModel?: string;
  isFirstRunNoCache: boolean;
  availableAgents: AvailableAgent[];
  availableSkills: AvailableSkill[];
  availableCategories: AvailableCategory[];
  mergedCategories: Record<string, CategoryConfig>;
  directory?: string;
  useTaskSystem: boolean;
  disableOmoEnv?: boolean;
  uiSelectedModel?: string;
}): AgentConfig | undefined {
  const {
    disabledAgents,
    agentOverrides,
    availableModels,
    systemDefaultModel,
    defaultModel,
    isFirstRunNoCache,
    availableAgents,
    availableSkills,
    availableCategories,
    mergedCategories,
    directory,
    useTaskSystem,
    disableOmoEnv = false,
    uiSelectedModel,
  } = input;

  if (disabledAgents.includes("hephaestus")) return undefined;

  const hephaestusOverride = agentOverrides["hephaestus"];
  const hephaestusRequirement = AGENT_MODEL_REQUIREMENTS["hephaestus"];
  const hasHephaestusExplicitConfig = hephaestusOverride !== undefined;

  // No provider restriction — any provider is allowed for Hephaestus

  let hephaestusResolution = applyModelResolution({
    uiSelectedModel: hephaestusOverride?.model !== undefined
      ? undefined
      : uiSelectedModel,
    userModel: hephaestusOverride?.model ?? defaultModel,
    requirement: hephaestusRequirement,
    availableModels,
    systemDefaultModel,
  });

  // No fallback to hardcoded chain when model_fallback_enabled is false — provider default wins.

  if (!hephaestusResolution) {
    log(
      "[agent-registration] Agent skipped: model resolution returned no result",
      {
        agent: "hephaestus",
        configuredModel: hephaestusOverride?.model,
      },
    );
    return undefined;
  }
  let { model: hephaestusModel, variant: hephaestusResolvedVariant } =
    hephaestusResolution;

  // No model restrictions — any model is allowed for Hephaestus
  // (prompt routing defaults to "gpt" fallback for non-GPT models)

  let hephaestusConfig = createHephaestusAgent(
    hephaestusModel,
    availableAgents,
    undefined,
    availableSkills,
    availableCategories,
    useTaskSystem,
  );

  hephaestusConfig = {
    ...hephaestusConfig,
    variant: hephaestusResolvedVariant ?? "medium",
  };

  const hepOverrideCategory =
    (hephaestusOverride as Record<string, unknown> | undefined)?.category as
      | string
      | undefined;
  if (hepOverrideCategory) {
    hephaestusConfig = applyCategoryOverride(
      hephaestusConfig,
      hepOverrideCategory,
      mergedCategories,
    );
  }

  hephaestusConfig = applyEnvironmentContext(hephaestusConfig, directory, {
    disableOmoEnv,
  });

  if (hephaestusOverride) {
    hephaestusConfig = mergeAgentConfig(
      hephaestusConfig,
      hephaestusOverride,
      directory,
    );
  }

  const resolvedModel = hephaestusConfig.model ?? "";
  hephaestusConfig.permission = applyFrontierToolSchemaPermission(
    hephaestusConfig.permission,
    resolvedModel,
    hephaestusOverride?.permission,
    (hephaestusOverride as { tools?: Record<string, boolean> } | undefined)
      ?.tools,
  );

  return hephaestusConfig;
}
