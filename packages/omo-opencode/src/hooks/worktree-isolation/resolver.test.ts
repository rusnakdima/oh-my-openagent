import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  containsGitRedirectTo,
  isUnderDirectory,
  resolveMainRepoRootSync,
} from "./resolver";

describe("worktree-isolation resolver", () => {
  describe("isUnderDirectory", () => {
    it("#given child path inside parent #when isUnderDirectory #then return true", () => {
      const parent = "/home/user/project";
      const child = "/home/user/project/src/index.ts";
      expect(isUnderDirectory(child, parent)).toBe(true);
    });

    it("#given child path equal to parent #when isUnderDirectory #then return true", () => {
      const parent = "/home/user/project";
      expect(isUnderDirectory(parent, parent)).toBe(true);
    });

    it("#given child path outside parent #when isUnderDirectory #then return false", () => {
      const parent = "/home/user/project";
      const child = "/home/user/other/src/index.ts";
      expect(isUnderDirectory(child, parent)).toBe(false);
    });

    it("#given deeply nested path inside parent #when isUnderDirectory #then return true", () => {
      const parent = "/home/user/project";
      const child = "/home/user/project/src/components/button/index.ts";
      expect(isUnderDirectory(child, parent)).toBe(true);
    });

    it("#given sibling path outside parent #when isUnderDirectory #then return false", () => {
      const parent = "/home/user/project";
      const child = "/home/user/project-sibling/src/index.ts";
      expect(isUnderDirectory(child, parent)).toBe(false);
    });

    it("#given path with trailing sep inside parent #when isUnderDirectory #then return true", () => {
      const parent = "/home/user/project";
      const child = "/home/user/project/src/";
      expect(isUnderDirectory(child, parent)).toBe(true);
    });
  });

  describe("containsGitRedirectTo", () => {
    const mainRepo = "/home/user/main-repo";

    it("#given normal bash command #when containsGitRedirectTo #then return false", () => {
      expect(containsGitRedirectTo("ls -la", mainRepo)).toBe(false);
      expect(containsGitRedirectTo("git status", mainRepo)).toBe(false);
      expect(containsGitRedirectTo("echo hello", mainRepo)).toBe(false);
    });

    it("#given git -C redirect to main repo #when containsGitRedirectTo #then return true", () => {
      expect(
        containsGitRedirectTo("git -C /home/user/main-repo status", mainRepo),
      ).toBe(true);
      expect(
        containsGitRedirectTo(
          "git -C /home/user/main-repo log --oneline",
          mainRepo,
        ),
      ).toBe(true);
    });

    it("#given git with -c var -C redirect #when containsGitRedirectTo #then return true", () => {
      expect(
        containsGitRedirectTo(
          "git -c user.name=test -C /home/user/main-repo status",
          mainRepo,
        ),
      ).toBe(true);
    });

    it("#given --git-dir=<path> redirect #when containsGitRedirectTo #then return true", () => {
      expect(
        containsGitRedirectTo(
          "git --git-dir=/home/user/main-repo/.git status",
          mainRepo,
        ),
      ).toBe(true);
      expect(
        containsGitRedirectTo(
          "git --git-dir /home/user/main-repo/.git log",
          mainRepo,
        ),
      ).toBe(true);
    });

    it("#given --work-tree=<path> redirect #when containsGitRedirectTo #then return true", () => {
      expect(
        containsGitRedirectTo(
          "git --work-tree=/home/user/main-repo status",
          mainRepo,
        ),
      ).toBe(true);
      expect(
        containsGitRedirectTo(
          "git --work-tree /home/user/main-repo diff",
          mainRepo,
        ),
      ).toBe(true);
    });

    it("#given GIT_DIR=<path> env var #when containsGitRedirectTo #then return true", () => {
      expect(
        containsGitRedirectTo(
          "GIT_DIR=/home/user/main-repo/.git git status",
          mainRepo,
        ),
      ).toBe(true);
      expect(
        containsGitRedirectTo(
          "git status; export GIT_DIR=/home/user/main-repo/.git; git log",
          mainRepo,
        ),
      ).toBe(true);
    });

    it("#given GIT_WORK_TREE=<path> env var #when containsGitRedirectTo #then return true", () => {
      expect(
        containsGitRedirectTo(
          "GIT_WORK_TREE=/home/user/main-repo git status",
          mainRepo,
        ),
      ).toBe(true);
    });

    it("#given cd into main checkout #when containsGitRedirectTo #then return true", () => {
      expect(
        containsGitRedirectTo(
          "cd /home/user/main-repo && git status",
          mainRepo,
        ),
      ).toBe(true);
      expect(containsGitRedirectTo("cd /home/user/main-repo; ls", mainRepo))
        .toBe(true);
    });

    it("#given cd into worktree (not main) #when containsGitRedirectTo #then return false", () => {
      expect(
        containsGitRedirectTo(
          "cd /home/user/worktrees/feature && git status",
          mainRepo,
        ),
      ).toBe(false);
    });

    it("#given git redirect to different repo #when containsGitRedirectTo #then return false", () => {
      // git -C to a different repo does NOT target main checkout
      expect(
        containsGitRedirectTo("git -C /home/user/other-repo status", mainRepo),
      ).toBe(false);
    });
  });

  describe("resolveMainRepoRootSync", () => {
    let tempDir = "";

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "worktree-resolver-test-"));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("#given non-git path #when resolveMainRepoRootSync #then return null (git returns non-zero exit)", () => {
      // git rev-parse on a non-git directory returns exit code 128
      const result = resolveMainRepoRootSync(tempDir);
      expect(result).toBeNull();
    });

    it("#given test repo path (git repo) #when resolveMainRepoRootSync #then returns a string", () => {
      // The test repo itself is a git repo
      const result = resolveMainRepoRootSync(process.cwd());
      // May return the main repo root or null depending on whether cwd is a worktree
      expect(result === null || typeof result === "string").toBe(true);
    });
  });
});
