import { createBuiltinAgents } from "../agents";
import { collectDisabledSkillAliases } from "../plugin/skill-context";
import { getGlobalTuiModel } from "../shared/session-model-state";
import { readMirror } from "../features/tui-sidebar/mirror-io";
import { isTaskSystemEnabled } from "../shared";
import { AGENT_NAME_MAP } from "../shared/migration";
import { assembleAgentConfig } from "./agent-config-assembly";
import { finalizeAgentConfig } from "./agent-config-finalizer";
import { discoverAgentSkills } from "./agent-skill-discovery";
import { loadAgentSources } from "./agent-source-loader";
import type { ApplyAgentConfigParams } from "./agent-config-types";

export async function applyAgentConfig(
  params: ApplyAgentConfigParams,
): Promise<Record<string, unknown>> {
  const migratedDisabledAgents = (params.pluginConfig.disabled_agents ?? []).map(
    (agent: string) => AGENT_NAME_MAP[agent.toLowerCase()] ?? AGENT_NAME_MAP[agent] ?? agent,
  ) as typeof params.pluginConfig.disabled_agents;
  const allDiscoveredSkills = await discoverAgentSkills(params);
  const sources = loadAgentSources(params);
  const browserProvider =
    params.pluginConfig.browser_automation_engine?.provider ?? "playwright";
  const currentModel = params.config.model as string | undefined;
  // Global TUI model is the single source of truth for ALL agent modes.
  // Plugin heap (set via /models -> chat.params/chat.message) and TUI heap are separate processes,
  // so also try reading the mirror file as fallback for cross-process sync.
  const globalTui = getGlobalTuiModel() ?? (() => {
    try {
      const mirror = readMirror(params.ctx.directory)
      const m = mirror?.tuiSelectedModel
      return m ? { providerID: m.providerID, modelID: m.modelID } : null
    } catch {
      return null
    }
  })()
  const effectiveGlobalModel = globalTui ? `${globalTui.providerID}/${globalTui.modelID}` : undefined
  const effectiveUiModel = effectiveGlobalModel ?? currentModel
  const disabledSkills = collectDisabledSkillAliases(params.pluginConfig);
  const useTaskSystem = isTaskSystemEnabled(params.pluginConfig);
  const disableOmoEnv = params.pluginConfig.experimental?.disable_omo_env ?? false;
  const builtinAgents = await createBuiltinAgents(
    migratedDisabledAgents,
    params.pluginConfig.agents,
    params.ctx.directory,
    effectiveGlobalModel ?? currentModel,
    params.pluginConfig.default_model,
    params.pluginConfig.categories,
    params.pluginConfig.git_master,
    allDiscoveredSkills,
    sources.customAgentSummaries,
    browserProvider,
    effectiveUiModel,
    disabledSkills,
    useTaskSystem,
    disableOmoEnv,
    params.pluginConfig.team_mode?.enabled ?? false,
    params.pluginConfig.openspec?.enabled ?? false,
  );
  const disabledAgentNames = new Set(
    (migratedDisabledAgents ?? []).map((agent: string) => agent.toLowerCase()),
  );
  const { configuredDefaultAgent } = await assembleAgentConfig({
    config: params.config,
    pluginConfig: params.pluginConfig,
    builtinAgents,
    sources,
    currentModel: effectiveUiModel ?? currentModel,
    useTaskSystem,
    disabledAgentNames,
  });

  return finalizeAgentConfig({
    config: params.config,
    pluginConfig: params.pluginConfig,
    configuredDefaultAgent,
  });
}
