import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdir, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

let tmp: string
let specRoot: string

beforeEach(async () => {
  tmp = join(tmpdir(), `openspec-verify-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  specRoot = join(tmp, "specs")
  await mkdir(specRoot, { recursive: true })
})

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true })
})

async function makeSpec(name: string, files: { spec?: string; plan?: string; tasks?: string }) {
  const dir = join(specRoot, name)
  await mkdir(dir, { recursive: true })
  if (files.spec !== undefined) await writeFile(join(dir, "spec.md"), files.spec)
  if (files.plan !== undefined) await writeFile(join(dir, "plan.md"), files.plan)
  if (files.tasks !== undefined) await writeFile(join(dir, "tasks.md"), files.tasks)
  return dir
}

describe("verifySpec", () => {
  it("returns empty array when no specs exist", async () => {
    const { verifySpec } = await import("./verify")
    const results = await verifySpec(tmp, "specs")
    expect(results).toEqual([])
  })

  it("returns invalid result when specName provided but dir does not exist", async () => {
    const { verifySpec } = await import("./verify")
    const results = await verifySpec(tmp, "specs", "no-such-spec")
    // When a specific specName is requested but doesn't exist, it still returns one
    // result (all files missing, valid=false) rather than silently returning nothing.
    expect(results).toHaveLength(1)
    expect(results[0].specName).toBe("no-such-spec")
    expect(results[0].valid).toBe(false)
    expect(results[0].files.every((f) => !f.exists)).toBe(true)
  })

  it("marks spec as valid when all 3 files exist and are non-empty", async () => {
    const { verifySpec } = await import("./verify")
    await makeSpec("complete-spec", { spec: "# My Spec", plan: "# Plan", tasks: "| [ ] | Task |" })
    const results = await verifySpec(tmp, "specs", "complete-spec")
    expect(results).toHaveLength(1)
    expect(results[0].specName).toBe("complete-spec")
    expect(results[0].valid).toBe(true)
    expect(results[0].files.map((f) => ({ name: f.name, exists: f.exists, nonEmpty: f.nonEmpty }))).toEqual([
      { name: "spec.md", exists: true, nonEmpty: true },
      { name: "plan.md", exists: true, nonEmpty: true },
      { name: "tasks.md", exists: true, nonEmpty: true },
    ])
  })

  it("marks spec as invalid when spec.md is missing", async () => {
    const { verifySpec } = await import("./verify")
    await makeSpec("missing-spec", { plan: "# Plan", tasks: "| [ ] | Task |" })
    const results = await verifySpec(tmp, "specs", "missing-spec")
    expect(results[0].valid).toBe(false)
    expect(results[0].files.find((f) => f.name === "spec.md")?.exists).toBe(false)
  })

  it("marks spec as invalid when plan.md is empty", async () => {
    const { verifySpec } = await import("./verify")
    await makeSpec("empty-plan", { spec: "# Spec", plan: "   \n  ", tasks: "| [ ] | Task |" })
    const results = await verifySpec(tmp, "specs", "empty-plan")
    expect(results[0].valid).toBe(false)
    expect(results[0].files.find((f) => f.name === "plan.md")?.nonEmpty).toBe(false)
  })

  it("marks spec as invalid when tasks.md is missing", async () => {
    const { verifySpec } = await import("./verify")
    await makeSpec("missing-tasks", { spec: "# Spec", plan: "# Plan" })
    const results = await verifySpec(tmp, "specs", "missing-tasks")
    expect(results[0].valid).toBe(false)
    expect(results[0].files.find((f) => f.name === "tasks.md")?.exists).toBe(false)
  })

  it("returns task stats for valid specs", async () => {
    const { verifySpec } = await import("./verify")
    await makeSpec("with-tasks", {
      spec: "# Spec",
      plan: "# Plan",
      tasks: "| [ ] | Open 1 |\n| [x] | Done |\n| [~] | Working |",
    })
    const results = await verifySpec(tmp, "specs", "with-tasks")
    expect(results[0].taskStats).toEqual({ open: 1, in_progress: 1, completed: 1, blocked: 0 })
  })

  it("verifies all specs when specName is omitted", async () => {
    const { verifySpec } = await import("./verify")
    await makeSpec("spec-a", { spec: "# A", plan: "# A", tasks: "| [ ] | A |" })
    await makeSpec("spec-b", { spec: "# B", plan: "# B", tasks: "| [x] | B |" })
    const results = await verifySpec(tmp, "specs")
    expect(results).toHaveLength(2)
    expect(results.map((r) => r.specName).sort()).toEqual(["spec-a", "spec-b"])
  })
})
