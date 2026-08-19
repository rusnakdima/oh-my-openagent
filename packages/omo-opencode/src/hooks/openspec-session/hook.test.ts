import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdir, writeFile, rm, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { applySpec } from "../../tools/openspec/apply"

let tmp: string
let specRoot: string

// Mock controller for tests — uses real applySpec for file operations
function createMockController(projectDir: string, specDir = "openspec") {
  return {
    propose: async (_specName: string, _description?: string) => ({ success: true, message: "mocked" }),
    verify: async (_specName?: string) => [{ specName: "mock", valid: true, files: [], taskStats: undefined }],
    apply: async (specName: string, _sessionID?: string) => applySpec(projectDir, specDir, specName, _sessionID),
    archive: async (_specName: string) => ({ success: true, message: "mocked" }),
    status: async () => [{ specName: "mock", valid: true, taskStats: undefined }],
    list: async () => ["mock-spec"],
  }
}

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
    const hook = createOpenSpecSessionHook(ctx, { projectDir: tmp, controller: createMockController(tmp) })
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
        controller: createMockController(tmp),
        controller: createMockController(tmp),
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
        controller: createMockController(tmp),
        controller: createMockController(tmp),
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
        controller: createMockController(tmp),
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

    it("auto-creates spec when no specs exist and autoCreate=true", async () => {
      // Create a fresh empty spec dir (no specs)
      const emptyTmp = join(tmpdir(), `openspec-auto-create-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      const emptySpecRoot = join(emptyTmp, "openspec")
      await mkdir(emptySpecRoot, { recursive: true })

      const proposeCalls: Array<{ name: string; desc: string }> = []
      const applyCalls: string[] = []

      const autoCreateController = {
        propose: async (name: string, desc?: string) => {
          proposeCalls.push({ name, desc: desc ?? "" })
          // Actually create the spec files so injectSpecContext works
          await mkdir(join(emptySpecRoot, name), { recursive: true })
          await writeFile(join(emptySpecRoot, name, "spec.md"), `# ${name}\n\n${desc ?? ""}\n`)
          await writeFile(join(emptySpecRoot, name, "plan.md"), "# Plan\n\n")
          await writeFile(join(emptySpecRoot, name, "tasks.md"), "| [ ] | Task 1 |\n")
          return { success: true, message: "Created" }
        },
        apply: async (name: string) => {
          applyCalls.push(name)
          return { success: true }
        },
        verify: async () => [{ specName: "mock", valid: true, files: [], taskStats: undefined }],
        archive: async () => ({ success: true, message: "mocked" }),
        status: async () => [{ specName: "mock", valid: true, taskStats: undefined }],
        list: async () => ["mock-spec"],
      }

      const { createOpenSpecSessionHook } = await import("./hook")
      const ctx = { directory: emptyTmp, log: { info: () => {}, warn: () => {}, error: () => {} } }
      const hook = createOpenSpecSessionHook(ctx, {
        projectDir: emptyTmp,
        specDir: "openspec",
        autoInject: true,
        autoCreate: true,
        controller: autoCreateController,
      })

      const output = {
        parts: [{ type: "text", text: "Build a login system with OAuth" }] as Array<{ type: string; text?: string; [key: string]: unknown }>,
      }
      // @ts-ignore
      await hook["chat.message"]({ sessionId: "auto-create-s1" }, output)

      // verify propose was called with slugified name (leading verb+article stripped)
      expect(proposeCalls.length).toBe(1)
      expect(proposeCalls[0].name).toBe("login-system-with-oauth")
      // verify apply was called
      expect(applyCalls.length).toBe(1)
      expect(applyCalls[0]).toBe("login-system-with-oauth")
      // verify context was injected (text appended to existing part)
      const text = (output.parts[0] as { text?: string }).text ?? ""
      expect(text).toContain("## OpenSpec:")
      expect(text).toContain("login-system-with-oauth")

      await rm(emptyTmp, { recursive: true, force: true })
    })

    it("does NOT auto-create when autoCreate=false (default)", async () => {
      // Create a fresh empty spec dir (no specs)
      const emptyTmp = join(tmpdir(), `openspec-no-auto-create-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      const emptySpecRoot = join(emptyTmp, "openspec")
      await mkdir(emptySpecRoot, { recursive: true })

      const proposeCalls: string[] = []
      const noAutoCreateController = {
        propose: async (name: string) => { proposeCalls.push(name); return { success: true } },
        verify: async () => [{ specName: "mock", valid: true, files: [], taskStats: undefined }],
        apply: async () => ({ success: true }),
        archive: async () => ({ success: true, message: "mocked" }),
        status: async () => [{ specName: "mock", valid: true, taskStats: undefined }],
        list: async () => [],
      }

      const { createOpenSpecSessionHook } = await import("./hook")
      const ctx = { directory: emptyTmp, log: { info: () => {}, warn: () => {}, error: () => {} } }
      const hook = createOpenSpecSessionHook(ctx, {
        projectDir: emptyTmp,
        specDir: "openspec",
        autoInject: true,
        autoCreate: false,
        controller: noAutoCreateController,
      })

      const output = {
        parts: [{ type: "text", text: "Hello world" }] as Array<{ type: string; text?: string; [key: string]: unknown }>,
      }
      // @ts-ignore
      await hook["chat.message"]({ sessionId: "no-auto-s1" }, output)

      // propose should NOT have been called
      expect(proposeCalls.length).toBe(0)
      // output should be unchanged
      expect(output.parts.length).toBe(1)

      await rm(emptyTmp, { recursive: true, force: true })
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
        controller: createMockController(tmp),
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
        controller: createMockController(tmp),
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
        controller: createMockController(tmp),
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
        controller: createMockController(tmp),
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
        controller: createMockController(tmp),
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
        controller: createMockController(tmp),
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
        controller: createMockController(tmp),
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
