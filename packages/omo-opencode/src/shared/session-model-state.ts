import { AGENT_MODEL_REQUIREMENTS, CATEGORY_MODEL_REQUIREMENTS } from "./model-requirements"

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
}

export function getSelectedGlobalModel(): SessionModel | null {
  return globalTuiModel
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

// --- Effective model resolution ---
// Priority: 1. TUI-selected global model (overrides all)  2. Built-in fallback chain

export function getEffectiveModelForAgent(agentName: string): SessionModel | null {
  if (globalTuiModel) return globalTuiModel
  return getBuiltinFallback(agentName)
}
