import type { Hooks } from "@opencode-ai/plugin"
import {
  getWorkForSession,
  writeBoulderState,
  type BoulderState,
} from "@oh-my-opencode/boulder-state"
import { removeWorktree } from "@oh-my-opencode/team-core/team-worktree/cleanup"
import { spawnSync } from "node:child_process"
import { resolveSessionEventID } from "../../shared/event-session-id"
import { log } from "../../shared/logger"

function runGit(args: readonly string[], cwd?: string): { code: number; stdout: string; stderr: string } {
  const result = spawnSync("git", [...args], { cwd, encoding: "utf8" })
  return {
    code: result.status ?? 0,
    stdout: (result.stdout as string) ?? "",
    stderr: (result.stderr as string) ?? "",
  }
}

/**
 * Check if a worktree has any uncommitted changes or untracked files.
 * Returns true if the worktree is clean (no changes).
 */
function isWorktreeClean(worktreePath: string): boolean {
  const result = runGit(["status", "--porcelain"], worktreePath)
  // status --porcelain returns empty output if clean
  return result.code === 0 && result.stdout.trim() === ""
}

export interface WorktreeCleanupDeps {
  /**
   * The session's working directory. Defaults to process.cwd().
   */
  sessionDirectory?: string
  /**
   * Override getWorkForSession for testing.
   */
  getWorkForSession?: (cwd: string, sessionID: string) => { worktree_path?: string } | null
  /**
   * Override writeBoulderState for testing.
   */
  writeBoulderState?: (cwd: string, state: BoulderState) => void
  /**
   * Override removeWorktree for testing.
   */
  removeWorktree?: (path: string) => Promise<void>
  /**
   * Override isWorktreeClean for testing.
   */
  isWorktreeClean?: (path: string) => boolean
}

const defaultDeps: WorktreeCleanupDeps = {}

export function createWorktreeCleanupHook(deps: WorktreeCleanupDeps = defaultDeps): Hooks {
  const {
    sessionDirectory = process.cwd(),
    getWorkForSession: getWorkForSessionFn = getWorkForSession,
    writeBoulderState: writeBoulderStateFn = writeBoulderState,
    removeWorktree: removeWorktreeFn = removeWorktree,
    isWorktreeClean: isWorktreeCleanFn = isWorktreeClean,
  } = deps

  return {
    event: async ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type !== "session.deleted") return

      const sessionID = resolveSessionEventID(event.properties)
      if (!sessionID) return

      log("[worktree-cleanup] Checking worktree cleanup for session", { sessionID })

      const cwd = sessionDirectory
      const state = getWorkForSessionFn(cwd, sessionID)
      const worktreePath = state?.worktree_path

      if (!worktreePath) {
        log("[worktree-cleanup] No worktree bound to session", { sessionID })
        return
      }

      // Check if worktree is actually on disk
      const clean = isWorktreeCleanFn(worktreePath)
      if (clean) {
        log("[worktree-cleanup] Worktree is clean, removing", { sessionID, worktreePath })
        try {
          await removeWorktreeFn(worktreePath)
          log("[worktree-cleanup] Worktree removed successfully", { sessionID, worktreePath })
        } catch (err) {
          log("[worktree-cleanup] Failed to remove worktree", { sessionID, worktreePath, error: String(err) })
        }
      } else {
        log("[worktree-cleanup] Worktree has uncommitted changes, leaving on disk", {
          sessionID,
          worktreePath,
        })
      }

      // Clear worktree_path from boulder state
      if (state) {
        const { worktree_path: _, ...stateWithoutWorktree } = state
        writeBoulderStateFn(cwd, {
          ...stateWithoutWorktree,
          worktree_path: undefined,
        } as BoulderState)
      }
    },
  }
}
