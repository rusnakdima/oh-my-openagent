import type { OhMyOpenCodeConfig } from "../../config";
import {
  getSessionAgent,
  isAgentRegistered,
} from "../../features/claude-code-session-state";
import { getAgentConfigKey } from "../../shared/agent-display-names";
import { getModelCapabilities } from "../../shared/model-capabilities";
import { log } from "../../shared";
import {
  getSelectedGlobalModelLive,
  type SessionModel,
} from "../../shared/session-model-state";
import { hasExplicitAgentModelOverride } from "../global-model-capture";
import type { ChatMessageHandlerOutput, ChatMessageInput } from "./types";

// Agents whose job depends on image input. A global pick without image support
// must not override their model — they keep their own vision-capable chains.
const VISION_REQUIRED_AGENTS = new Set(["multimodal-looker"]);

function pickedModelSupportsVision(model: SessionModel): boolean {
  const capabilities = getModelCapabilities({
    providerID: model.providerID,
    modelID: model.modelID,
  });
  const inputModalities = capabilities.modalities?.input;
  return Array.isArray(inputModalities) && inputModalities.includes("image");
}

/**
 * Apply the user's global model pick to the current LLM call for ANY OMO-registered
 * agent mode — primary, subagent, and specialist agents all receive the global pick.
 *
 * Runs BEFORE the chat.message hook chain so error-recovery overrides applied later
 * (runtime-fallback, model-fallback) still win during fallbacks.
 *
 * Skips:
 * - no global pick set
 * - non-OMO agents (anything this plugin did not register)
 * - agents with an explicit per-agent model override in the user config
 * - vision-required agents only if the global pick lacks image input support
 */
export function applyGlobalModelToChatMessage(
  input: ChatMessageInput,
  output: ChatMessageHandlerOutput,
  pluginConfig: OhMyOpenCodeConfig,
): void {
  const global = getSelectedGlobalModelLive();
  if (!global) return;

  const agent = input.agent ?? getSessionAgent(input.sessionID);
  if (!agent || !isAgentRegistered(agent)) return;

  if (hasExplicitAgentModelOverride(agent, pluginConfig)) return;

  // Vision-required agents keep their model only if the global pick lacks vision support
  if (VISION_REQUIRED_AGENTS.has(getAgentConfigKey(agent))) {
    if (!pickedModelSupportsVision(global)) {
      log(
        "[global-model-apply] global pick lacks vision; keeping vision-required agent's model",
        {
          agent,
          globalPick: `${global.providerID}/${global.modelID}`,
        },
      );
      return;
    }
  }

  output.message.model = {
    providerID: global.providerID,
    modelID: global.modelID,
  };
}
