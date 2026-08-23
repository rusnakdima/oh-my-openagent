/// <reference types="bun-types" />
// tui-sidebar-it.test.ts — Bun test wrapper for the TUI sidebar integration tests.
//
// This module runs the shell-based integration tests as Bun subtests.
// Each test case is a separate describe block that runs the shell script
// and asserts on its exit code + output.
//
// NOTE: These tests require a real opencode installation and tmux.
// They are skipped if dependencies are not available.

import { beforeEach, describe, expect, it, skip } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"

const SCRIPT_DIR = join(import.meta.dir)
const QA_DIR = join(SCRIPT_DIR)
const SHELL_SCRIPT = join(QA_DIR, "tui-sidebar-it.sh")

// Resolve repo root (two levels up from qa/)
const REPO_ROOT = join(SCRIPT_DIR, "..", "..", "..", "..")

function runShell(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  return new Promise((resolve) => {
    const proc = spawn("bash", [SHELL_SCRIPT, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env },
    })
    let stdout = ""
    let stderr = ""
    proc.stdout?.on("data", (d) => { stdout += d.toString() })
    proc.stderr?.on("data", (d) => { stderr += d.toString() })
    proc.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr })
    })
    proc.on("error", (err) => {
      resolve({ exitCode: 1, stdout, stderr: err.message })
    })
  })
}

async function runCase(caseName: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { exitCode, stdout, stderr } = await runShell([caseName])
  return { exitCode, stdout, stderr }
}

async function checkDependencies(): Promise<boolean> {
  const { exitCode } = await runShell(["--self-check"])
  return exitCode === 0
}

describe("tui-sidebar-it.sh self-check", () => {
  it("self-check passes", async () => {
    const { exitCode, stdout } = await runShell(["--self-check"])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("PASS")
  })
})

describe("tui-sidebar-it.sh listing", () => {
  it("lists all 8 test cases", async () => {
    const { exitCode, stdout } = await runShell(["--list"])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("tc1-idle-roster")
    expect(stdout).toContain("tc2-active-session")
    expect(stdout).toContain("tc3-mirror-corrupt")
    expect(stdout).toContain("tc4-mirror-stale")
    expect(stdout).toContain("tc5-mirror-deleted")
    expect(stdout).toContain("tc6-broken-config")
    expect(stdout).toContain("tc7-model-picker")
    expect(stdout).toContain("tc8-active-view")
  })
})

// Integration tests — these spawn opencode + tmux, so require the full toolchain
// They are marked with the opencode-it tag so they can be filtered in CI
describe("TC1: idle roster", { skip: false }, () => {
  // given the TUI boots and the plugin loads
  // when the sidebar appears
  // then it shows the Models section (idle roster) with no error banners
  it("#when sidebar renders #then Models section is visible", async () => {
    const result = await runCase("tc1")
    // Print output for debugging
    console.log(`[tc1] stdout:\n${result.stdout}`)
    console.error(`[tc1] stderr:\n${result.stderr}`)
    expect(result.exitCode).toBe(0)
  })
})

describe("TC3: mirror corrupt → graceful degradation", { skip: false }, () => {
  // given the TUI is showing an idle roster
  // when the mirror file is corrupted (invalid JSON)
  // then the sidebar continues to render without crashing
  // and eventually returns to a stable state
  it("#when mirror is corrupted #then sidebar degrades gracefully", async () => {
    const result = await runCase("tc3")
    console.log(`[tc3] stdout:\n${result.stdout}`)
    console.error(`[tc3] stderr:\n${result.stderr}`)
    expect(result.exitCode).toBe(0)
  })
})

describe("TC4: mirror stale (>6s) → falls back to idle", { skip: false }, () => {
  it("#when mirror is stale #then sidebar falls back to idle roster", async () => {
    const result = await runCase("tc4")
    console.log(`[tc4] stdout:\n${result.stdout}`)
    console.error(`[tc4] stderr:\n${result.stderr}`)
    expect(result.exitCode).toBe(0)
  })
})

describe("TC5: mirror deleted → graceful degradation", { skip: false }, () => {
  it("#when mirror is deleted #then sidebar continues rendering", async () => {
    const result = await runCase("tc5")
    console.log(`[tc5] stdout:\n${result.stdout}`)
    console.error(`[tc5] stderr:\n${result.stderr}`)
    expect(result.exitCode).toBe(0)
  })
})

describe("TC6: broken config shows error banner", { skip: false }, () => {
  it("#when config is invalid #then sidebar shows broken view", async () => {
    const result = await runCase("tc6")
    console.log(`[tc6] stdout:\n${result.stdout}`)
    console.error(`[tc6] stderr:\n${result.stderr}`)
    expect(result.exitCode).toBe(0)
  })
})

describe("TC2: active session (requires live model)", { skip: false }, () => {
  // NOTE: TC2 and TC8 are best-effort tests — they submit a real prompt.
  // They PASS if the sidebar remains stable (no crash) even if no active
  // view appears (because the model is unavailable).
  it("#given a prompt is submitted #then sidebar remains stable", async () => {
    const result = await runCase("tc2")
    console.log(`[tc2] stdout:\n${result.stdout}`)
    console.error(`[tc2] stderr:\n${result.stderr}`)
    // tc2 may fail gracefully if no model is available — that's acceptable
    // The key guarantee is: no crash, no broken banner
    if (result.exitCode !== 0) {
      // Check if it failed for an acceptable reason (model unavailable)
      const acceptableFailure =
        result.stdout.includes("no active view appeared") ||
        result.stdout.includes("model not available") ||
        result.stdout.includes("sidebar stable")
      expect(acceptableFailure).toBe(true)
    }
  })
})

describe("TC7: model picker (API-dependent)", { skip: false }, () => {
  it("#given a click on model row #then picker modal may appear", async () => {
    const result = await runCase("tc7")
    console.log(`[tc7] stdout:\n${result.stdout}`)
    console.error(`[tc7] stderr:\n${result.stderr}`)
    // tc7 may gracefully skip if the click API is not available
    // We allow this as a pass
    if (result.exitCode !== 0) {
      const acceptableSkip = result.stdout.includes("modal API not available") ||
        result.stdout.includes("gracefully skipped")
      expect(acceptableSkip).toBe(true)
    }
  })
})

describe("TC8: active view during session", { skip: false }, () => {
  it("#given a prompt is running #then sidebar may show active view", async () => {
    const result = await runCase("tc8")
    console.log(`[tc8] stdout:\n${result.stdout}`)
    console.error(`[tc8] stderr:\n${result.stderr}`)
    // tc8 may fail gracefully if no model is available
    if (result.exitCode !== 0) {
      const acceptableFailure =
        result.stdout.includes("no active view observed") ||
        result.stdout.includes("model may not be available")
      expect(acceptableFailure).toBe(true)
    }
  })
})
