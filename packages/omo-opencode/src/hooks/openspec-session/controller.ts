/**
 * controller.ts — OpenSpec session hook controller.
 *
 * Mirrors createGoalController from goal/controller.ts.
 * Provides propose/verify/apply/archive/status/list operations.
 */

import { join } from "node:path"
import { rename } from "node:fs/promises"
import {
  resolveSpecRoot,
  resolveSpecFile,
  specExists,
  readSpecFile,
  writeSpecFile,
  listSpecs,
  isDirectory,
} from "../../tools/openspec/store"
import { applySpec } from "../../tools/openspec/apply"
import { verifySpec, type SpecVerificationResult } from "../../tools/openspec/verify"

export type OpenSpecControllerOptions = {
  readonly projectDir: string
  readonly specDir?: string
}

export type OpenSpecController = ReturnType<typeof createOpenSpecController>

export function createOpenSpecController(options: OpenSpecControllerOptions) {
  const { projectDir, specDir = "openspec" } = options

  return {
    /**
     * Propose a new spec — creates spec.md, plan.md, tasks.md stubs.
     * Description is embedded in spec.md.
     */
    async propose(specName: string, description?: string): Promise<{
      success: boolean
      message: string
    }> {
      const specPath = join(projectDir, specDir, specName)

      if (await specExists(specPath)) {
        return {
          success: false,
          message: `Spec "${specName}" already exists at ${specDir}/${specName}/.`,
        }
      }

      const { mkdir } = await import("node:fs/promises")
      await mkdir(specPath, { recursive: true })

      const specContent = description
        ? `# ${specName}\n\n${description}\n`
        : `# ${specName}\n`
      const planContent = `# ${specName} — Technical Plan\n\n(Not yet written)\n`
      const taskLines = `# Tasks\n\n| Status | Description |\n| ------ | ----------- |\n`

      await writeSpecFile(resolveSpecFile(projectDir, specDir, specName, "spec.md"), specContent)
      await writeSpecFile(resolveSpecFile(projectDir, specDir, specName, "plan.md"), planContent)
      await writeSpecFile(resolveSpecFile(projectDir, specDir, specName, "tasks.md"), taskLines)

      return {
        success: true,
        message: `Spec "${specName}" proposed at ${specDir}/${specName}/`,
      }
    },

    /**
     * Verify a named spec (or all specs if name omitted).
     */
    async verify(specName?: string): Promise<SpecVerificationResult[]> {
      return verifySpec(projectDir, specDir, specName)
    },

    /**
     * Apply a spec — mark all pending tasks as in-progress.
     */
    async apply(specName: string, sessionID?: string) {
      return applySpec(projectDir, specDir, specName, sessionID)
    },

    /**
     * Archive a spec — move it to ARCHIVE/ subdirectory.
     */
    async archive(specName: string): Promise<{ success: boolean; message: string }> {
      const specRoot = resolveSpecRoot(projectDir, specDir)
      const srcPath = join(specRoot, specName)
      const archivePath = join(specRoot, "ARCHIVE")
      const destPath = join(archivePath, specName)

      if (!(await specExists(srcPath))) {
        return { success: false, message: `Spec "${specName}" not found.` }
      }
      if (await specExists(destPath)) {
        return { success: false, message: `Archived spec "${specName}" already exists in ARCHIVE/.` }
      }

      const { mkdir } = await import("node:fs/promises")
      await mkdir(archivePath, { recursive: true })
      await rename(srcPath, destPath)

      return { success: true, message: `Spec "${specName}" archived to ${specDir}/ARCHIVE/${specName}/` }
    },

    /**
     * Show status of all specs (name + task stats summary).
     */
    async status(): Promise<Array<{ specName: string; valid: boolean; taskStats?: import("../../tools/openspec/store").TaskStats }>> {
      const results = await verifySpec(projectDir, specDir)
      return results.map((r) => ({
        specName: r.specName,
        valid: r.valid,
        taskStats: r.taskStats,
      }))
    },

    /**
     * List all known spec names (excluding ARCHIVE/).
     */
    async list() {
      const specRoot = resolveSpecRoot(projectDir, specDir)
      const specs = await listSpecs(specRoot)
      return specs
    },
  }
}
