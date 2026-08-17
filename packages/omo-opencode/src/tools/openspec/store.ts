/**
 * store.ts — File I/O helpers for OpenSpec tools.
 *
 * All functions accept (projectDir, specDir, specName?) and resolve paths relative
 * to the project root. Uses toolContext.directory as the project root, and
 * config.spec_dir as the spec root (relative to project root).
 */

import { readFile, writeFile, readdir, stat, mkdir, rename } from "node:fs/promises"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"

export type { OpenSpecReadArgs } from "./types"
export type { OpenSpecVerifyArgs } from "./types"
export type { OpenSpecStatusArgs } from "./types"
export type { OpenSpecProposeArgs } from "./types"
export type { OpenSpecApplyArgs } from "./types"
export type { OpenSpecArchiveArgs } from "./types"

// ─── Path resolution ─────────────────────────────────────────────────────────

/** Resolved spec root: projectDir / specDir */
export function resolveSpecRoot(projectDir: string, specDir: string): string {
  return join(projectDir, specDir)
}

/** Resolved path to a specific spec file: projectDir / specDir / specName / file */
export function resolveSpecFile(
  projectDir: string,
  specDir: string,
  specName: string,
  file: "spec.md" | "plan.md" | "tasks.md",
): string {
  return join(projectDir, specDir, specName, file)
}

/** Resolved path to the root spec file (no specName): projectDir / specDir / file */
export function resolveRootSpecFile(
  projectDir: string,
  specDir: string,
  file: "spec.md" | "plan.md" | "tasks.md",
): string {
  return join(projectDir, specDir, file)
}

// ─── Atomic file write ───────────────────────────────────────────────────────

/**
 * Write content to a path atomically: writes to a tmp file then renames.
 * Avoids partial-write corruption on concurrent access.
 */
export async function writeSpecFile(path: string, content: string): Promise<void> {
  const tmp = join(
    tmpdir(),
    `openspec-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`,
  )
  await writeFile(tmp, content, "utf-8")
  await rename(tmp, path)
}

// ─── File existence check ────────────────────────────────────────────────────

/** Returns true if the path exists (file or directory). */
export async function specExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Returns true if path is a directory. */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isDirectory()
  } catch {
    return false
  }
}

// ─── Safe read ───────────────────────────────────────────────────────────────

/** Reads a file as string, returns null if it doesn't exist or is not readable. */
export async function readSpecFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8")
  } catch {
    return null
  }
}

// ─── Spec directory listing ────────────────────────────────────────────────────

/**
 * Lists all spec subdirectories under specRoot.
 * Skips "ARCHIVE" and ".tmp".
 */
export async function listSpecs(specRoot: string): Promise<string[]> {
  let entries: string[]
  try {
    entries = await readdir(specRoot)
  } catch {
    return []
  }

  const specs: string[] = []
  for (const entry of entries) {
    if (entry === "ARCHIVE" || entry === ".tmp") continue
    const specPath = join(specRoot, entry)
    if (await isDirectory(specPath)) {
      if (await specExists(join(specPath, "spec.md"))) {
        specs.push(entry)
      }
    }
  }
  return specs.sort()
}

// ─── Task file parsing ───────────────────────────────────────────────────────

export interface TaskStats {
  open: number
  in_progress: number
  completed: number
  blocked: number
}

/**
 * Parses a tasks.md file and returns counts per status marker.
 * Markers: [ ] pending, [~] in_progress, [x] completed, [!!] blocked
 */
export function parseTaskStats(content: string): TaskStats {
  const stats: TaskStats = { open: 0, in_progress: 0, completed: 0, blocked: 0 }
  for (const line of content.split("\n")) {
    if (line.includes("[ ]")) stats.open++
    else if (line.includes("[~]")) stats.in_progress++
    else if (line.includes("[x]")) stats.completed++
    else if (line.includes("[!!]")) stats.blocked++
  }
  return stats
}

// ─── Task write-back ─────────────────────────────────────────────────────────

/**
 * Marks all pending ( [ ] ) tasks in tasks.md as in-progress ( [~] ).
 * Returns the updated content, or null if no changes were made.
 */
export function markPendingAsInProgress(content: string): string | null {
  const updated = content.replace(/^(\| \[ \] \|)/gm, "| [~] |")
  return updated === content ? null : updated
}

/**
 * Marks all in-progress ( [~] ) tasks in tasks.md as completed ( [x] ).
 * Returns the updated content, or null if no changes were made.
 */
export function markInProgressAsCompleted(content: string): string | null {
  const updated = content.replace(/^(\| \[~\] \|)/gm, "| [x] |")
  return updated === content ? null : updated
}
