import type { AgentConfig } from "@opencode-ai/sdk";
import type { AgentOverrides } from "../types";
import type { CategoriesConfig, CategoryConfig } from "../../config/schema";
import type {
  AvailableAgent,
  AvailableCategory,
  AvailableSkill,
} from "../dynamic-agent-prompt-builder";
import { AGENT_MODEL_REQUIREMENTS, isModelAvailable } from "../../shared";
import { log } from "../../shared/logger";
import { createSisyphusAgent } from "../sisyphus";
import { applyEnvironmentContext } from "./environment-context";
import { applyOverrides } from "./agent-overrides";
import { applyModelResolution } from "./model-resolution";
import { applyFrontierToolSchemaPermission } from "../frontier-tool-schema-guard";
import { getEffectiveModelForAgent } from "../../shared/session-model-state";
import { setSisyphusRuntimePromptContext } from "../sisyphus-runtime-prompt-reconciler";

export function maybeCreateSisyphusConfig(input: {
  disabledAgents: string[];
  agentOverrides: AgentOverrides;
  uiSelectedModel?: string;
  availableModels: Set<string>;
  systemDefaultModel?: string;
  defaultModel?: string;
  isFirstRunNoCache: boolean;
  availableAgents: AvailableAgent[];
  availableSkills: AvailableSkill[];
  availableCategories: AvailableCategory[];
  mergedCategories: Record<string, CategoryConfig>;
  directory?: string;
  userCategories?: CategoriesConfig;
  useTaskSystem: boolean;
  disableOmoEnv?: boolean;
}): AgentConfig | undefined {
  const {
    disabledAgents,
    agentOverrides,
    uiSelectedModel,
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
    userCategories,
  } = input;

  if (disabledAgents.includes("sisyphus")) return undefined;

  // Check if agent requires a specific model
  const sisyphusRequirement = AGENT_MODEL_REQUIREMENTS["sisyphus"];
  if (sisyphusRequirement?.requiresModel && availableModels) {
    if (!isModelAvailable(sisyphusRequirement.requiresModel, availableModels)) {
      log("[agent-registration] Agent skipped: required model not available", {
        agent: "sisyphus",
        requiredModel: sisyphusRequirement.requiresModel,
      });
      return undefined;
    }
  }

  // Use global model from TUI selection - directly via getEffectiveModelForAgent
  const globalModel = getEffectiveModelForAgent("sisyphus");

  if (!globalModel) {
    log("[agent-registration] Agent skipped: no global model selected", {
      agent: "sisyphus",
    });
    return undefined;
  }

  const sisyphusModel = `${globalModel.providerID}/${globalModel.modelID}`;

  let sisyphusConfig = createSisyphusAgent(
    sisyphusModel,
    availableAgents,
    [],
    availableSkills,
    availableCategories,
    useTaskSystem,
  );

  // Default variant for global model
  sisyphusConfig = { ...sisyphusConfig, variant: "medium" };

  const sisyphusOverride = agentOverrides["sisyphus"];
  sisyphusConfig = applyOverrides(
    sisyphusConfig,
    sisyphusOverride,
    mergedCategories,
    directory,
  );

  const resolvedModel = sisyphusConfig.model ?? "";
  sisyphusConfig.permission = applyFrontierToolSchemaPermission(
    sisyphusConfig.permission,
    resolvedModel,
    sisyphusOverride?.permission,
    (sisyphusOverride as { tools?: Record<string, boolean> } | undefined)
      ?.tools,
  );

  sisyphusConfig = applyEnvironmentContext(sisyphusConfig, directory, {
    disableOmoEnv,
  });

  setSisyphusRuntimePromptContext({
    configuredModel: sisyphusModel,
    bakedPrompt: sisyphusConfig.prompt ?? "",
    rebuildPromptForModel: (runtimeModel: string): string => {
      let rebuilt = createSisyphusAgent(
        runtimeModel,
        availableAgents,
        [],
        availableSkills,
        availableCategories,
        useTaskSystem,
      );
      rebuilt = applyOverrides(
        rebuilt,
        sisyphusOverride,
        mergedCategories,
        directory,
      );
      rebuilt = applyEnvironmentContext(rebuilt, directory, { disableOmoEnv });
      return rebuilt.prompt ?? "";
    },
  });

  return sisyphusConfig;
}
