import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createWorktreeIsolationHook } from "./hook"

type WorktreeState = { worktree_path?: string }

function makeHook(deps: {
  sessionDirectory?: string
  getWorkForSession?: (cwd: string, sessionID: string) => WorktreeState | null
  resolveMainRepoRootSync?: (path: string) => string | null
  isUnderDirectory?: (child: string, parent: string) => boolean
  containsGitRedirectTo?: (cmd: string, main: string) => boolean
}) {
  return createWorktreeIsolationHook(deps)
}

function invokeHook(
  hook: ReturnType<typeof createWorktreeIsolationHook>,
  tool: string,
  sessionID: string,
  args: Record<string, unknown> = {},
) {
  return hook["tool.execute.before"]?.(
    { sessionID, tool, args } as never,
    { args } as never,
  )
}

describe("createWorktreeIsolationHook", () => {
  let tempDir = ""

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "worktree-iso-hook-test-"))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  // --- Early-exit cases ---

  it("#given no worktree binding #when any tool executes #then allow", async () => {
    const hook = makeHook({
      sessionDirectory: tempDir,
      getWorkForSession: () => null,
    })

    await expect(
      invokeHook(hook, "edit", "ses_no_wt", { file_path: join(tempDir, "file.ts") }),
    ).resolves.toBeUndefined()
  })

  it("#given empty sessionID #when tool executes #then allow (no crash)", async () => {
    const hook = makeHook({
      sessionDirectory: tempDir,
      getWorkForSession: () => null,
    })

    await expect(
      invokeHook(hook, "edit", "", { file_path: join(tempDir, "file.ts") }),
    ).resolves.toBeUndefined()
  })

  // --- Write tool blocking ---

  it("#given worktree binding + write tool targeting main checkout #when tool executes #then throw", async () => {
    const mainRepo = join(tempDir, "main")
    const worktree = join(tempDir, "wt")

    const hook = makeHook({
      sessionDirectory: worktree,
      getWorkForSession: () => ({ worktree_path: worktree }),
      resolveMainRepoRootSync: () => mainRepo,
      isUnderDirectory: (child, parent) => child === parent || child.startsWith(parent + "/"),
      containsGitRedirectTo: () => false,
    })

    await expect(
      invokeHook(hook, "edit", "ses_wt", { file_path: join(mainRepo, "file.ts") }),
    ).rejects.toThrow()
  })

  it("#given worktree binding + write tool targeting worktree #when tool executes #then allow", async () => {
    const mainRepo = join(tempDir, "main")
    const worktree = join(tempDir, "wt")

    const hook = makeHook({
      sessionDirectory: worktree,
      getWorkForSession: () => ({ worktree_path: worktree }),
      resolveMainRepoRootSync: () => mainRepo,
      isUnderDirectory: (child, parent) => child.startsWith(parent + "/") || child === parent,
      containsGitRedirectTo: () => false,
    })

    await expect(
      invokeHook(hook, "write", "ses_wt", { file_path: join(worktree, "file.ts") }),
    ).resolves.toBeUndefined()
  })

  it("#given worktree binding + write tool targeting unrelated path #when tool executes #then allow", async () => {
    const mainRepo = join(tempDir, "main")
    const worktree = join(tempDir, "wt")
    const unrelated = join(tempDir, "unrelated")

    const hook = makeHook({
      sessionDirectory: worktree,
      getWorkForSession: () => ({ worktree_path: worktree }),
      resolveMainRepoRootSync: () => mainRepo,
      isUnderDirectory: () => false,
      containsGitRedirectTo: () => false,
    })

    await expect(
      invokeHook(hook, "notebookedit", "ses_wt", { file_path: join(unrelated, "file.ts") }),
    ).resolves.toBeUndefined()
  })

  // --- Bash cwd blocking ---

  it("#given worktree binding + bash with cwd in main checkout #when tool executes #then throw", async () => {
    const mainRepo = join(tempDir, "main")
    const worktree = join(tempDir, "wt")

    const hook = makeHook({
      sessionDirectory: worktree,
      getWorkForSession: () => ({ worktree_path: worktree }),
      resolveMainRepoRootSync: () => mainRepo,
      isUnderDirectory: (child, parent) => child === parent || child.startsWith(parent + "/"),
      containsGitRedirectTo: () => false,
    })

    await expect(
      invokeHook(hook, "bash", "ses_wt", { command: "ls", cwd: mainRepo }),
    ).rejects.toThrow()
  })

  it("#given worktree binding + bash with cwd in worktree #when tool executes #then allow", async () => {
    const mainRepo = join(tempDir, "main")
    const worktree = join(tempDir, "wt")

    const hook = makeHook({
      sessionDirectory: worktree,
      getWorkForSession: () => ({ worktree_path: worktree }),
      resolveMainRepoRootSync: () => mainRepo,
      isUnderDirectory: (child, parent) => child.startsWith(parent + "/") || child === parent,
      containsGitRedirectTo: () => false,
    })

    await expect(
      invokeHook(hook, "bash", "ses_wt", { command: "ls", cwd: worktree }),
    ).resolves.toBeUndefined()
  })

  // --- Git redirect blocking ---

  it("#given worktree binding + bash with git -C redirect to main checkout #when tool executes #then throw", async () => {
    const mainRepo = join(tempDir, "main")
    const worktree = join(tempDir, "wt")

    const hook = makeHook({
      sessionDirectory: worktree,
      getWorkForSession: () => ({ worktree_path: worktree }),
      resolveMainRepoRootSync: () => mainRepo,
      isUnderDirectory: () => false,
      containsGitRedirectTo: (cmd, main) => cmd.includes("-C") && cmd.includes(main),
    })

    await expect(
      invokeHook(hook, "bash", "ses_wt", { command: `git -C ${mainRepo} status` }),
    ).rejects.toThrow()
  })

  it("#given worktree binding + bash with --git-dir redirect #when tool executes #then throw", async () => {
    const mainRepo = join(tempDir, "main")
    const worktree = join(tempDir, "wt")

    const hook = makeHook({
      sessionDirectory: worktree,
      getWorkForSession: () => ({ worktree_path: worktree }),
      resolveMainRepoRootSync: () => mainRepo,
      isUnderDirectory: () => false,
      containsGitRedirectTo: (cmd) => cmd.includes("--git-dir"),
    })

    await expect(
      invokeHook(hook, "bash", "ses_wt", { command: `git --git-dir=${mainRepo}/.git status` }),
    ).rejects.toThrow()
  })

  it("#given worktree binding + bash with GIT_DIR env var #when tool executes #then throw", async () => {
    const mainRepo = join(tempDir, "main")
    const worktree = join(tempDir, "wt")

    const hook = makeHook({
      sessionDirectory: worktree,
      getWorkForSession: () => ({ worktree_path: worktree }),
      resolveMainRepoRootSync: () => mainRepo,
      isUnderDirectory: () => false,
      containsGitRedirectTo: (cmd) => cmd.includes("GIT_DIR="),
    })

    await expect(
      invokeHook(hook, "bash", "ses_wt", { command: `GIT_DIR=${mainRepo}/.git git status` }),
    ).rejects.toThrow()
  })

  it("#given worktree binding + bash with cd into main checkout #when tool executes #then throw", async () => {
    const mainRepo = join(tempDir, "main")
    const worktree = join(tempDir, "wt")

    const hook = makeHook({
      sessionDirectory: worktree,
      getWorkForSession: () => ({ worktree_path: worktree }),
      resolveMainRepoRootSync: () => mainRepo,
      isUnderDirectory: () => false,
      containsGitRedirectTo: (cmd, main) =>
        cmd.includes("cd") && cmd.toLowerCase().includes(main.toLowerCase()),
    })

    await expect(
      invokeHook(hook, "bash", "ses_wt", { command: `cd ${mainRepo} && git status` }),
    ).rejects.toThrow()
  })

  // --- Non-blocked tools ---

  it("#given worktree binding + non-blocked tool #when tool executes #then allow", async () => {
    const mainRepo = join(tempDir, "main")
    const worktree = join(tempDir, "wt")

    const hook = makeHook({
      sessionDirectory: worktree,
      getWorkForSession: () => ({ worktree_path: worktree }),
      resolveMainRepoRootSync: () => mainRepo,
      isUnderDirectory: () => false,
      containsGitRedirectTo: () => false,
    })

    await expect(
      invokeHook(hook, "grep", "ses_wt", { pattern: "TODO" }),
    ).resolves.toBeUndefined()
  })
})
