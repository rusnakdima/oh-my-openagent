import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createWorktreeCleanupHook } from "./hook"

type WorktreeState = { worktree_path?: string; session_ids?: string[] }

function makeCleanupHook(deps: {
  sessionDirectory?: string
  getWorkForSession?: (cwd: string, sessionID: string) => WorktreeState | null
  writeBoulderState?: (cwd: string, state: unknown) => void
  removeWorktree?: (path: string) => Promise<void>
  isWorktreeClean?: (path: string) => boolean
}) {
  return createWorktreeCleanupHook(deps as never)
}

function emitSessionDeleted(
  hook: ReturnType<typeof createWorktreeCleanupHook>,
  sessionID: string,
) {
  return hook.event?.({
    event: { type: "session.deleted", properties: { info: { id: sessionID } } },
  } as never)
}

function emitNonSessionDeleted(hook: ReturnType<typeof createWorktreeCleanupHook>) {
  return hook.event?.({
    event: { type: "session.created", properties: {} },
  } as never)
}

describe("createWorktreeCleanupHook", () => {
  let tempDir = ""

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "worktree-cleanup-hook-test-"))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it("#given session.deleted with worktree binding and clean worktree #when event fires #then remove worktree", async () => {
    const worktreePath = join(tempDir, "wt-clean")
    let removedPath: string | null = null
    const writeCalls: Array<{ cwd: string; state: unknown }> = []

    const hook = makeCleanupHook({
      sessionDirectory: tempDir,
      getWorkForSession: () => ({ worktree_path: worktreePath }),
      writeBoulderState: (cwd, state) => writeCalls.push({ cwd, state }),
      removeWorktree: async (path) => {
        removedPath = path
      },
      isWorktreeClean: () => true,
    })

    await emitSessionDeleted(hook, "ses_clean")

    expect(removedPath).toBe(worktreePath)
    // Boulder state should be updated to clear worktree_path
    expect(writeCalls.some((c) => c.cwd === tempDir)).toBe(true)
    const clearedCall = writeCalls.find((c) => c.cwd === tempDir)
    expect(clearedCall).toBeDefined()
    const clearedState = clearedCall!.state as Record<string, unknown>
    expect(clearedState.worktree_path).toBeUndefined()
  })

  it("#given session.deleted with worktree binding and dirty worktree #when event fires #then leave worktree on disk", async () => {
    const worktreePath = join(tempDir, "wt-dirty")
    let removedPath: string | null = null
    const writeCalls: Array<{ cwd: string; state: unknown }> = []

    const hook = makeCleanupHook({
      sessionDirectory: tempDir,
      getWorkForSession: () => ({ worktree_path: worktreePath }),
      writeBoulderState: (cwd, state) => writeCalls.push({ cwd, state }),
      removeWorktree: async (path) => {
        removedPath = path
      },
      isWorktreeClean: () => false, // dirty — has changes
    })

    await emitSessionDeleted(hook, "ses_dirty")

    // removeWorktree should NOT have been called
    expect(removedPath).toBeNull()
    // Boulder state should still be updated to clear worktree_path
    expect(writeCalls.some((c) => c.cwd === tempDir)).toBe(true)
    const clearedCall = writeCalls.find((c) => c.cwd === tempDir)
    expect(clearedCall).toBeDefined()
    const clearedState = clearedCall!.state as Record<string, unknown>
    expect(clearedState.worktree_path).toBeUndefined()
  })

  it("#given session.deleted with no worktree binding #when event fires #then no-op", async () => {
    let removedPath: string | null = null
    let writeCalled = false

    const hook = makeCleanupHook({
      sessionDirectory: tempDir,
      getWorkForSession: () => null, // no binding
      writeBoulderState: () => {
        writeCalled = true
      },
      removeWorktree: async (path) => {
        removedPath = path
      },
      isWorktreeClean: () => true,
    })

    await emitSessionDeleted(hook, "ses_no_wt")

    expect(removedPath).toBeNull()
    expect(writeCalled).toBe(false)
  })

  it("#given session.deleted with non-existent sessionID #when event fires #then no-op", async () => {
    let removedPath: string | null = null
    let writeCalled = false

    const hook = makeCleanupHook({
      sessionDirectory: tempDir,
      getWorkForSession: () => null,
      writeBoulderState: () => {
        writeCalled = true
      },
      removeWorktree: async (path) => {
        removedPath = path
      },
      isWorktreeClean: () => true,
    })

    await emitSessionDeleted(hook, "ses_nonexistent")

    expect(removedPath).toBeNull()
    expect(writeCalled).toBe(false)
  })

  it("#given non-session.deleted event #when event fires #then no-op", async () => {
    let removedPath: string | null = null
    let writeCalled = false

    const hook = makeCleanupHook({
      sessionDirectory: tempDir,
      getWorkForSession: () => ({ worktree_path: join(tempDir, "wt") }),
      writeBoulderState: () => {
        writeCalled = true
      },
      removeWorktree: async (path) => {
        removedPath = path
      },
      isWorktreeClean: () => true,
    })

    await emitNonSessionDeleted(hook)

    expect(removedPath).toBeNull()
    expect(writeCalled).toBe(false)
  })
})
