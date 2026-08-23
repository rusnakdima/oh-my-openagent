import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"

const DEFAULT_WORKTREE_BASE_DIR = path.join(os.homedir(), ".omo", "worktrees")

/**
 * Returns true if `childPath` is inside (or equal to) `parentPath`.
 * Both paths are resolved to absolute real paths.
 */
export function isUnderDirectory(childPath: string, parentPath: string): boolean {
  const realChild = path.resolve(childPath)
  const realParent = path.resolve(parentPath)
  return realChild === realParent || realChild.startsWith(realParent + path.sep)
}

/**
 * Run a git command synchronously.
 */
function runGitSync(args: readonly string[], cwd?: string): { code: number; stdout: string; stderr: string } {
  const result = spawnSync("git", [...args], { cwd, encoding: "utf8" })
  return {
    code: result.status ?? 0,
    stdout: (result.stdout as string) ?? "",
    stderr: (result.stderr as string) ?? "",
  }
}

/**
 * Detect whether the given path is a git worktree.
 * Returns the worktree root path if it is, null otherwise.
 *
 * Strategy: run `git -C <path> rev-parse --show-toplevel`.
 * - In a worktree: returns the worktree root path (not the main repo).
 * - In main checkout: returns the main checkout root.
 * - Not a git repo: non-zero exit code or empty.
 */
export function detectWorktreePath(worktreePath: string): string | null {
  const result = runGitSync(["rev-parse", "--show-toplevel"], worktreePath)
  if (result.code !== 0) return null
  const root = result.stdout.trim()
  if (!root) return null
  // If we're in a worktree, the reported toplevel is the worktree itself.
  // If we're in the main checkout, it returns the main checkout path.
  // If they match, it's the main checkout (not a worktree).
  const resolved = path.resolve(root)
  const given = path.resolve(worktreePath)
  return resolved === given ? null : resolved
}

/**
 * Resolve the main repository root from a worktree path.
 *
 * From within a worktree:
 * - `git rev-parse --show-superproject-working-tree` returns the superproject root
 *   (empty if this is not a submodule worktree).
 * - `git rev-parse --git-common-dir` returns `.git` or `../.git` relative path.
 *
 * Strategy:
 * 1. Try `git rev-parse --show-superproject-working-tree` — empty means not in a superproject.
 * 2. Fall back to `git rev-parse --git-common-dir`, then resolve `.git` parent → main repo root.
 */
export function resolveMainRepoRoot(worktreePath: string): string | null {
  // --show-superproject-working-tree returns empty if not in a worktree or no superproject.
  const superResult = runGitSync(["rev-parse", "--show-superproject-working-tree"], worktreePath)
  if (superResult.code === 0 && superResult.stdout.trim()) {
    return path.resolve(superResult.stdout.trim())
  }

  // Fall back: git-common-dir points to .git (or ../.git), parent of that is the main repo root.
  const commonResult = runGitSync(["rev-parse", "--git-common-dir"], worktreePath)
  if (commonResult.code !== 0) return null

  const gitDir = commonResult.stdout.trim()
  // gitDir is either ".git" or an absolute path like "/path/to/repo/.git"
  if (path.isAbsolute(gitDir)) {
    return path.dirname(gitDir)
  }
  // Relative path like ".git" or "../.git"
  return path.resolve(path.dirname(path.join(worktreePath, gitDir)))
}

/** Synchronous alias for resolveMainRepoRoot (same implementation, sync git commands only). */
export const resolveMainRepoRootSync = resolveMainRepoRoot

/**
 * Check whether a command string contains git redirect constructs targeting main checkout.
 * Patterns: git -C <path>, --git-dir=<path>, GIT_DIR=<path>, GIT_WORK_TREE=<path>,
 * or cd into main checkout directory.
 */
export function containsGitRedirectTo(command: string, mainCheckoutPath: string): boolean {
  const mainNormalized = mainCheckoutPath.toLowerCase()

  // git -C <path> — only blocked if it targets the main checkout
  const normalizedCmd = command.toLowerCase()
  const mainLower = mainNormalized.toLowerCase()
  // After lowercasing, -C becomes -c; check for -c flag followed by main path
  if (normalizedCmd.includes(`-c ${mainLower}`)) return true

  // --git-dir=<path>, --git-dir <path>, --work-tree=<path>, --work-tree <path>, GIT_DIR=<path>, GIT_WORK_TREE=<path>
  if (/\bgit\s+--(?:git-dir|work-tree)[=\s]/i.test(command) || /GIT_(?:WORK_)?TREE|DIR=/i.test(command)) return true

  // cd into main checkout
  if (/\bcd\s+\S*/.test(command) && command.includes(mainNormalized)) return true

  return false
}

/**
 * Resolve the worktree base directory.
 */
export function resolveWorktreeBaseDir(): string {
  return DEFAULT_WORKTREE_BASE_DIR
}
