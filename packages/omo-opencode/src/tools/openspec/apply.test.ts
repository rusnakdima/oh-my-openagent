import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tmp: string;
let specRoot: string;

beforeEach(async () => {
  tmp = join(
    tmpdir(),
    `openspec-apply-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  specRoot = join(tmp, "specs");
  await mkdir(specRoot, { recursive: true });
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function makeSpec(name: string, tasksContent: string) {
  const dir = join(specRoot, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "spec.md"), "# Spec");
  await writeFile(join(dir, "plan.md"), "# Plan");
  await writeFile(join(dir, "tasks.md"), tasksContent);
}

describe("applySpec", () => {
  it("returns success:false when spec does not exist", async () => {
    const { applySpec } = await import("./apply");
    const result = await applySpec(tmp, "specs", "no-such-spec");
    expect(result.success).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.message).toContain("not found");
  });

  it("returns applied:false when all tasks are already in-progress", async () => {
    const { applySpec } = await import("./apply");
    await makeSpec("already-progress", "| [~] | Done |\n| [x] | Done |");
    const result = await applySpec(tmp, "specs", "already-progress");
    expect(result.success).toBe(true);
    expect(result.applied).toBe(false);
    expect(result.message).toContain("already has no pending");
  });

  it("returns applied:true when some tasks are pending", async () => {
    const { applySpec } = await import("./apply");
    await makeSpec("has-pending", "| [ ] | Do it |\n| [x] | Done |");
    const result = await applySpec(tmp, "specs", "has-pending");
    expect(result.success).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.message).toContain("applied");
  });

  it("replaces [ ] with [~] in tasks.md", async () => {
    const { applySpec } = await import("./apply");
    await makeSpec("replace-test", "| [ ] | Task 1 |\n| [ ] | Task 2 |");
    await applySpec(tmp, "specs", "replace-test");
    const tasksPath = join(specRoot, "replace-test", "tasks.md");
    const content = await readFile(tasksPath, "utf-8");
    expect(content).toContain("| [~] | Task 1 |");
    expect(content).toContain("| [~] | Task 2 |");
  });

  it("does not change completed or blocked markers", async () => {
    const { applySpec } = await import("./apply");
    await makeSpec(
      "mixed",
      "| [ ] | Pending |\n| [x] | Done |\n| [!!] | Blocked |",
    );
    await applySpec(tmp, "specs", "mixed");
    const tasksPath = join(specRoot, "mixed", "tasks.md");
    const content = await readFile(tasksPath, "utf-8");
    expect(content).toContain("| [x] | Done |");
    expect(content).toContain("| [!!] | Blocked |");
  });

  it("returns applied:false when tasks.md is empty (no pending)", async () => {
    const { applySpec } = await import("./apply");
    await makeSpec("empty", "| [~] | In progress |");
    const result = await applySpec(tmp, "specs", "empty");
    expect(result.applied).toBe(false);
  });

  it("accepts optional sessionID and includes it in message", async () => {
    const { applySpec } = await import("./apply");
    await makeSpec("session-test", "| [ ] | Task |");
    const result = await applySpec(tmp, "specs", "session-test", "sess-123");
    expect(result.message).toContain("sess-123");
  });

  it("is idempotent — second call returns applied:false", async () => {
    const { applySpec } = await import("./apply");
    await makeSpec("idempotent", "| [ ] | Task |");
    const r1 = await applySpec(tmp, "specs", "idempotent");
    const r2 = await applySpec(tmp, "specs", "idempotent");
    expect(r1.applied).toBe(true);
    expect(r2.applied).toBe(false);
  });
});
