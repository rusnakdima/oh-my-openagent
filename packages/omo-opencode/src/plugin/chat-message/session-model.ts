import {
  getMainSessionID,
  getSessionAgent,
  subagentSessions,
} from "../../features/claude-code-session-state";
import {
  getSessionModel,
  getSelectedGlobalModelLive,
  setSessionModel,
} from "../../shared/session-model-state";
import { getOpencodeConfigDefaultModel } from "../../shared/config-default-model";
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

// Baseline per (session, agent) pair: the first input.model observed there.
// A LATER different model for the SAME pair is always an explicit mid-session
// user pick (/models). The FIRST observation is ambiguous — it can be either
// OpenCode's restored per-mode model OR a pick made before the first send —
// so it is classified against known restore sources (see detectUserModelPick).
const observedSessionModels = new Map<
  string,
  { providerID: string; modelID: string }
>();

// Last input.model seen per AGENT (any session, this process). One of the
// restore sources for first-observation classification: when the user opens a
// new conversation and switches to a mode that already ran elsewhere in this
// app run, OpenCode restores exactly that mode's last-used model.
const lastSeenModelByAgent = new Map<
  string,
  { providerID: string; modelID: string }
>();

function parseModelRef(
  model: unknown,
): { providerID: string; modelID: string } | null {
  if (
    typeof model === "object" &&
    model !== null &&
    "providerID" in model &&
    "modelID" in model &&
    typeof model.providerID === "string" &&
    typeof model.modelID === "string"
  ) {
    return { providerID: model.providerID, modelID: model.modelID };
  }
  if (typeof model === "string" && model.includes("/")) {
    const parts = model.split("/");
    const modelID = parts.pop()!;
    return { providerID: parts.join("/"), modelID };
  }
  return null;
}

function observedSessionModelsKey(input: ChatMessageInput): string {
  const agent = input.agent ?? getSessionAgent(input.sessionID) ?? "";
  return `${input.sessionID}\u0000${agent}`;
}

function sameModelRef(
  a: { providerID: string; modelID: string },
  b: { providerID: string; modelID: string },
): boolean {
  return a.providerID === b.providerID && a.modelID === b.modelID;
}

/**
 * Restore sources explainable WITHOUT user action, used to classify a
 * first-observation input.model:
 * - the current global pick (fresh sessions/modes inherit it),
 * - the opencode.jsonc boot default (what OpenCode boots every mode on),
 * - this session's effective model so far (recorded from message.updated —
 *   covers fallback-shifted sessions),
 * - this agent's last-used model in this process (per-mode client memory).
 */
function isKnownRestoredModel(
  input: ChatMessageInput,
  parsed: { providerID: string; modelID: string },
): boolean {
  const agent = input.agent ?? getSessionAgent(input.sessionID);
  const candidates = [
    getSelectedGlobalModelLive(),
    getOpencodeConfigDefaultModel(),
    getSessionModel(input.sessionID),
    agent ? lastSeenModelByAgent.get(agent) : undefined,
  ];
  return candidates.some((c) => c !== undefined && c !== null && sameModelRef(c, parsed));
}

/**
 * Classify this message's input.model as a restored session model or an
 * explicit user PICK, and capture only picks into the global model store.
 *
 * MUST run BEFORE applyGlobalModelToChatMessage so a fresh pick lands in the
 * global heap and the very same message's LLM call uses it (no one-message
 * lag). Restores must never overwrite the global pick (bug #2); genuine picks
 * — including one made before the first message of a fresh session — must
 * propagate instantly (bug #1).
 */
export function detectUserModelPick(
  input: ChatMessageInput,
  pluginConfig: OhMyOpenCodeConfig,
): void {
  const parsed = parseModelRef(input.model);
  if (!parsed) return;

  const key = observedSessionModelsKey(input);
  const agent = input.agent ?? getSessionAgent(input.sessionID);
  const baseline = observedSessionModels.get(key);

  if (!baseline) {
    // First observation for this session+agent pair. Only classify as a pick
    // when no legitimate restore source explains the value.
    observedSessionModels.set(key, parsed);
    if (
      !isKnownRestoredModel(input, parsed) &&
      isPrimaryModelCaptureSession(input.sessionID, agent, pluginConfig)
    ) {
      captureGlobalModelPick(parsed, input.sessionID);
    }
  } else if (!sameModelRef(baseline, parsed)) {
    // Same session, same agent, different model → explicit user pick.
    observedSessionModels.set(key, parsed);
    if (isPrimaryModelCaptureSession(input.sessionID, agent, pluginConfig)) {
      captureGlobalModelPick(parsed, input.sessionID);
    }
  }

  // Track the per-agent last-used model AFTER classification so the current
  // message's own value can never count as a known restore source for itself.
  if (agent && !subagentSessions.has(input.sessionID)) {
    lastSeenModelByAgent.set(agent, parsed);
  }
}

/** Test-only: clear baseline and per-agent tracking between tests. */
export function _resetSessionModelTrackingForTesting(): void {
  observedSessionModels.clear();
  lastSeenModelByAgent.clear();
}


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
): void {
  log("[recordSessionModel]", {
    inputModel: input.model,
    outputModel: output.message.model,
    sessionID: input.sessionID.slice(0, 8),
  });

  // First priority: input.model — session-local recording only. Global
  // propagation of user picks lives exclusively in detectUserModelPick.
  const parsed = parseModelRef(input.model);
  if (parsed) {
    setSessionModel(input.sessionID, parsed);
    return;
  }

  // Second priority: output.message.model set by our plugin (fallback when no input.model).
  // Session-local recording only — NEVER propagate to the global model from here:
  // output.message.model frequently contains our own fallback overrides, and
  // capturing those back would create a self-feedback loop.
  const modelOverride = output.message.model;
  if (
    typeof modelOverride === "object" &&
    modelOverride !== null &&
    "providerID" in modelOverride &&
    "modelID" in modelOverride &&
    typeof modelOverride.providerID === "string" &&
    typeof modelOverride.modelID === "string"
  ) {
    setSessionModel(input.sessionID, {
      providerID: modelOverride.providerID,
      modelID: modelOverride.modelID,
    });
  }
}
