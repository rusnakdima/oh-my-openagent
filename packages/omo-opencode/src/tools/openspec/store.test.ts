import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdir, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

let tmp: string

beforeEach(async () => {
  tmp = join(tmpdir(), `openspec-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(join(tmp, "specs", "test-spec"), { recursive: true })
})

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true })
})

// ─── resolveSpecRoot ─────────────────────────────────────────────────────────

describe("resolveSpecRoot", () => {
  it("joins projectDir and specDir", async () => {
    const { resolveSpecRoot } = await import("./store")
    expect(resolveSpecRoot("/proj", ".specs")).toBe("/proj/.specs")
    expect(resolveSpecRoot("/proj", "specs")).toBe("/proj/specs")
  })
})

// ─── resolveSpecFile ─────────────────────────────────────────────────────────

describe("resolveSpecFile", () => {
  it("resolves to projectDir/specDir/specName/file", async () => {
    const { resolveSpecFile } = await import("./store")
    const p = resolveSpecFile("/proj", ".specs", "my-api", "spec.md")
    expect(p).toBe("/proj/.specs/my-api/spec.md")
  })

  it("accepts spec.md, plan.md, tasks.md", async () => {
    const { resolveSpecFile } = await import("./store")
    expect(resolveSpecFile("/p", "s", "n", "spec.md")).toBe("/p/s/n/spec.md")
    expect(resolveSpecFile("/p", "s", "n", "plan.md")).toBe("/p/s/n/plan.md")
    expect(resolveSpecFile("/p", "s", "n", "tasks.md")).toBe("/p/s/n/tasks.md")
  })
})

// ─── specExists / isDirectory ─────────────────────────────────────────────────

describe("specExists", () => {
  it("returns true for an existing file", async () => {
    const { specExists } = await import("./store")
    await writeFile(join(tmp, "exists.md"), "content")
    expect(await specExists(join(tmp, "exists.md"))).toBe(true)
  })

  it("returns true for an existing directory", async () => {
    const { specExists } = await import("./store")
    expect(await specExists(tmp)).toBe(true)
  })

  it("returns false for a non-existent path", async () => {
    const { specExists } = await import("./store")
    expect(await specExists(join(tmp, "no-such-file.md"))).toBe(false)
  })
})

describe("isDirectory", () => {
  it("returns true for a directory", async () => {
    const { isDirectory } = await import("./store")
    expect(await isDirectory(tmp)).toBe(true)
  })

  it("returns false for a file", async () => {
    const { isDirectory } = await import("./store")
    await writeFile(join(tmp, "file.md"), "content")
    expect(await isDirectory(join(tmp, "file.md"))).toBe(false)
  })

  it("returns false for a non-existent path", async () => {
    const { isDirectory } = await import("./store")
    expect(await isDirectory(join(tmp, "no-such"))).toBe(false)
  })
})

// ─── readSpecFile ────────────────────────────────────────────────────────────

describe("readSpecFile", () => {
  it("returns file content as string", async () => {
    const { readSpecFile } = await import("./store")
    const path = join(tmp, "read.md")
    await writeFile(path, "hello world")
    expect(await readSpecFile(path)).toBe("hello world")
  })

  it("returns null when file does not exist", async () => {
    const { readSpecFile } = await import("./store")
    expect(await readSpecFile(join(tmp, "no-exist.md"))).toBeNull()
  })
})

// ─── writeSpecFile (atomic rename) ───────────────────────────────────────────

describe("writeSpecFile", () => {
  it("writes content to the file", async () => {
    const { writeSpecFile, readSpecFile } = await import("./store")
    const path = join(tmp, "written.md")
    await writeSpecFile(path, "atomic write")
    expect(await readSpecFile(path)).toBe("atomic write")
  })

  it("overwrites existing content", async () => {
    const { writeSpecFile, readSpecFile } = await import("./store")
    const path = join(tmp, "overwrite.md")
    await writeSpecFile(path, "v1")
    await writeSpecFile(path, "v2")
    expect(await readSpecFile(path)).toBe("v2")
  })
})

// ─── listSpecs ───────────────────────────────────────────────────────────────

describe("listSpecs", () => {
  it("returns empty array when specRoot does not exist", async () => {
    const { listSpecs } = await import("./store")
    expect(await listSpecs(join(tmp, "no-such-dir"))).toEqual([])
  })

  it("returns empty array when directory is empty", async () => {
    const { listSpecs } = await import("./store")
    expect(await listSpecs(tmp)).toEqual([])
  })

  it("skips ARCHIVE and .tmp directories", async () => {
    const { listSpecs } = await import("./store")
    await mkdir(join(tmp, "ARCHIVE"), { recursive: true })
    await mkdir(join(tmp, ".tmp"), { recursive: true })
    await mkdir(join(tmp, "valid-spec"), { recursive: true })
    await writeFile(join(tmp, "valid-spec", "spec.md"), "# spec")
    expect(await listSpecs(tmp)).toEqual(["valid-spec"])
  })

  it("only returns dirs containing spec.md", async () => {
    const { listSpecs } = await import("./store")
    await mkdir(join(tmp, "no-spec"), { recursive: true })
    await mkdir(join(tmp, "has-spec"), { recursive: true })
    await writeFile(join(tmp, "has-spec", "spec.md"), "# spec")
    expect(await listSpecs(tmp)).toEqual(["has-spec"])
  })

  it("returns sorted array", async () => {
    const { listSpecs } = await import("./store")
    await mkdir(join(tmp, "zebra"), { recursive: true })
    await mkdir(join(tmp, "alpha"), { recursive: true })
    await writeFile(join(tmp, "zebra", "spec.md"), "# spec")
    await writeFile(join(tmp, "alpha", "spec.md"), "# spec")
    expect(await listSpecs(tmp)).toEqual(["alpha", "zebra"])
  })
})

// ─── parseTaskStats ──────────────────────────────────────────────────────────

describe("parseTaskStats", () => {
  it("counts [ ] as open", async () => {
    const { parseTaskStats } = await import("./store")
    const stats = parseTaskStats("| [ ] | Do the thing |")
    expect(stats.open).toBe(1)
    expect(stats.in_progress).toBe(0)
    expect(stats.completed).toBe(0)
    expect(stats.blocked).toBe(0)
  })

  it("counts [~] as in_progress", async () => {
    const { parseTaskStats } = await import("./store")
    const stats = parseTaskStats("| [~] | Doing the thing |")
    expect(stats.open).toBe(0)
    expect(stats.in_progress).toBe(1)
  })

  it("counts [x] as completed", async () => {
    const { parseTaskStats } = await import("./store")
    const stats = parseTaskStats("| [x] | Done |")
    expect(stats.completed).toBe(1)
  })

  it("counts [!!] as blocked", async () => {
    const { parseTaskStats } = await import("./store")
    const stats = parseTaskStats("| [!!] | Blocked task |")
    expect(stats.blocked).toBe(1)
  })

  it("counts multiple markers across lines", async () => {
    const { parseTaskStats } = await import("./store")
    const content = [
      "| [ ] | Open 1 |",
      "| [x] | Done 1 |",
      "| [ ] | Open 2 |",
      "| [~] | Working |",
      "| [!!] | Stuck |",
      "| [x] | Done 2 |",
    ].join("\n")
    const stats = parseTaskStats(content)
    expect(stats.open).toBe(2)
    expect(stats.in_progress).toBe(1)
    expect(stats.completed).toBe(2)
    expect(stats.blocked).toBe(1)
  })

  it("returns zeros for empty content", async () => {
    const { parseTaskStats } = await import("./store")
    const stats = parseTaskStats("")
    expect(stats.open).toBe(0)
    expect(stats.in_progress).toBe(0)
    expect(stats.completed).toBe(0)
    expect(stats.blocked).toBe(0)
  })
})

// ─── markPendingAsInProgress ────────────────────────────────────────────────

describe("markPendingAsInProgress", () => {
  it("replaces [ ] with [~]", async () => {
    const { markPendingAsInProgress } = await import("./store")
    const input = "| [ ] | Do it |\n| [x] | Done |"
    const result = markPendingAsInProgress(input)
    expect(result).toContain("| [~] | Do it |")
    expect(result).toContain("| [x] | Done |")
  })

  it("returns null when no pending tasks", async () => {
    const { markPendingAsInProgress } = await import("./store")
    const input = "| [~] | Already in progress |\n| [x] | Done |"
    expect(markPendingAsInProgress(input)).toBeNull()
  })

  it("handles multiple pending tasks", async () => {
    const { markPendingAsInProgress } = await import("./store")
    const input = "| [ ] | Task 1 |\n| [ ] | Task 2 |"
    const result = markPendingAsInProgress(input)!
    expect(result.match(/\| \[~\] \|/g)?.length).toBe(2)
  })

  it("does not affect completed or blocked markers", async () => {
    const { markPendingAsInProgress } = await import("./store")
    const input = "| [x] | Done |\n| [!!] | Blocked |"
    expect(markPendingAsInProgress(input)).toBeNull()
  })
})

// ─── markInProgressAsCompleted ─────────────────────────────────────────────

describe("markInProgressAsCompleted", () => {
  it("replaces [~] with [x]", async () => {
    const { markInProgressAsCompleted } = await import("./store")
    const input = "| [~] | In progress |\n| [ ] | Pending |"
    const result = markInProgressAsCompleted(input)
    expect(result).toContain("| [x] | In progress |")
    expect(result).toContain("| [ ] | Pending |")
  })

  it("returns null when no in-progress tasks", async () => {
    const { markInProgressAsCompleted } = await import("./store")
    const input = "| [ ] | Pending |\n| [x] | Done |"
    expect(markInProgressAsCompleted(input)).toBeNull()
  })

  it("handles multiple in-progress tasks", async () => {
    const { markInProgressAsCompleted } = await import("./store")
    const input = "| [~] | Task 1 |\n| [~] | Task 2 |"
    const result = markInProgressAsCompleted(input)!
    expect(result.match(/\| \[x\] \|/g)?.length).toBe(2)
  })

  it("does not affect open or blocked markers", async () => {
    const { markInProgressAsCompleted } = await import("./store")
    const input = "| [ ] | Open |\n| [!!] | Blocked |"
    expect(markInProgressAsCompleted(input)).toBeNull()
  })
})
