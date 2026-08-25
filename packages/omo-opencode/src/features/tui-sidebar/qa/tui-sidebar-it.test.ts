/// <reference types="bun-types" />
// tui-sidebar-it.test.ts — Bun test wrapper for the TUI sidebar integration tests.
//
// This module runs the shell-based integration tests as Bun subtests.
// Each test case is a separate describe block that runs the shell script
// and asserts on its exit code + output.
//
// NOTE: These tests require a real opencode installation and tmux.
// They are skipped if dependencies are not available.

import { beforeEach, describe, expect, it, skip } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const SCRIPT_DIR = join(import.meta.dir);
const QA_DIR = join(SCRIPT_DIR);
const SHELL_SCRIPT = join(QA_DIR, "tui-sidebar-it.sh");

// Resolve repo root (two levels up from qa/)
const REPO_ROOT = join(SCRIPT_DIR, "..", "..", "..", "..");

function runShell(
  args: string[],
): { exitCode: number; stdout: string; stderr: string } {
  return new Promise((resolve) => {
    // New process group so orphaned grandchildren (servers, tmux helpers)
    // that inherit our stdio pipes can never stall the `close` event.
    const proc = spawn("bash", [SHELL_SCRIPT, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env },
      detached: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (exitCode: number, stderrOverride?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      resolve({ exitCode, stdout, stderr: stderrOverride ?? stderr });
    };
    const hardTimer = setTimeout(() => {
      try {
        process.kill(-proc.pid!, "SIGKILL");
      } catch {
        // already gone
      }
      settle(124, `${stderr}\n[runShell] hard timeout — process group killed`);
    }, SHELL_HARD_DEADLINE_MS);
    proc.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      settle(code ?? 1);
    });
    proc.on("error", (err) => {
      settle(1, err.message);
    });
  });
}

// Kill the whole process group well before bun's per-test deadline so a hung
// grandchild surfaces as a clean assertion failure with captured output.
const SHELL_HARD_DEADLINE_MS = 150_000;

async function runCase(
  caseName: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { exitCode, stdout, stderr } = await runShell([caseName]);
  return { exitCode, stdout, stderr };
}

async function checkDependencies(): Promise<boolean> {
  const { exitCode } = await runShell(["--self-check"]);

  return exitCode === 0;
}

// Each TC boots a real opencode TUI inside tmux (~12-20s); give them room
// well above bun's default 5s per-test deadline.
const IT_TIMEOUT_MS = 180_000;
const DEPS_AVAILABLE = await checkDependencies();

describe("tui-sidebar-it.sh self-check", () => {
  it("self-check passes", async () => {
    const { exitCode, stdout } = await runShell(["--self-check"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("PASS");
  }, IT_TIMEOUT_MS);
});

describe("tui-sidebar-it.sh listing", () => {
  it("lists all 8 test cases", async () => {
    const { exitCode, stdout } = await runShell(["--list"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("tc1-idle-roster");
    expect(stdout).toContain("tc2-active-session");
    expect(stdout).toContain("tc3-mirror-corrupt");
    expect(stdout).toContain("tc4-mirror-stale");
    expect(stdout).toContain("tc5-mirror-deleted");
    expect(stdout).toContain("tc6-broken-config");
    expect(stdout).toContain("tc7-model-picker");
    expect(stdout).toContain("tc8-active-view");
  }, IT_TIMEOUT_MS);
});

// Integration tests — these spawn opencode + tmux, so require the full toolchain
// They are marked with the opencode-it tag so they can be filtered in CI
describe("TC1: idle roster", { skip: !DEPS_AVAILABLE }, () => {
  // given the TUI boots and the plugin loads
  // when the sidebar appears
  // then it shows the Models section (idle roster) with no error banners
  it("#when sidebar renders #then Models section is visible", async () => {
    const result = await runCase("tc1");
    // Print output for debugging
    console.log(`[tc1] stdout:\n${result.stdout}`);
    console.error(`[tc1] stderr:\n${result.stderr}`);
    expect(result.exitCode).toBe(0);
  }, IT_TIMEOUT_MS);
});

describe("TC3: mirror corrupt → graceful degradation", { skip: !DEPS_AVAILABLE }, () => {
  // given the TUI is showing an idle roster
  // when the mirror file is corrupted (invalid JSON)
  // then the sidebar continues to render without crashing
  // and eventually returns to a stable state
  it("#when mirror is corrupted #then sidebar degrades gracefully", async () => {
    const result = await runCase("tc3");
    console.log(`[tc3] stdout:\n${result.stdout}`);
    console.error(`[tc3] stderr:\n${result.stderr}`);
    expect(result.exitCode).toBe(0);
  }, IT_TIMEOUT_MS);
});

describe(
  "TC4: mirror stale (>6s) → falls back to idle",
  { skip: !DEPS_AVAILABLE },
  () => {
    it("#when mirror is stale #then sidebar falls back to idle roster", async () => {
      const result = await runCase("tc4");
      console.log(`[tc4] stdout:\n${result.stdout}`);
      console.error(`[tc4] stderr:\n${result.stderr}`);
      expect(result.exitCode).toBe(0);
    }, IT_TIMEOUT_MS);
  },
);

describe("TC5: mirror deleted → graceful degradation", { skip: !DEPS_AVAILABLE }, () => {
  it("#when mirror is deleted #then sidebar continues rendering", async () => {
    const result = await runCase("tc5");
    console.log(`[tc5] stdout:\n${result.stdout}`);
    console.error(`[tc5] stderr:\n${result.stderr}`);
    expect(result.exitCode).toBe(0);
  }, IT_TIMEOUT_MS);
});

describe("TC6: broken config shows error banner", { skip: !DEPS_AVAILABLE }, () => {
  it("#when config is invalid #then sidebar shows broken view", async () => {
    const result = await runCase("tc6");
    console.log(`[tc6] stdout:\n${result.stdout}`);
    console.error(`[tc6] stderr:\n${result.stderr}`);
    expect(result.exitCode).toBe(0);
  }, IT_TIMEOUT_MS);
});

describe("TC2: active session (requires live model)", { skip: !DEPS_AVAILABLE }, () => {
  // NOTE: TC2 and TC8 are best-effort tests — they submit a real prompt.
  // They PASS if the sidebar remains stable (no crash) even if no active
  // view appears (because the model is unavailable).
  it("#given a prompt is submitted #then sidebar remains stable", async () => {
    const result = await runCase("tc2");
    console.log(`[tc2] stdout:\n${result.stdout}`);
    console.error(`[tc2] stderr:\n${result.stderr}`);
    // tc2 may fail gracefully if no model is available — that's acceptable
    // The key guarantee is: no crash, no broken banner
    if (result.exitCode !== 0) {
      // Check if it failed for an acceptable reason (model unavailable)
      // case scripts log to stderr; match against both streams
      const output = `${result.stdout}\n${result.stderr}`;
      const acceptableFailure =
        output.includes("no active view appeared") ||
        output.includes("model not available") ||
        output.includes("sidebar stable");
      expect(acceptableFailure).toBe(true);
    }
  }, IT_TIMEOUT_MS);
});

describe("TC7: model picker (API-dependent)", { skip: !DEPS_AVAILABLE }, () => {
  it("#given a click on model row #then picker modal may appear", async () => {
    const result = await runCase("tc7");
    console.log(`[tc7] stdout:\n${result.stdout}`);
    console.error(`[tc7] stderr:\n${result.stderr}`);
    // tc7 may gracefully skip if the click API is not available
    // We allow this as a pass
    if (result.exitCode !== 0) {
      const output = `${result.stdout}\n${result.stderr}`;
      const acceptableSkip =
        output.includes("modal API not available") ||
        output.includes("gracefully skipped");
      expect(acceptableSkip).toBe(true);
    }
  }, IT_TIMEOUT_MS);
});

describe("TC8: active view during session", { skip: !DEPS_AVAILABLE }, () => {
  it("#given a prompt is running #then sidebar may show active view", async () => {
    const result = await runCase("tc8");
    console.log(`[tc8] stdout:\n${result.stdout}`);
    console.error(`[tc8] stderr:\n${result.stderr}`);
    // tc8 may fail gracefully if no model is available
    if (result.exitCode !== 0) {
      const output = `${result.stdout}\n${result.stderr}`;
      const acceptableFailure =
        output.includes("no active view observed") ||
        output.includes("model may not be available");
      expect(acceptableFailure).toBe(true);
    }
  }, IT_TIMEOUT_MS);
});
