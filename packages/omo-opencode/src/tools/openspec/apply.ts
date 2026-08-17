/**
 * apply.ts — OpenSpec apply logic.
 *
 * applySpec marks all pending tasks in a spec's tasks.md as in-progress.
 * Also handles session tracking (marking when the spec was applied).
 */

import { join } from "node:path"
import {
  resolveSpecFile,
  specExists,
  readSpecFile,
  writeSpecFile,
  markPendingAsInProgress,
} from "./store"

export interface ApplySpecResult {
  specName: string
  success: boolean
  applied: boolean
  message: string
}

/**
 * Marks all pending ([ ]) tasks in a spec's tasks.md as in-progress ([~]).
 * Idempotent: if all tasks are already in-progress, returns applied=false.
 *
 * @param projectDir  - toolContext.directory
 * @param specDir     - openspec.spec_dir config
 * @param specName    - name of the spec to apply
 * @param sessionID   - optional session ID for tracking
 */
export async function applySpec(
  projectDir: string,
  specDir: string,
  specName: string,
  sessionID?: string,
): Promise<ApplySpecResult> {
  const tasksFile = resolveSpecFile(projectDir, specDir, specName, "tasks.md")

  const exists = await specExists(tasksFile)
  if (!exists) {
    return {
      specName,
      success: false,
      applied: false,
      message: `Spec "${specName}" not found or has no tasks.md.`,
    }
  }

  const content = await readSpecFile(tasksFile)
  if (!content) {
    return { specName, success: false, applied: false, message: `Could not read tasks.md for "${specName}".` }
  }

  const updated = markPendingAsInProgress(content)
  if (!updated) {
    return {
      specName,
      success: true,
      applied: false,
      message: `Spec "${specName}" already has no pending tasks to apply.`,
    }
  }

  await writeSpecFile(tasksFile, updated)

  const msg = sessionID
    ? `Spec "${specName}" applied. Pending tasks marked in-progress (session: ${sessionID}).`
    : `Spec "${specName}" applied. All pending tasks marked in-progress.`

  return { specName, success: true, applied: true, message: msg }
}
