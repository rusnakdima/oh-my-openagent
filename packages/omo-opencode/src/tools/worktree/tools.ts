import path from "node:path"

import { tool, type ToolContext, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { getWorkForSession, writeBoulderState, type BoulderState } from "@oh-my-opencode/boulder-state"
import { detectWorktreePath, resolveMainRepoRoot } from "../../hooks/start-work/worktree-detector"
import { log } from "../../shared/logger"

/**
 * Dependencies for worktree tools. All fields are optional with real-implementation defaults.
 * Tests override individual deps to isolate behavior.
 */
export interface WorktreeToolsDeps {
  sessionDirectory?: string
  getWorkForSession?: (cwd: string, sessionID: string) => { worktree_path?: string; session_ids?: string[] } | null
  writeBoulderState?: (cwd: string, state: BoulderState) => void
  detectWorktreePath?: (directory: string) => string | null
  resolveMainRepoRoot?: (directory: string) => string | null
}

const defaultDeps: WorktreeToolsDeps = {}

const realGetWorkForSession: (cwd: string, sessionID: string) => BoulderState | null = getWorkForSession
const realWriteBoulderState: (cwd: string, state: BoulderState) => void = writeBoulderState
const realDetectWorktreePath: (directory: string) => string | null = detectWorktreePath
const realResolveMainRepoRoot: (directory: string) => string | null = resolveMainRepoRoot

/**
 * Returns the absolute main-repository root, derived from the given worktree path.
 * Used by tools that need to report where the "main" checkout lives.
 */
function deriveMainRepoRoot(worktreePath: string, deps: WorktreeToolsDeps): string {
  const resolveFn = deps.resolveMainRepoRoot ?? realResolveMainRepoRoot
  const mainRoot = resolveFn!(worktreePath)
  return mainRoot || "<unknown: git rev-parse failed>"
}

/**
 * Create worktree tools with dependency injection.
 * Tests pass mock deps; production uses the default (real implementations).
 */
export function createWorktreeTools(deps: WorktreeToolsDeps = defaultDeps): {
  enterWorktreeTool: ToolDefinition
  exitWorktreeTool: ToolDefinition
} {
  const sessionDirectory = deps.sessionDirectory ?? process.cwd()
  const getWorkForSessionFn = deps.getWorkForSession ?? realGetWorkForSession
  const writeBoulderStateFn = deps.writeBoulderState ?? realWriteBoulderState
  const detectWorktreePathFn = deps.detectWorktreePath ?? realDetectWorktreePath

  const enterWorktreeTool: ToolDefinition = tool({
    description:
      "Enter a git worktree, switching the session's active working directory to it. " +
      "Use this to switch from the main checkout to an existing worktree you have created. " +
      "The session will subsequently operate inside the worktree, isolated from the main checkout.",
    args: {
      path: tool.schema
        .string()
        .describe("Absolute path to the git worktree directory to enter"),
    },
    execute: async (args: { path: string }, context: ToolContext) => {
      const worktreePath = path.resolve(args.path)
      const sessionID = context.sessionID

      log(`[worktree] enter_worktree: ${worktreePath} for session ${sessionID}`)

      // Validate the path is actually a git worktree by running git from within it.
      const detected = detectWorktreePathFn(worktreePath)
      if (!detected) {
        throw new Error(
          `[enter_worktree] Path ${worktreePath} is not a git worktree. ` +
            "Run 'git worktree list' to see existing worktrees.",
        )
      }

      // Update boulder state: set worktree_path for this session
      const cwd = sessionDirectory
      const existing = getWorkForSessionFn(cwd, sessionID)
      const updatedState = {
        ...(existing ?? { session_ids: [] }),
        worktree_path: worktreePath,
      }
      writeBoulderStateFn(cwd, updatedState as BoulderState)

      const mainRoot = deriveMainRepoRoot(worktreePath, deps)
      return `Entered worktree at ${worktreePath} (main checkout: ${mainRoot}). All file operations will now target this worktree.`
    },
  })

  const exitWorktreeTool: ToolDefinition = tool({
    description:
      "Exit the current git worktree and return to operating in the main repository checkout. " +
      "Use this when you are done with isolated work in a worktree and want to return to the main session.",
    args: {},
    execute: async (_args: Record<string, never>, context: ToolContext) => {
      const sessionID = context.sessionID

      log(`[worktree] exit_worktree for session ${sessionID}`)

      // Detect current worktree — must be inside one to exit
      const currentWorktree = detectWorktreePathFn(sessionDirectory)
      if (!currentWorktree) {
        throw new Error(
          "[exit_worktree] You are not currently inside a git worktree. Nothing to exit.",
        )
      }

      // Resolve main repo root from the current worktree
      const resolveMainRepoRootFn = deps.resolveMainRepoRoot ?? realResolveMainRepoRoot
      const mainRoot = resolveMainRepoRootFn!(currentWorktree)
      if (!mainRoot) {
        throw new Error(
          "[exit_worktree] Could not determine the main repository root from the current worktree. " +
            "Is this a valid git worktree?",
        )
      }

      // Update boulder state: clear worktree_path
      const cwd = sessionDirectory
      const existing = getWorkForSessionFn(cwd, sessionID)
      if (!existing) {
        throw new Error("[exit_worktree] No boulder state found for this session. Are you inside a worktree?")
      }
      const { worktree_path: _, ...stateWithoutWorktree } = existing
      writeBoulderStateFn(cwd, {
        ...stateWithoutWorktree,
        worktree_path: undefined,
      } as BoulderState)

      return `Exited worktree at ${currentWorktree}. Now operating in main checkout at ${mainRoot}.`
    },
  })

  return { enterWorktreeTool, exitWorktreeTool }
}

// Default instances (production use)
// Note: explicit cast needed because ToolDefinition type references Bun Zod internals
// which aren't portable across TypeScript compiler versions
const tools = createWorktreeTools()
const enterWorktreeTool: ToolDefinition = tools.enterWorktreeTool
const exitWorktreeTool: ToolDefinition = tools.exitWorktreeTool
export { enterWorktreeTool, exitWorktreeTool }
