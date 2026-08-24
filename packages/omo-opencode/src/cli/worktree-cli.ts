import os from "node:os";
import path from "node:path";

import color from "picocolors";
import { spawn } from "@oh-my-opencode/utils";
import { findOrphanWorktrees, isGitAvailable } from "@oh-my-opencode/team-core";

const DEFAULT_WORKTREE_BASE_DIR = path.join(os.homedir(), ".omo", "worktrees");

interface WorktreeEntry {
  path: string;
  branch: string;
  isMain: boolean;
}

async function runGit(
  args: readonly string[],
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = spawn({
    cmd: ["git", ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdoutText, stderrText] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code: exitCode, stdout: stdoutText, stderr: stderrText };
}

async function resolveWorktreePath(
  name: string,
  explicitPath?: string,
): Promise<string> {
  return explicitPath ?? path.join(DEFAULT_WORKTREE_BASE_DIR, name);
}

function parseWorktreeListLine(line: string): WorktreeEntry | null {
  // Format: /path/to/worktree SHA1 branch-name (detached)
  const trimmed = line.trim();
  if (!trimmed) return null;

  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return null;

  const worktreePath = trimmed.slice(0, spaceIndex);
  const remainder = trimmed.slice(spaceIndex + 1).trim();

  // Check for detached HEAD state
  const isDetached = remainder.startsWith("(") &&
    remainder.includes("detached");
  const isMain = remainder.includes("(main)") || remainder.includes("(master)");

  let branch = "";
  if (isDetached) {
    // e.g. "(detached at abc1234)"
    const match = remainder.match(/\(detached at ([^)]+)\)/);
    branch = match ? match[1] : "(detached)";
  } else {
    // e.g. "abc1234 my-branch"
    const parts = remainder.split(" ");
    branch = parts.length > 1 ? parts[1] : remainder;
  }

  return {
    path: worktreePath,
    branch,
    isMain,
  };
}

export async function runWorktreeList(): Promise<number> {
  if (!(await isGitAvailable())) {
    console.error(color.red("git is not available"));
    return 1;
  }

  const repoRoot = process.cwd();
  const result = await runGit(["worktree", "list"], repoRoot);

  if (result.code !== 0) {
    console.error(
      color.red(`git worktree list failed: ${result.stderr.trim()}`),
    );
    return 1;
  }

  const lines = result.stdout.split("\n").filter((l) => l.trim());
  const entries: WorktreeEntry[] = [];

  for (const line of lines) {
    const entry = parseWorktreeListLine(line);
    if (entry) entries.push(entry);
  }

  if (entries.length === 0) {
    console.log(color.yellow("No worktrees found."));
    return 0;
  }

  const headerPath = color.bold(color.underline("Path"));
  const headerBranch = color.bold(color.underline("Branch"));
  const headerMain = color.bold(color.underline("Main"));

  const maxPathLen = Math.max(...entries.map((e) => e.path.length), 20);
  const maxBranchLen = Math.max(...entries.map((e) => e.branch.length), 20);

  const padPath = maxPathLen;
  const padBranch = maxBranchLen;

  console.log(
    `${headerPath.padEnd(padPath)} ${
      headerBranch.padEnd(padBranch)
    } ${headerMain}`,
  );
  console.log(String().padEnd(padPath + padBranch + 3 + 24, "-"));

  for (const entry of entries) {
    const pathStr = entry.path.padEnd(padPath);
    const branchStr = entry.branch.padEnd(padBranch);
    const mainStr = entry.isMain ? color.green("yes") : "";

    console.log(`${pathStr} ${branchStr} ${mainStr}`);
  }

  return 0;
}

export async function runWorktreeCreate(
  name: string,
  options?: { path?: string },
): Promise<number> {
  if (!(await isGitAvailable())) {
    console.error(color.red("git is not available"));
    return 1;
  }

  if (!name) {
    console.error(color.red("worktree name is required"));
    return 1;
  }

  const worktreePath = await resolveWorktreePath(name, options?.path);
  const repoRoot = process.cwd();

  console.log(color.blue(`Creating worktree "${name}" at ${worktreePath}`));

  // Create the branch name from the worktree name
  const branchName = `worktree/${name}`;

  const result = await runGit([
    "worktree",
    "add",
    "--detach",
    worktreePath,
    "-b",
    branchName,
  ], repoRoot);

  if (result.code !== 0) {
    console.error(
      color.red(`git worktree add failed: ${result.stderr.trim()}`),
    );
    return 1;
  }

  console.log(color.green(`Worktree "${name}" created at ${worktreePath}`));
  return 0;
}

export async function runWorktreeDelete(name: string): Promise<number> {
  if (!(await isGitAvailable())) {
    console.error(color.red("git is not available"));
    return 1;
  }

  if (!name) {
    console.error(color.red("worktree name is required"));
    return 1;
  }

  const worktreePath = path.join(DEFAULT_WORKTREE_BASE_DIR, name);
  const repoRoot = process.cwd();

  console.log(color.blue(`Deleting worktree "${name}" at ${worktreePath}`));

  const result = await runGit(
    ["worktree", "remove", "--force", worktreePath],
    repoRoot,
  );

  if (result.code !== 0) {
    console.error(
      color.red(`git worktree remove failed: ${result.stderr.trim()}`),
    );
    return 1;
  }

  console.log(color.green(`Worktree "${name}" deleted`));
  return 0;
}

export async function runWorktreePrune(): Promise<number> {
  if (!(await isGitAvailable())) {
    console.error(color.red("git is not available"));
    return 1;
  }

  const orphans = await findOrphanWorktrees(DEFAULT_WORKTREE_BASE_DIR, {});

  if (orphans.length > 0) {
    console.log(color.yellow(`Found ${orphans.length} orphan worktree(s):`));
    for (const orphan of orphans) {
      console.log(`  ${orphan}`);
    }
    console.log();
  } else {
    console.log(color.green("No orphan worktrees found."));
  }

  const repoRoot = process.cwd();
  const result = await runGit(["worktree", "prune"], repoRoot);

  if (result.code !== 0) {
    console.error(
      color.red(`git worktree prune failed: ${result.stderr.trim()}`),
    );
    return 1;
  }

  if (orphans.length === 0) {
    console.log(color.green("git worktree prune completed."));
  } else {
    console.log(
      color.green(
        `git worktree prune completed. ${orphans.length} orphan(s) removed.`,
      ),
    );
  }

  return 0;
}
