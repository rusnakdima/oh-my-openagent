import type { Hooks } from "@opencode-ai/plugin";
import { getWorkForSession } from "@oh-my-opencode/boulder-state";
import {
  containsGitRedirectTo,
  isUnderDirectory,
  resolveMainRepoRootSync,
} from "./resolver";
import { log } from "../../shared/logger";

/** Tools whose operations are blocked from targeting the main checkout while in a worktree. */
const BLOCKED_WRITE_TOOLS = new Set(["edit", "write", "notebookedit"]);
/** Tools whose cwd is checked against the main checkout while in a worktree. */
const BLOCKED_CWD_TOOLS = new Set(["bash", "powershell", "interactive_bash"]);

export interface WorktreeIsolationDeps {
  /**
   * The session's working directory. Defaults to process.cwd().
   * Inject a test value in unit tests to control path resolution.
   */
  sessionDirectory?: string;
  /**
   * Override getWorkForSession for testing.
   * Defaults to the real boulder-state implementation.
   */
  getWorkForSession?: (
    cwd: string,
    sessionID: string,
  ) => { worktree_path?: string } | null;
  /**
   * Override resolveMainRepoRootSync for testing.
   * Defaults to the real resolver.
   */
  resolveMainRepoRootSync?: (worktreePath: string) => string | null;
  /**
   * Override isUnderDirectory for testing.
   * Defaults to the real resolver.
   */
  isUnderDirectory?: (child: string, parent: string) => boolean;
  /**
   * Override containsGitRedirectTo for testing.
   * Defaults to the real resolver.
   */
  containsGitRedirectTo?: (
    command: string,
    mainCheckoutPath: string,
  ) => boolean;
}

const defaultDeps: WorktreeIsolationDeps = {};

export function createWorktreeIsolationHook(
  deps: WorktreeIsolationDeps = defaultDeps,
): Hooks {
  const {
    sessionDirectory = process.cwd(),
    getWorkForSession: getWorkForSessionFn = getWorkForSession,
    resolveMainRepoRootSync: resolveMainRepoRootSyncFn =
      resolveMainRepoRootSync,
    isUnderDirectory: isUnderDirectoryFn = isUnderDirectory,
    containsGitRedirectTo: containsGitRedirectToFn = containsGitRedirectTo,
  } = deps;

  return {
    "tool.execute.before": async (
      input: {
        sessionID?: string;
        tool?: string;
        args?: Record<string, unknown>;
      },
      output: { args?: Record<string, unknown> },
    ) => {
      const sessionID = input.sessionID ?? "";
      if (!sessionID) return;

      const tool = input.tool ?? "";

      // Only enforce for active worktree sessions
      const worktreePath = getWorktreePathForSession(
        sessionID,
        sessionDirectory,
        getWorkForSessionFn,
      );
      if (!worktreePath) return;

      const toolLower = tool.toLowerCase();

      // 1. Write tool blocking: edit/write/notebookedit → block if targeting main checkout
      if (BLOCKED_WRITE_TOOLS.has(toolLower)) {
        const targetPath = resolveWriteTargetPath(input, output);
        if (targetPath) {
          const mainRepoRoot = resolveMainRepoRootSyncFn(worktreePath);
          if (mainRepoRoot && isUnderDirectoryFn(targetPath, mainRepoRoot)) {
            log("[worktree-isolation] Blocking write to main checkout", {
              sessionID,
              tool,
              targetPath,
              mainRepoRoot,
              worktreePath,
            });
            throw new Error(
              `[worktree-isolation] Cannot write to main checkout ${mainRepoRoot} from worktree ${worktreePath}. ` +
                "Target files inside the worktree instead.",
            );
          }
        }
      }

      // 2. Bash/powershell cwd blocking: block if cwd resolves to main checkout
      if (BLOCKED_CWD_TOOLS.has(toolLower)) {
        const cwd = resolveToolCwd(input, output, sessionDirectory) ?? "";
        const mainRepoRoot = resolveMainRepoRootSyncFn(worktreePath);
        if (mainRepoRoot && isUnderDirectoryFn(cwd, mainRepoRoot)) {
          log("[worktree-isolation] Blocking bash targeting main checkout", {
            sessionID,
            tool,
            cwd,
            mainRepoRoot,
            worktreePath,
          });
          throw new Error(
            `[worktree-isolation] Cannot run ${tool} with cwd in main checkout ${mainRepoRoot} from worktree ${worktreePath}. ` +
              "Use a path inside the worktree.",
          );
        }

        // 3. Git redirect blocking: detect git -C, --git-dir, GIT_DIR, etc.
        const command = resolveToolCommand(input, output);
        if (
          command && mainRepoRoot &&
          containsGitRedirectToFn(command, mainRepoRoot)
        ) {
          log("[worktree-isolation] Blocking git redirect into main checkout", {
            sessionID,
            tool,
            command,
          });
          throw new Error(
            `[worktree-isolation] Git redirect into main checkout ${mainRepoRoot} is blocked from within a worktree.`,
          );
        }
      }
    },
  };
}

/**
 * Get the worktree path bound to a session from boulder state.
 */
function getWorktreePathForSession(
  sessionID: string,
  cwd: string,
  getWorkForSessionFn: (
    cwd: string,
    sessionID: string,
  ) => { worktree_path?: string } | null,
): string | null {
  try {
    const state = getWorkForSessionFn(cwd, sessionID);
    return state?.worktree_path ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract the file path from write/edit tool arguments.
 */
function resolveWriteTargetPath(
  input: unknown,
  output: unknown,
): string | null {
  const i = input as { args?: Record<string, unknown> } | undefined;
  const o = output as { args?: Record<string, unknown> } | undefined;
  const args = o?.args ?? i?.args ?? {};
  // edit/write tools typically have a 'file_path' or 'path' arg
  const filePath = (args.file_path as string) ?? (args.path as string) ?? null;
  return filePath;
}

/**
 * Extract the working directory from the tool's context.
 * Uses sessionDirectory as the authoritative cwd (injected; defaults to process.cwd()).
 */
function resolveToolCwd(
  input: unknown,
  output: unknown,
  sessionDirectory: string,
): string | null {
  const i = input as { args?: Record<string, unknown> } | undefined;
  const o = output as { args?: Record<string, unknown> } | undefined;
  const args = o?.args ?? i?.args ?? {};
  const cwd = (args.cwd as string) ?? sessionDirectory;
  return cwd;
}

/**
 * Extract the command string from bash/powershell tool.
 */
function resolveToolCommand(input: unknown, output: unknown): string | null {
  const i = input as { args?: Record<string, unknown> } | undefined;
  const o = output as { args?: Record<string, unknown> } | undefined;
  const args = o?.args ?? i?.args ?? {};
  return (args.command as string) ?? (args.script as string) ?? null;
}
