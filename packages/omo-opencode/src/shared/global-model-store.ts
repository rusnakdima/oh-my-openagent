import { mkdirSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

import { writeFileAtomically } from "./write-file-atomically"
import { log } from "./logger"
import type { SessionModel } from "./session-model-state"

// Cross-process store for the user's global model pick.
//
// The TUI plugin (src/tui.ts) and the server plugin (config/chat hooks) run in
// separate processes with separate heaps. This small JSON file under the XDG
// data dir is the only reliable channel between them (same pattern as the
// tui-sidebar mirror files — see features/tui-sidebar/mirror-path.ts).
const GLOBAL_MODEL_SCHEMA_VERSION = 1

type PersistedGlobalModel = {
  version: number
  providerID: string
  modelID: string
  updatedAt: string
}

export function globalModelStorePath(): string {
  return join(
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
    "opencode",
    "storage",
    "oh-my-openagent",
    "global-model.json",
  )
}

// mtime-keyed cache so the hot per-message read is a stat, not a parse
let cachedRead: { mtimeMs: number; model: SessionModel | null } | null = null

function parsePersisted(raw: string): SessionModel | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedGlobalModel>
    if (
      parsed.version !== GLOBAL_MODEL_SCHEMA_VERSION ||
      typeof parsed.providerID !== "string" ||
      parsed.providerID.length === 0 ||
      typeof parsed.modelID !== "string" ||
      parsed.modelID.length === 0
    ) {
      return null
    }
    return { providerID: parsed.providerID, modelID: parsed.modelID }
  } catch {
    return null
  }
}

/**
 * Read the persisted global model pick. Cheap (mtime-cached) and safe to call
 * per chat.message. Missing/unreadable/invalid store degrades to null — never throws.
 */
export function readPersistedGlobalModel(): SessionModel | null {
  const storePath = globalModelStorePath()
  try {
    const mtimeMs = statSync(storePath).mtimeMs
    if (cachedRead && cachedRead.mtimeMs === mtimeMs) {
      return cachedRead.model
    }
    const model = parsePersisted(readFileSync(storePath, "utf-8"))
    cachedRead = { mtimeMs, model }
    return model
  } catch {
    return null
  }
}

/**
 * Persist the global model pick for cross-process propagation and future sessions.
 * Atomic write (mode 0600); failures are logged and non-fatal.
 */
export function persistGlobalModel(model: SessionModel): void {
  const storePath = globalModelStorePath()
  const payload: PersistedGlobalModel = {
    version: GLOBAL_MODEL_SCHEMA_VERSION,
    providerID: model.providerID,
    modelID: model.modelID,
    updatedAt: new Date().toISOString(),
  }
  try {
    mkdirSync(dirname(storePath), { recursive: true })
    writeFileAtomically(storePath, JSON.stringify(payload), { mode: 0o600 })
    cachedRead = {
      mtimeMs: statSync(storePath).mtimeMs,
      model: { providerID: model.providerID, modelID: model.modelID },
    }
  } catch (error) {
    log("[global-model-store] persist failed", { error })
  }
}

/** @internal For testing only — drop the mtime cache between XDG sandboxes. */
export function _resetGlobalModelStoreCacheForTesting(): void {
  cachedRead = null
}
