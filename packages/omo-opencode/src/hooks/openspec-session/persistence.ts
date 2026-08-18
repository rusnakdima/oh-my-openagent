/**
 * persistence.ts — File-based persistence for injectedSessions.
 *
 * Pattern mirrors goal/store.ts: per-session files under .omo/openspec/sessions/
 * with atomic writes (tmp + renameSync) to prevent partial-write corruption.
 */

import { randomUUID } from "node:crypto"
import { mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const STORE_VERSION = 1

export type SessionRecord = {
  readonly specName: string
  readonly injectedAt: number
}

type SessionFile = {
  readonly version: number
  readonly specName: string
  readonly injectedAt: number
}

function sessionFilePath(baseDir: string, sessionID: string): string {
  // sessionID is expected to be a plain UUID string (no special chars)
  // Use directly as filename — no encodeURIComponent needed for UUIDs
  return join(baseDir, `${sessionID}.json`)
}

function ensureSessionDir(baseDir: string): void {
  mkdirSync(baseDir, { recursive: true })
}

export function readSessionRecord(baseDir: string, sessionID: string): SessionRecord | null {
  const filePath = sessionFilePath(baseDir, sessionID)
  let raw: string
  try {
    raw = readFileSync(filePath, "utf-8")
  } catch (error) {
    if (isErrorWithCode(error) && error.code === "ENOENT") {
      return null
    }
    throw error
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "specName" in parsed &&
      typeof (parsed as SessionFile).specName === "string" &&
      "injectedAt" in parsed &&
      typeof (parsed as SessionFile).injectedAt === "number"
    ) {
      return {
        specName: (parsed as SessionFile).specName,
        injectedAt: (parsed as SessionFile).injectedAt,
      }
    }
    return null
  } catch {
    return null
  }
}

export function writeSessionRecord(baseDir: string, sessionID: string, record: SessionRecord): void {
  ensureSessionDir(baseDir)
  const filePath = sessionFilePath(baseDir, sessionID)
  const tempPath = `${filePath}.tmp.${randomUUID()}`
  const file: SessionFile = { version: STORE_VERSION, specName: record.specName, injectedAt: record.injectedAt }
  writeFileSync(tempPath, JSON.stringify(file, null, 2), "utf-8")
  renameSync(tempPath, filePath)
}

export function deleteSessionRecord(baseDir: string, sessionID: string): boolean {
  const filePath = sessionFilePath(baseDir, sessionID)
  try {
    unlinkSync(filePath)
    return true
  } catch (error) {
    if (isErrorWithCode(error) && error.code === "ENOENT") {
      return true
    }
    return false
  }
}

/**
 * Load all session records from the sessions directory.
 * Returns a Map of sessionID -> specName.
 * The sessionID in the result is the decoded (usable) form.
 */
export function loadAllSessionRecords(baseDir: string): Map<string, string> {
  const result = new Map<string, string>()
  let entries: string[]
  try {
    entries = readdirSync(baseDir)
  } catch {
    return result
  }

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue
    // entry is the raw filename from readdirSync (sessionID, not URL-encoded)
    // Use it directly as the file path and as the Map key
    const sessionID = entry.replace(/\.json$/, "")
    const filePath = join(baseDir, entry)
    let raw: string
    try {
      raw = readFileSync(filePath, "utf-8")
    } catch {
      continue
    }

    try {
      const parsed = JSON.parse(raw) as unknown
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "specName" in parsed &&
        typeof (parsed as SessionFile).specName === "string" &&
        "injectedAt" in parsed &&
        typeof (parsed as SessionFile).injectedAt === "number"
      ) {
        result.set(sessionID, (parsed as SessionFile).specName)
      }
    } catch {
      // skip malformed
    }
  }

  return result
}

function isErrorWithCode(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && typeof (error as { code: unknown }).code === "string"
}
