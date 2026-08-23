import type { OhMyOpenCodeConfig } from "../config";
import {
  isAgentRegistered,
  subagentSessions,
} from "../features/claude-code-session-state";
import { getAgentConfigKey } from "../shared/agent-display-names";
import { log } from "../shared";
import {
  applyGlobalModel,
  getSelectedGlobalModel,
  type SessionModel,
} from "../shared/session-model-state";
import { writeGlobalModelToConfigs } from "../shared/persist-config-model";

/**
 * Gate for user-driven global model capture. Only PRIMARY (user-facing) sessions
 * running an OMO-registered agent may update the global model pick.
 *
 * This is what breaks the feedback loop: subagent/specialist sessions running on
 * their own models (e.g. multimodal-looker on a vision chain) must never
 * overwrite the user's global pick. Sessions whose agent has an explicit
 * per-agent model override in the user config are also excluded — their model
 * is pinned by configuration, not chosen by the user at runtime.
 */
export function isPrimaryModelCaptureSession(
  sessionID: string,
  agent: string | undefined,
  pluginConfig: OhMyOpenCodeConfig,
): boolean {
  if (subagentSessions.has(sessionID)) return false;

  if (!agent || !isAgentRegistered(agent)) return false;

  if (hasExplicitAgentModelOverride(agent, pluginConfig)) return false;

  return true;
}

export function hasExplicitAgentModelOverride(
  agent: string | undefined,
  pluginConfig: OhMyOpenCodeConfig,
): boolean {
  const configuredAgents = pluginConfig.agents;
  const normalizedAgent = typeof agent === "string"
    ? getAgentConfigKey(agent)
    : undefined;
  if (
    !normalizedAgent || !configuredAgents ||
    !(normalizedAgent in configuredAgents)
  ) {
    return false;
  }

  const configuredAgent =
    configuredAgents[normalizedAgent as keyof typeof configuredAgents];
  const configuredModel = configuredAgent?.model;
  return typeof configuredModel === "string" &&
    configuredModel.trim().length > 0;
}

/**
 * Capture a user-driven model pick as the global model: heap + cross-process
 * store + user config files. Deduplicated against the current global so repeated
 * captures of the same model are no-ops.
 */
export function captureGlobalModelPick(
  model: SessionModel,
  sessionID: string,
): void {
  const current = getSelectedGlobalModel();
  if (
    current && current.providerID === model.providerID &&
    current.modelID === model.modelID
  ) {
    return;
  }
  applyGlobalModel(model);
  writeGlobalModelToConfigs(model);
  log("[global-model-capture] global model updated", {
    model: `${model.providerID}/${model.modelID}`,
    sessionID: sessionID.slice(0, 8),
  });
}
