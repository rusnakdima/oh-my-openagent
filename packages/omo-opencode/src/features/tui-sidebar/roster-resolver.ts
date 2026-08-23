import { getModelResolutionInfoWithOverrides } from "../../cli/doctor/checks/model-resolution";
import type { OmoConfig } from "../../cli/doctor/checks/model-resolution-types";
import type { OhMyOpenCodeConfig } from "../../config";
import { validatePluginConfig } from "../../config/validate";
import type { AgentMode } from "../../agents/types";
import type { RosterRow } from "./state-types";
import {
  getEffectiveModelForAgent,
  getSelectedGlobalModelLive,
} from "../../shared/session-model-state";
import { readMirror } from "./mirror-io";

type ResolutionEntry = {
  readonly name: string;
  readonly effectiveModel: string;
};

// Known built-in agent modes (Aug 2026: per-agent mode + model)
export const AGENT_MODE_MAP: Record<string, AgentMode> = {
  sisyphus: "primary",
  "sisyphus-junior": "subagent",
  atlas: "primary",
  hephaestus: "primary",
  prometheus: "primary",
  oracle: "subagent",
  explore: "subagent",
  librarian: "subagent",
  metis: "subagent",
  momus: "subagent",
  "multimodal-looker": "subagent",
};

type AgentModelConfig = {
  model?: string;
  variant?: string;
  category?: string;
};

type CategoryModelConfig = {
  model?: string;
  variant?: string;
};

function formatModelLabel(model: string): string {
  const slashIndex = model.lastIndexOf("/");
  if (slashIndex < 0 || slashIndex === model.length - 1) {
    return model;
  }
  return model.slice(slashIndex + 1);
}

function toRosterRow(
  entry: ResolutionEntry,
  hasOverride: boolean,
  isGlobal: boolean,
): RosterRow {
  return {
    label: entry.name,
    mode: AGENT_MODE_MAP[entry.name] ?? "subagent",
    model: formatModelLabel(entry.effectiveModel),
    effectiveModel: entry.effectiveModel,
    hasOverride,
    isGlobal,
  };
}

function pickAgentModelConfig(agent: AgentModelConfig): AgentModelConfig {
  const picked: AgentModelConfig = {};
  if (agent.model !== undefined) picked.model = agent.model;
  if (agent.variant !== undefined) picked.variant = agent.variant;
  if (agent.category !== undefined) picked.category = agent.category;
  return picked;
}

function pickCategoryModelConfig(
  category: CategoryModelConfig,
): CategoryModelConfig {
  const picked: CategoryModelConfig = {};
  if (category.model !== undefined) picked.model = category.model;
  if (category.variant !== undefined) picked.variant = category.variant;
  return picked;
}

function toModelResolutionConfig(config: OhMyOpenCodeConfig): OmoConfig {
  const agents: Record<string, AgentModelConfig> = {};
  const categories: Record<string, CategoryModelConfig> = {};

  for (const [name, agent] of Object.entries(config.agents ?? {})) {
    if (agent) agents[name] = pickAgentModelConfig(agent);
  }

  for (const [name, category] of Object.entries(config.categories ?? {})) {
    if (category) categories[name] = pickCategoryModelConfig(category);
  }

  return { agents, categories };
}

export function resolveRoster(
  directory: string,
): RosterRow[] {
  try {
    const config = validatePluginConfig(directory).config;
    const sidebarConfig = config.tui?.sidebar;
    const visibleAgents = sidebarConfig?.visibleAgents;
    const visibleCategories = sidebarConfig?.visibleCategories;
    // Read model from mirror file (written by plugin heartbeat) — fallback for cross-process visibility
    const mirror = readMirror(directory);
    const perAgentMirrorModels = mirror?.perAgentModels ?? {};
    const mirrorGlobalModel = mirror?.tuiSelectedModel;

    // Get live global model from heap (TUI process has access via cross-process store)
    const liveGlobalModel = getSelectedGlobalModelLive();

    // Resolve with global override from live state (takes priority) or mirror as fallback
    const resolution = getModelResolutionInfoWithOverrides(
      toModelResolutionConfig(config),
      liveGlobalModel ?? mirrorGlobalModel ?? undefined,
    );

    const disabledAgents = new Set(config.disabled_agents ?? []);

    const agents = visibleAgents != null && visibleAgents.length > 0
      ? resolution.agents.filter((a) => visibleAgents.includes(a.name))
      : resolution.agents;

    const categories = visibleCategories != null && visibleCategories.length > 0
      ? resolution.categories.filter((c) => visibleCategories.includes(c.name))
      : resolution.categories;

    return [...agents, ...categories]
      .filter((entry) => !disabledAgents.has(entry.name))
      .map((entry) => {
        // Model priority: liveGlobalModel > mirrorGlobalModel > perAgentMirror > config/fallback
        // getEffectiveModelForAgent provides final fallback when no global selection exists
        const perAgentMirror = perAgentMirrorModels[entry.name];
        const mode = AGENT_MODE_MAP[entry.name] ?? "subagent";

        let effectiveModel: string;
        let hasOverride = false;
        let isGlobal = false;

        // Global live model takes absolute priority: the /models selection is the single
        // source of truth for all agent modes (primary + subagent). Use live global model
        // when available; fall back to mirror per-agent overrides only when no live global.
        if (liveGlobalModel) {
          const globalStr =
            `${liveGlobalModel.providerID}/${liveGlobalModel.modelID}`;
          effectiveModel = globalStr;
          hasOverride = true;
          isGlobal = true;
        } else if (mirrorGlobalModel) {
          const globalStr =
            `${mirrorGlobalModel.providerID}/${mirrorGlobalModel.modelID}`;
          effectiveModel = globalStr;
          hasOverride = true;
          isGlobal = true;
        } else if (perAgentMirror) {
          effectiveModel =
            `${perAgentMirror.providerID}/${perAgentMirror.modelID}`;
          hasOverride = true;
          isGlobal = false;
        } else {
          // Config-resolved per-entry model (already per-agent via overrides/fallback)
          effectiveModel = entry.effectiveModel || "—";
          // Also consider live per-agent via getEffectiveModelForAgent as final fallback
          const perAgentEffective = getEffectiveModelForAgent(entry.name);
          if (perAgentEffective) {
            const perAgentString =
              `${perAgentEffective.providerID}/${perAgentEffective.modelID}`;
            // Don't clobber explicit config overrides
            if (
              !entry.effectiveModel || entry.effectiveModel === perAgentString
            ) {
              effectiveModel = perAgentString;
            }
          }
        }

        return {
          label: entry.name,
          mode,
          model: effectiveModel ? formatModelLabel(effectiveModel) : "—",
          effectiveModel,
          hasOverride,
          isGlobal,
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label));
  } catch (error) {
    if (error instanceof Error) {
      return [];
    }
    throw error;
  }
}
