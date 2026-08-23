import { getLastAgentFromSession } from "../../hooks/atlas/session-last-agent"
import { normalizeSDKResponse } from "../../shared/normalize-sdk-response"
import { getMainSessionID } from "../claude-code-session-state"
import {
  getEffectiveModelForAgent,
  getSessionModel,
  getSelectedGlobalModelLive,
  getPerAgentModelsSnapshot,
  type SessionModel,
} from "../../shared/session-model-state"
import type { AgentMode } from "../../agents/types"
import { MIRROR_SCHEMA_VERSION } from "./constants"
import { readActiveLoop } from "./loop-reader"
import { canonicalProjectDir } from "./mirror-path"
import type { TuiRuntimeSnapshot } from "./snapshot-schema"
import type { AgentStatus, JobRow } from "./state-types"
import type { BackgroundTaskSnapshot } from "../background-agent/types"

export type TuiMirrorClient = {
  readonly session: {
    readonly status: () => Promise<unknown>
    readonly messages: (input: { readonly path: { readonly id: string } }) => Promise<unknown>
  }
}

export type SessionStatusRow = {
  readonly type: string
}

export type SessionStatusMap = Record<string, SessionStatusRow>

export type TuiBackgroundSnapshotProvider = {
  readonly getTasksSnapshot: () => readonly BackgroundTaskSnapshot[]
}

export type SessionAgentResolver = (sessionID: string, client: TuiMirrorClient) => Promise<string | null>

export type BuildTuiRuntimeSnapshotInput = {
  readonly client: TuiMirrorClient
  readonly projectDir: string
  readonly backgroundManager: TuiBackgroundSnapshotProvider
  readonly getStatuses?: () => Promise<SessionStatusMap>
  readonly sessionAgentResolver?: SessionAgentResolver
}

type ActiveAgentStatus = Extract<AgentStatus, "busy" | "retry" | "running">

export async function buildTuiRuntimeSnapshot(
  input: BuildTuiRuntimeSnapshotInput,
): Promise<TuiRuntimeSnapshot> {
  const statuses = await readStatuses(input)
  const loop = readActiveLoop(input.projectDir)

  return {
    version: MIRROR_SCHEMA_VERSION,
    projectDir: canonicalProjectDir(input.projectDir),
    updatedAt: Date.now(),
    activeAgents: await activeAgentsFromStatuses(statuses, input.client, input.sessionAgentResolver ?? getLastAgentFromSession),
    jobBoard: input.backgroundManager.getTasksSnapshot().map(toJobRow),
    loop: loop.kind === "live" ? redactLoopText(loop) : null,
    tuiSelectedModel: getTuiSelectedModel(),
    perAgentModels: getPerAgentModelsSnapshot(),
  }
}

async function readStatuses(input: BuildTuiRuntimeSnapshotInput): Promise<SessionStatusMap> {
  if (input.getStatuses) {
    return input.getStatuses()
  }

  const response = await input.client.session.status()
  return normalizeSDKResponse<SessionStatusMap>(response, {})
}

const AGENT_MODE_MAP: Record<string, AgentMode> = {
  sisyphus: "primary",
  "sisyphus-junior": "subagent",
  atlas: "primary",
  hephaestus: "primary",
  oracle: "subagent",
  explore: "subagent",
  librarian: "subagent",
  metis: "subagent",
  momus: "subagent",
  "multimodal-looker": "subagent",
  prometheus: "primary",
}

function formatAgentModel(effective: SessionModel | null): string | undefined {
  if (!effective) return undefined
  return `${effective.providerID}/${effective.modelID}`
}

async function activeAgentsFromStatuses(
  statuses: SessionStatusMap,
  client: TuiMirrorClient,
  sessionAgentResolver: SessionAgentResolver,
): Promise<TuiRuntimeSnapshot["activeAgents"]> {
  const rows = Object.entries(statuses)
    .map(([sessionID, row]) => ({ sessionID, status: activeStatus(row.type) }))
    .filter((row): row is { readonly sessionID: string; readonly status: ActiveAgentStatus } => row.status !== null)

  return Promise.all(
    rows.map(async (row) => {
      const name = (await sessionAgentResolver(row.sessionID, client)) ?? row.sessionID
      const effective = getEffectiveModelForAgent(name)
      const fallbackModel = getSessionModel(row.sessionID)
      const model = formatAgentModel(effective) ?? (fallbackModel ? `${fallbackModel.providerID}/${fallbackModel.modelID}` : undefined)
      const mode = AGENT_MODE_MAP[name] ?? "subagent"
      return {
        name,
        status: row.status,
        ...(model ? { model } : {}),
        mode,
      }
    }),
  )
}

function activeStatus(status: string): ActiveAgentStatus | null {
  switch (status) {
    case "busy":
    case "retry":
    case "running":
      return status
    default:
      return null
  }
}

function toJobRow(task: BackgroundTaskSnapshot): JobRow {
  return {
    title: task.title || `${task.agent} background task`,
    status: task.status,
    toolCalls: task.toolCalls,
    lastTool: task.lastTool,
  }
}

function redactLoopText(loop: TuiRuntimeSnapshot["loop"]): TuiRuntimeSnapshot["loop"] {
  if (loop === null) {
    return null
  }
  return { ...loop, activeGoal: null }
}

function getTuiSelectedModel(): TuiRuntimeSnapshot["tuiSelectedModel"] {
  try {
    // First check: per-agent TUI model (new global TUI model state)
    const globalModel = getSelectedGlobalModelLive()
    if (globalModel) {
      return { providerID: globalModel.providerID, modelID: globalModel.modelID }
    }
    // Fallback: legacy per-session model from main session
    const mainSessionID = getMainSessionID()
    if (!mainSessionID) return null
    const sessionModel = getSessionModel(mainSessionID)
    if (!sessionModel) return null
    return { providerID: sessionModel.providerID, modelID: sessionModel.modelID }
  } catch {
    return null
  }
}
