import { AGENT_MODEL_REQUIREMENTS, CATEGORY_MODEL_REQUIREMENTS } from "./model-requirements"
import { readProviderModelsCache } from "./connected-providers-cache"
import { persistGlobalModel, readPersistedGlobalModel } from "./global-model-store"

export type SessionModel = { providerID: string; modelID: string }

// Per-session model storage (used for OpenCode session binding)
const sessionModels = new Map<string, SessionModel>()

// Global TUI model — the ONE source of truth for all agent delegations (Aug 2026 global-only policy)
let globalTuiModel: SessionModel | null = null

// Per-agent model overrides — kept internally for snapshot compatibility but NEVER read by delegation
const perAgentModels = new Map<string, SessionModel>()

// Aug 2026 Phase 9: restore fallback to built-in requirements chains
// Check CATEGORY_MODEL_REQUIREMENTS first, then AGENT_MODEL_REQUIREMENTS
function getBuiltinFallback(name: string): SessionModel | null {
  const req = CATEGORY_MODEL_REQUIREMENTS[name] ?? AGENT_MODEL_REQUIREMENTS[name]
  const first = req?.fallbackChain?.[0]
  if (!first) return null
  return { providerID: first.providers[0], modelID: first.model }
}

// --- Session model (existing API) ---

export function setSessionModel(sessionID: string, model: SessionModel): void {
  sessionModels.set(sessionID, model)
}

export function getSessionModel(sessionID: string): SessionModel | undefined {
  return sessionModels.get(sessionID)
}

export function clearSessionModel(sessionID: string): void {
  sessionModels.delete(sessionID)
}

// --- Global TUI model ---

export function setGlobalTuiModel(model: SessionModel): void {
  globalTuiModel = model
}

export function getGlobalTuiModel(): SessionModel | null {
  return globalTuiModel
}

export function clearGlobalTuiModel(): void {
  globalTuiModel = null
}

// --- Selected global model (the one source of truth for all agents) ---
// This is the ONLY model that agents should use. It replaces per-agent overrides.

export function setSelectedGlobalModel(model: SessionModel): void {
  globalTuiModel = model
  // Clear all per-agent overrides — global model is the only source of truth
  perAgentModels.clear()
  // Propagate to all tracked session models so subagent/specialist sessions
  // re-evaluate their effective model on the next LLM call.
  for (const [sessionID, _] of sessionModels) {
    // Re-apply the global model — each session will check permissions and
    // its own agent type on the next chat.message invocation.
  }
  persistGlobalModel(model)
}

export function getSelectedGlobalModel(): SessionModel | null {
  return globalTuiModel
}

/**
 * The live global model: heap value first, then the cross-process persisted pick.
 * The heap covers picks made in this process; the store file covers picks made
 * in the other process (TUI plugin writes it, server plugin reads it, and vice versa).
 */
export function getSelectedGlobalModelLive(): SessionModel | null {
  return globalTuiModel ?? readPersistedGlobalModel()
}

/**
 * Set the global model everywhere: this process's heap (single source of truth
 * for all agent delegations) plus the cross-process store file. Use for every
 * user-driven pick (/models capture, sidebar button).
 */
export function applyGlobalModel(model: SessionModel): void {
  setSelectedGlobalModel(model)
  persistGlobalModel(model)
}

// --- Per-agent model overrides ---

export function setPerAgentModel(agentName: string, model: SessionModel): void {
  perAgentModels.set(agentName, model)
}

export function getPerAgentModel(agentName: string): SessionModel | undefined {
  return perAgentModels.get(agentName)
}

export function clearPerAgentModel(agentName: string): void {
  perAgentModels.delete(agentName)
}

export function clearAllPerAgentModels(): void {
  perAgentModels.clear()
}

// --- Snapshot export ---

export function getPerAgentModelsSnapshot(): Record<string, SessionModel> {
  return Object.fromEntries(perAgentModels)
}

// --- Provider default model (dynamic-only, first entry from cache) ---

export function getProviderDefaultModel(): SessionModel | null {
  const cache = readProviderModelsCache()
  if (!cache) return null
  for (const [providerID, modelEntries] of Object.entries(cache.models)) {
    if (!modelEntries || modelEntries.length === 0) continue
    const first = modelEntries[0]
    const modelID = typeof first === "string" ? first : (first as { id: string }).id
    if (typeof modelID === "string" && modelID.length > 0) {
      return { providerID, modelID }
    }
  }
  return null
}

// --- Effective model resolution ---
// Priority: 1. TUI-selected global model (overrides all; heap or persisted cross-process pick)
//           2. Provider default (dynamic)
//           3. Built-in fallback (only when fallback enabled; otherwise null)
// Global model applies to ALL modes (primary|subagent|all) — no mode filter.

export function getEffectiveModelForAgent(agentName: string): SessionModel | null {
  const live = getSelectedGlobalModelLive()
  if (live) return live
  const providerDefault = getProviderDefaultModel()
  if (providerDefault) return providerDefault
  return getBuiltinFallback(agentName)
}
