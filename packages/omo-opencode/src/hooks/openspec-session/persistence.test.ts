import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdir, rm, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  readSessionRecord,
  writeSessionRecord,
  deleteSessionRecord,
  loadAllSessionRecords,
} from "./persistence"

let tmp: string

beforeEach(async () => {
  tmp = join(tmpdir(), `openspec-persistence-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(tmp, { recursive: true })
})

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true })
})

describe("writeSessionRecord and readSessionRecord", () => {
  it("round-trips a session record", async () => {
    const record = { specName: "my-spec", injectedAt: 1234567890 }
    writeSessionRecord(tmp, "session-1", record)
    const read = readSessionRecord(tmp, "session-1")
    expect(read?.specName).toBe("my-spec")
    expect(read?.injectedAt).toBe(1234567890)
  })

  it("returns null for non-existent session", () => {
    const read = readSessionRecord(tmp, "non-existent")
    expect(read).toBeNull()
  })

  it("overwrites existing record", async () => {
    writeSessionRecord(tmp, "session-1", { specName: "spec-a", injectedAt: 1000 })
    writeSessionRecord(tmp, "session-1", { specName: "spec-b", injectedAt: 2000 })
    const read = readSessionRecord(tmp, "session-1")
    expect(read?.specName).toBe("spec-b")
    expect(read?.injectedAt).toBe(2000)
  })
})

describe("deleteSessionRecord", () => {
  it("deletes an existing record", () => {
    writeSessionRecord(tmp, "session-1", { specName: "spec-a", injectedAt: 1000 })
    const result = deleteSessionRecord(tmp, "session-1")
    expect(result).toBe(true)
    expect(readSessionRecord(tmp, "session-1")).toBeNull()
  })

  it("returns true for non-existent record", () => {
    const result = deleteSessionRecord(tmp, "non-existent")
    expect(result).toBe(true)
  })
})

describe("loadAllSessionRecords", () => {
  it("loads all records from directory", () => {
    writeSessionRecord(tmp, "s1", { specName: "spec-1", injectedAt: 1000 })
    writeSessionRecord(tmp, "s2", { specName: "spec-2", injectedAt: 2000 })
    const all = loadAllSessionRecords(tmp)
    expect(all.size).toBe(2)
    expect(all.get("s1")).toBe("spec-1")
    expect(all.get("s2")).toBe("spec-2")
  })

  it("returns empty map for empty directory", () => {
    const all = loadAllSessionRecords(tmp)
    expect(all.size).toBe(0)
  })

  it("returns empty map for non-existent directory", () => {
    const all = loadAllSessionRecords(join(tmp, "does-not-exist"))
    expect(all.size).toBe(0)
  })

  it("skips malformed JSON files", async () => {
    const { writeFile } = await import("node:fs/promises")
    await writeFile(join(tmp, "bad.json"), "not valid json {{{")
    await writeFile(join(tmp, "good.json"), JSON.stringify({ specName: "good", injectedAt: 1, version: 1 }))
    const all = loadAllSessionRecords(tmp)
    expect(all.size).toBe(1)
    expect(all.get("good")).toBe("good")
  })

  it("handles session IDs with special characters", () => {
    // Pass pre-encoded string as sessionID — stored as-is, retrieved as-is
    writeSessionRecord(tmp, "session%2Fwith%2Fslashes", { specName: "slash-spec", injectedAt: 3000 })
    const all = loadAllSessionRecords(tmp)
    expect(all.get("session%2Fwith%2Fslashes")).toBe("slash-spec")
  })
})
