import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createWorktreeTools, type WorktreeToolsDeps } from "./tools";

type BoulderState = { worktree_path?: string; session_ids?: string[] };

let mockWorktreeStates: Map<string, BoulderState> = new Map();

const mockGetWorkForSession = (
  _cwd: string,
  sessionID: string,
): BoulderState | null => {
  return mockWorktreeStates.get(sessionID) ?? null;
};

const mockWriteBoulderState = (_cwd: string, state: BoulderState) => {
  for (const sessionID of state.session_ids ?? []) {
    const existing = mockWorktreeStates.get(sessionID) ?? {};
    mockWorktreeStates.set(sessionID, { ...existing, ...state });
  }
  return true;
};

const makeTools = (extraDeps: Partial<WorktreeToolsDeps> = {}) => {
  return createWorktreeTools({
    getWorkForSession: mockGetWorkForSession,
    writeBoulderState: mockWriteBoulderState,
    ...extraDeps,
  });
};

const mockContext = (sessionID: string) => ({ sessionID } as never);

describe("worktree tools", () => {
  let tempDir = "";
  let worktreeDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "worktree-tools-test-"));
    worktreeDir = join(tempDir, "worktrees", "my-worktree");
    mockWorktreeStates = new Map();
    // Seed a session for exit_worktree tests
    mockWorktreeStates.set("test_session", { session_ids: ["test_session"] });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("enter_worktree", () => {
    it("#given enter_worktree with valid worktree path #when execute #then store worktree_path in boulder state", async () => {
      const { enterWorktreeTool } = makeTools({
        sessionDirectory: tempDir,
        detectWorktreePath: (
          p: string,
        ) => (p === worktreeDir ? worktreeDir : null),
      });

      const result = await enterWorktreeTool.execute?.(
        { path: worktreeDir } as never,
        mockContext("test_session"),
      );

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: expect.stringContaining("my-worktree"),
          },
        ],
      });

      const stored = mockWorktreeStates.get("test_session");
      expect(stored?.worktree_path).toContain("my-worktree");
    });

    it("#given enter_worktree with non-existent session_id #when execute #then still store worktree_path", async () => {
      const { enterWorktreeTool } = makeTools({
        sessionDirectory: tempDir,
        detectWorktreePath: (
          p: string,
        ) => (p === worktreeDir ? worktreeDir : null),
      });

      const result = await enterWorktreeTool.execute?.(
        { path: worktreeDir } as never,
        mockContext("new_session"),
      );

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: expect.stringContaining("my-worktree"),
          },
        ],
      });
    });
  });

  describe("exit_worktree", () => {
    it("#given exit_worktree when inside worktree #when execute #then clear worktree_path from boulder state", async () => {
      // Pre-store a worktree binding
      mockWorktreeStates.set("test_session", {
        session_ids: ["test_session"],
        worktree_path: worktreeDir,
      });

      const { exitWorktreeTool } = makeTools({
        sessionDirectory: worktreeDir, // cwd is the worktree dir
        detectWorktreePath: () => worktreeDir, // detect this as a worktree
        resolveMainRepoRoot: () => tempDir, // main repo is tempDir
      });

      const result = await exitWorktreeTool.execute?.(
        {} as never,
        mockContext("test_session"),
      );

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: expect.stringContaining("exited"),
          },
        ],
      });

      const cleared = mockWorktreeStates.get("test_session");
      expect(cleared?.worktree_path).toBeUndefined();
    });

    it("#given exit_worktree when not inside worktree (no worktree_path in state) #when execute #then throw error", async () => {
      // State exists but no worktree_path
      mockWorktreeStates.set("test_session", { session_ids: ["test_session"] });

      const { exitWorktreeTool } = makeTools({
        sessionDirectory: tempDir,
        detectWorktreePath: () => null, // not inside a git worktree directory
      });

      await expect(
        exitWorktreeTool.execute?.({} as never, mockContext("test_session")),
      ).rejects.toThrow("You are not currently inside a git worktree");
    });

    it("#given exit_worktree with no boulder state for session #when execute #then throw error", async () => {
      // No state at all for this session
      mockWorktreeStates.delete("ghost_session");

      const { exitWorktreeTool } = makeTools({
        sessionDirectory: tempDir,
        detectWorktreePath: () => worktreeDir, // is in a worktree
        resolveMainRepoRoot: () => tempDir, // resolve to temp dir as main repo
      });

      await expect(
        exitWorktreeTool.execute?.({} as never, mockContext("ghost_session")),
      ).rejects.toThrow("No boulder state found for this session");
    });
  });
});
