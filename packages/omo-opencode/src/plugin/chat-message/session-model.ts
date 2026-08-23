import {
  getMainSessionID,
  subagentSessions,
} from "../../features/claude-code-session-state";
import {
  getSessionModel,
  setSessionModel,
} from "../../shared/session-model-state";
import { log } from "../../shared";
import {
  captureGlobalModelPick,
  hasExplicitAgentModelOverride,
  isPrimaryModelCaptureSession,
} from "../global-model-capture";
import type { OhMyOpenCodeConfig } from "../../config";
import type {
  ChatMessageHandlerOutput,
  ChatMessageInput,
  SessionModelOverride,
} from "./types";

export { hasExplicitAgentModelOverride };

// Track previous model per session to detect changes
const previousModels = new Map<
  string,
  { providerID: string; modelID: string }
>();

export function getStoredMainSessionModel(
  input: ChatMessageInput,
  pluginConfig: OhMyOpenCodeConfig,
  isFirstMessage: boolean,
): SessionModelOverride | undefined {
  if (isFirstMessage) {
    return undefined;
  }

  if (subagentSessions.has(input.sessionID)) {
    return undefined;
  }

  if (getMainSessionID() !== input.sessionID) {
    return undefined;
  }

  if (hasExplicitAgentModelOverride(input.agent, pluginConfig)) {
    return undefined;
  }

  return getSessionModel(input.sessionID);
}

export function recordSessionModel(
  input: ChatMessageInput,
  output: ChatMessageHandlerOutput,
  pluginConfig: OhMyOpenCodeConfig,
): void {
  log("[recordSessionModel]", {
    inputModel: input.model,
    outputModel: output.message.model,
    sessionID: input.sessionID.slice(0, 8),
  });

  // First priority: input.model from the TUI /models picker (live user selection)
  if (input.model) {
    let parsed: { providerID: string; modelID: string } | null = null;

    if (
      typeof input.model === "object" &&
      "providerID" in input.model &&
      "modelID" in input.model
    ) {
      parsed = {
        providerID: (input.model as { providerID: string }).providerID,
        modelID: (input.model as { modelID: string }).modelID,
      };
    } else if (typeof input.model === "string") {
      const modelStr = input.model as string;
      if (modelStr.includes("/")) {
        const parts = modelStr.split("/");
        const modelID = parts.pop()!;
        const providerID = parts.join("/");
        parsed = { providerID, modelID };
      }
    }

    if (parsed) {
      setSessionModel(input.sessionID, parsed);

      // Global propagation — capture from input.model for ALL agent modes.
      // The feedback-loop guard (subagentSessions check) is handled in
      // captureGlobalModelPick via isPrimaryModelCaptureSession, but we
      // MUST capture user-driven model changes regardless of which agent
      // is active so the global model stays in sync when switching modes.
      const prev = previousModels.get(input.sessionID);
      const isPerSessionChanged = !prev ||
        prev.providerID !== parsed.providerID ||
        prev.modelID !== parsed.modelID;
      if (isPerSessionChanged) {
        captureGlobalModelPick(parsed, input.sessionID);
        previousModels.set(input.sessionID, parsed);
      }
      return;
    }
  }

  // Second priority: output.message.model set by our plugin (fallback when no input.model).
  // Session-local recording only — NEVER propagate to the global model from here:
  // output.message.model frequently contains our own fallback overrides, and
  // capturing those back would create a self-feedback loop.
  const modelOverride = output.message.model;
  if (
    modelOverride &&
    typeof modelOverride === "object" &&
    "providerID" in modelOverride &&
    "modelID" in modelOverride
  ) {
    const providerID =
      (modelOverride as { readonly providerID?: string }).providerID;
    const modelID = (modelOverride as { readonly modelID?: string }).modelID;
    if (typeof providerID === "string" && typeof modelID === "string") {
      setSessionModel(input.sessionID, { providerID, modelID });
    }
  }
}
