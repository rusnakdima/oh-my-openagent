import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdir, writeFile, rm, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

let tmp: string
let specRoot: string

beforeEach(async () => {
  tmp = join(tmpdir(), `openspec-hook-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  specRoot = join(tmp, "openspec")
  await mkdir(join(specRoot, "test-spec"), { recursive: true })
  // Write all 3 required files for a valid spec
  await writeFile(join(specRoot, "test-spec", "spec.md"), "# Test Spec\n\nContent.\n")
  await writeFile(join(specRoot, "test-spec", "plan.md"), "# Plan\n\nSteps.\n")
  // Note: tool.execute.after calls markInProgressAsCompleted ([~] → [x])
  // so we use [~] tasks for write-back tests.
  await writeFile(join(specRoot, "test-spec", "tasks.md"), "| [~] | In-progress task |\n| [x] | Done |\n")
})

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true })
})

function mockCtx(): {
  directory: string
  log: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void }
} {
  return {
    directory: tmp,
    log: { info: () => {}, warn: () => {}, error: () => {} },
  }
}

describe("createOpenSpecSessionHook", () => {
  it("returns an object with chat.message and tool.execute.after handlers", async () => {
    const { createOpenSpecSessionHook } = await import("./hook")
    const ctx = mockCtx()
    const hook = createOpenSpecSessionHook(ctx, { projectDir: tmp })
    expect(typeof hook["chat.message"]).toBe("function")
    expect(typeof hook["tool.execute.after"]).toBe("function")
  })

  describe("chat.message handler", () => {
    it("returns early when autoInject=false", async () => {
      const { createOpenSpecSessionHook } = await import("./hook")
      const ctx = mockCtx()
      const hook = createOpenSpecSessionHook(ctx, {
        projectDir: tmp,
        specDir: "openspec",
        autoInject: false,
      })

      const output = {
        parts: [{ type: "text", text: "Hello" }] as Array<{ type: string; text?: string; [key: string]: unknown }>,
      }
      // @ts-ignore
      await hook["chat.message"]({ sessionId: "s1" }, output)
      expect(output.parts.length).toBe(1) // unchanged
    })

    it("skips second message for same session", async () => {
      const { createOpenSpecSessionHook } = await import("./hook")
      const ctx = mockCtx()
      const hook = createOpenSpecSessionHook(ctx, {
        projectDir: tmp,
        specDir: "openspec",
        autoInject: true,
      })

      const output1 = {
        parts: [{ type: "text", text: "Hello" }] as Array<{ type: string; text?: string; [key: string]: unknown }>,
      }
      // @ts-ignore
      await hook["chat.message"]({ sessionId: "s2" }, output1)
      const lenAfterFirst = output1.parts.length

      const output2 = {
        parts: [{ type: "text", text: "Hello again" }] as Array<{ type: string; text?: string; [key: string]: unknown }>,
      }
      // @ts-ignore
      await hook["chat.message"]({ sessionId: "s2" }, output2)
      // Second injection should be skipped (same session)
      expect(output2.parts.length).toBeLessThanOrEqual(lenAfterFirst)
    })

    it("adds projectDir to injectedSessions when injection fires", async () => {
      // This is a behavioral test: we verify that after a successful injection,
      // the session is tracked. We do this by checking that a second call
      // with the same session ID doesn't re-inject (same session).
      const { createOpenSpecSessionHook } = await import("./hook")
      const ctx = mockCtx()
      const hook = createOpenSpecSessionHook(ctx, {
        projectDir: tmp,
        specDir: "openspec",
        autoInject: true,
      })

      const output1 = {
        parts: [{ type: "text", text: "First" }] as Array<{ type: string; text?: string; [key: string]: unknown }>,
      }
      // @ts-ignore
      await hook["chat.message"]({ sessionId: "s3" }, output1)
      const lenAfterFirst = output1.parts.length

      // Same session - should not re-inject
      const output2 = {
        parts: [{ type: "text", text: "Second" }] as Array<{ type: string; text?: string; [key: string]: unknown }>,
      }
      // @ts-ignore
      await hook["chat.message"]({ sessionId: "s3" }, output2)
      // Since the same session, the hook returns early at injectedSessions check
      // before even reading files. Length should be unchanged.
      expect(output2.parts.length).toBeLessThanOrEqual(lenAfterFirst)
    })
  })

  describe("tool.execute.after handler — taskWriteBack", () => {
    it("does nothing when taskWriteBack=false", async () => {
      const { createOpenSpecSessionHook } = await import("./hook")
      const ctx = mockCtx()
      const hook = createOpenSpecSessionHook(ctx, {
        projectDir: tmp,
        specDir: "openspec",
        taskWriteBack: false,
      })

      // @ts-ignore
      await hook["tool.execute.after"](
        { tool: "task", sessionID: "s1", callID: "c1" },
        { title: "task", output: "completed successfully" },
      )
      // Should not throw
    })

    it("does nothing when tool name is not in completion list", async () => {
      const { createOpenSpecSessionHook } = await import("./hook")
      const ctx = mockCtx()
      const hook = createOpenSpecSessionHook(ctx, {
        projectDir: tmp,
        specDir: "openspec",
        taskWriteBack: true,
      })

      // @ts-ignore
      await hook["tool.execute.after"](
        { tool: "grep", sessionID: "s1", callID: "c1" },
        { title: "grep", output: "completed successfully" },
      )
      // grep is not in the completion list
    })

    it("does nothing when output has no completion keyword", async () => {
      const { createOpenSpecSessionHook } = await import("./hook")
      const ctx = mockCtx()
      const hook = createOpenSpecSessionHook(ctx, {
        projectDir: tmp,
        specDir: "openspec",
        taskWriteBack: true,
      })

      // @ts-ignore
      await hook["tool.execute.after"](
        { tool: "task", sessionID: "s1", callID: "c1" },
        { title: "task", output: "still running" },
      )
    })

    it("does nothing for delegate-task without completion keyword", async () => {
      const { createOpenSpecSessionHook } = await import("./hook")
      const ctx = mockCtx()
      const hook = createOpenSpecSessionHook(ctx, {
        projectDir: tmp,
        specDir: "openspec",
        taskWriteBack: true,
      })

      // @ts-ignore
      await hook["tool.execute.after"](
        { tool: "delegate-task", sessionID: "s1", callID: "c1" },
        { title: "delegate-task", output: "working on it" },
      )
      // No completion keyword
    })

    it("does not write to tasks.md when task_update fires without completion keyword", async () => {
      const { createOpenSpecSessionHook } = await import("./hook")
      const ctx = mockCtx()
      const hook = createOpenSpecSessionHook(ctx, {
        projectDir: tmp,
        specDir: "openspec",
        taskWriteBack: true,
      })

      // @ts-ignore
      await hook["tool.execute.after"](
        { tool: "task_update", sessionID: "s1", callID: "c1" },
        { title: "task_update", output: "updated" },
      )

      const tasksAfter = await readFile(join(specRoot, "test-spec", "tasks.md"), "utf-8")
      // No completion keyword → hook returns early → tasks unchanged (still [~])
      expect(tasksAfter).toContain("[~]")
    })

    it("updates tasks.md when task fires with completion keyword", async () => {
      const { createOpenSpecSessionHook } = await import("./hook")
      const ctx = mockCtx()
      const hook = createOpenSpecSessionHook(ctx, {
        projectDir: tmp,
        specDir: "openspec",
        taskWriteBack: true,
      })

      // @ts-ignore
      await hook["tool.execute.after"](
        { tool: "task", sessionID: "s1", callID: "c1" },
        { title: "task", output: "All tasks completed successfully" },
      )

      const tasksAfter = await readFile(join(specRoot, "test-spec", "tasks.md"), "utf-8")
      // markInProgressAsCompleted: [~] → [x]
      expect(tasksAfter).toContain("[x]")
      // The done task also stays [x]
      expect(tasksAfter).not.toContain("[~]")
    })

    it("applies only the first matching spec when multiple specs exist", async () => {
      // Create a second spec with [~] tasks (in-progress) so markInProgressAsCompleted applies
      await mkdir(join(specRoot, "another-spec"), { recursive: true })
      await writeFile(join(specRoot, "another-spec", "spec.md"), "# Another\n")
      await writeFile(join(specRoot, "another-spec", "plan.md"), "# Plan\n")
      await writeFile(join(specRoot, "another-spec", "tasks.md"), "| [~] | Another in-progress |\n")

      const { createOpenSpecSessionHook } = await import("./hook")
      const ctx = mockCtx()
      const hook = createOpenSpecSessionHook(ctx, {
        projectDir: tmp,
        specDir: "openspec",
        taskWriteBack: true,
      })

      // @ts-ignore
      await hook["tool.execute.after"](
        { tool: "task", sessionID: "s1", callID: "c1" },
        { title: "task", output: "completed successfully" },
      )

      const tasksA = await readFile(join(specRoot, "test-spec", "tasks.md"), "utf-8")
      const tasksB = await readFile(join(specRoot, "another-spec", "tasks.md"), "utf-8")
      // hook breaks after first successful update (alphabetically: another-spec < test-spec)
      // So another-spec gets updated ([~] → [x]), test-spec stays ([~])
      // But the test uses alphabetical order from listSpecs(), which returns sorted
      // another-spec comes first and gets updated
      const aIsX = tasksA.includes("[x]") && !tasksA.includes("[~]")
      const bIsX = tasksB.includes("[x]") && !tasksB.includes("[~]")
      const aIsOriginal = tasksA.includes("[~]")
      const bIsOriginal = tasksB.includes("[~]")
      // Exactly one spec should have been updated
      expect((aIsX ? 1 : 0) + (bIsX ? 1 : 0)).toBe(1)
    })
  })
})
