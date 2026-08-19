export type SessionModel = { providerID: string; modelID: string }

// Per-session model storage (used for OpenCode session binding)
const sessionModels = new Map<string, SessionModel>()

// Global TUI model — applies to ALL agents unless overridden
let globalTuiModel: SessionModel | null = null

// Per-agent model overrides — takes priority over globalTuiModel
const perAgentModels = new Map<string, SessionModel>()

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

// --- Effective model resolution (per-agent > global) ---

export function getEffectiveModelForAgent(agentName: string): SessionModel | null {
  const perAgent = perAgentModels.get(agentName)
  if (perAgent) return perAgent
  return globalTuiModel
}
