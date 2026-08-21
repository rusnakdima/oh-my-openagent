import os from "node:os"
import path from "node:path"

import pc from "picocolors"
import { spawn } from "@oh-my-opencode/utils"

const DEFAULT_WORKTREE_BASE_DIR = path.join(os.homedir(), ".omo", "worktrees")

async function runGit(args: readonly string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = spawn({ cmd: ["git", ...args], cwd, stdout: "pipe", stderr: "pipe" })
  const [exitCode, stdoutText, stderrText] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { code: exitCode, stdout: stdoutText, stderr: stderrText }
}

/**
 * Resolve a worktree name or path.
 * - If the value contains a path separator (/), treat it as an explicit absolute or relative path.
 * - Otherwise, treat it as a name → ~/.omo/worktrees/<name>
 */
export function resolveWorktreePath(worktreeSpec: string): string {
  if (worktreeSpec.includes("/") || worktreeSpec.startsWith(".")) {
    return path.resolve(worktreeSpec)
  }
  return path.join(DEFAULT_WORKTREE_BASE_DIR, worktreeSpec)
}

/**
 * Check whether a worktree directory already exists on disk.
 */
export function worktreeExists(worktreePath: string): Promise<boolean> {
  // Use git worktree list to check — this is authoritative even for locked worktrees.
  return runGit(["worktree", "list", "--porcelain"]).then((result) => {
    if (result.code !== 0) return false
    return result.stdout.split("\n").some((line) => line.startsWith("worktree ") && line.slice(9).trim() === worktreePath)
  })
}

/**
 * Create a new git worktree at the given path, branched from the current HEAD.
 * Returns the absolute path of the created worktree.
 * @param worktreePath Absolute path for the worktree
 * @param repoRoot Root of the git repository (cwd for git worktree add)
 */
export async function createWorktreeForRun(worktreePath: string, repoRoot: string): Promise<string> {
  const branchName = `worktree/${path.basename(worktreePath)}`
  console.log(pc.blue(`Creating git worktree at ${worktreePath}`))
  const result = await runGit(["worktree", "add", "--detach", worktreePath, "-b", branchName], repoRoot)
  if (result.code !== 0) {
    throw new Error(`git worktree add failed: ${result.stderr.trim() || result.stdout.trim()}`)
  }
  console.log(pc.green(`Worktree created at ${worktreePath}`))
  return worktreePath
}

/**
 * Resolve and (if needed) create a worktree for the `opencode run --worktree` flow.
 *
 * Strategy:
 * - Resolve the worktree path from the spec (name → ~/.omo/worktrees/<name>, or absolute path)
 * - If it already exists (checked via git worktree list), reuse it
 * - Otherwise create it via git worktree add --detach
 *
 * Returns the absolute worktree path to use as the session's working directory.
 */
export async function resolveOrCreateWorktree(worktreeSpec: string, repoRoot: string): Promise<string> {
  const worktreePath = resolveWorktreePath(worktreeSpec)
  const exists = await worktreeExists(worktreePath)
  if (exists) {
    console.log(pc.dim(`Reusing existing worktree at ${worktreePath}`))
    return worktreePath
  }
  return createWorktreeForRun(worktreePath, repoRoot)
}
