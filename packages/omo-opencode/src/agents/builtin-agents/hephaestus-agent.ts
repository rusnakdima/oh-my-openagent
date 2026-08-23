import type { AgentConfig } from "@opencode-ai/sdk";
import type { AgentOverrides } from "../types";
import type { CategoryConfig } from "../../config/schema";
import type {
  AvailableAgent,
  AvailableCategory,
  AvailableSkill,
} from "../dynamic-agent-prompt-builder";
import { log } from "../../shared/logger";
import { createHephaestusAgent } from "../hephaestus";
import { applyEnvironmentContext } from "./environment-context";
import { applyCategoryOverride, mergeAgentConfig } from "./agent-overrides";
import { applyModelResolution } from "./model-resolution";
import { applyFrontierToolSchemaPermission } from "../frontier-tool-schema-guard";
import { getEffectiveModelForAgent } from "../../shared/session-model-state";
import { AGENT_MODEL_REQUIREMENTS } from "../../shared";
import { isModelAvailable } from "../../shared";

export function maybeCreateHephaestusConfig(input: {
  disabledAgents: string[];
  agentOverrides: AgentOverrides;
  availableModels: Set<string>;
  isFirstRunNoCache: boolean;
  availableAgents: AvailableAgent[];
  availableSkills: AvailableSkill[];
  availableCategories: AvailableCategory[];
  mergedCategories: Record<string, CategoryConfig>;
  directory?: string;
  useTaskSystem: boolean;
  disableOmoEnv?: boolean;
}): AgentConfig | undefined {
  const {
    disabledAgents,
    agentOverrides,
    availableModels,
    isFirstRunNoCache,
    availableAgents,
    availableSkills,
    availableCategories,
    mergedCategories,
    directory,
    useTaskSystem,
    disableOmoEnv = false,
  } = input;

  if (disabledAgents.includes("hephaestus")) return undefined;

  const hephaestusOverride = agentOverrides["hephaestus"];
  const hephaestusRequirement = AGENT_MODEL_REQUIREMENTS["hephaestus"];

  // Check if agent requires a specific model
  if (hephaestusRequirement?.requiresModel && availableModels) {
    if (
      !isModelAvailable(hephaestusRequirement.requiresModel, availableModels)
    ) {
      log("[agent-registration] Agent skipped: required model not available", {
        agent: "hephaestus",
        requiredModel: hephaestusRequirement.requiresModel,
      });
      return undefined;
    }
  }

  // Use global model from TUI selection - directly via getEffectiveModelForAgent
  const globalModel = getEffectiveModelForAgent("hephaestus");

  if (!globalModel) {
    log("[agent-registration] Agent skipped: no global model selected", {
      agent: "hephaestus",
    });
    return undefined;
  }

  const hephaestusModel = `${globalModel.providerID}/${globalModel.modelID}`;

  let hephaestusConfig = createHephaestusAgent(
    hephaestusModel,
    availableAgents,
    [],
    availableSkills,
    availableCategories,
    useTaskSystem,
  );

  // Global model variant - use default for global model
  hephaestusConfig = { ...hephaestusConfig, variant: "medium" };

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
