/**
 * verify.ts — OpenSpec verification logic.
 *
 * Verifies a spec by checking all 3 required files exist and are non-empty.
 * Returns a structured result with the status of each file.
 */

import { join } from "node:path";
import {
  listSpecs,
  parseTaskStats,
  readSpecFile,
  resolveSpecFile,
  resolveSpecRoot,
  specExists,
  type TaskStats,
} from "./store";

export interface SpecVerificationFile {
  name: "spec.md" | "plan.md" | "tasks.md";
  exists: boolean;
  nonEmpty: boolean;
}

export interface SpecVerificationResult {
  specName: string;
  valid: boolean;
  files: SpecVerificationFile[];
  taskStats?: TaskStats;
  error?: string;
}

/**
 * Verifies a single named spec or all specs if specName is omitted.
 *
 * @param projectDir  - toolContext.directory (session working directory)
 * @param specDir     - openspec.spec_dir config value
 * @param specName    - optional specific spec name; if omitted, verifies all specs
 */
export async function verifySpec(
  projectDir: string,
  specDir: string,
  specName?: string,
): Promise<SpecVerificationResult[]> {
  const specRoot = resolveSpecRoot(projectDir, specDir);
  const toVerify = specName ? [specName] : await listSpecs(specRoot);

  const results: SpecVerificationResult[] = [];

  for (const spec of toVerify) {
    const specPath = join(specRoot, spec);
    const specFile = resolveSpecFile(projectDir, specDir, spec, "spec.md");
    const planFile = resolveSpecFile(projectDir, specDir, spec, "plan.md");
    const tasksFile = resolveSpecFile(projectDir, specDir, spec, "tasks.md");

    const files: SpecVerificationFile[] = [
      { name: "spec.md", exists: await specExists(specFile), nonEmpty: false },
      { name: "plan.md", exists: await specExists(planFile), nonEmpty: false },
      {
        name: "tasks.md",
        exists: await specExists(tasksFile),
        nonEmpty: false,
      },
    ];

    // Check non-empty
    for (const f of files) {
      if (f.exists) {
        const content = await readSpecFile(
          resolveSpecFile(projectDir, specDir, spec, f.name),
        );
        f.nonEmpty = content !== null && content.trim().length > 0;
      }
    }

    const allExist = files.every((f) => f.exists);
    const allNonEmpty = files.every((f) => f.nonEmpty);
    const valid = allExist && allNonEmpty;

    let taskStats: TaskStats | undefined;
    if (valid && files[2].exists) {
      const tasksContent = await readSpecFile(tasksFile);
      if (tasksContent) {
        taskStats = parseTaskStats(tasksContent);
      }
    }

    results.push({ specName: spec, valid, files, taskStats });
  }

  return results;
}
