import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe("cli-program", () => {
  test("install command exposes 'setup' as an alias so the historical install path keeps working", async () => {
    // given
    const cliProgramSource = await readFile(
      path.resolve(import.meta.dir, "cli-program.ts"),
      "utf-8",
    );

    // when
    const installBlock = cliProgramSource.match(
      /program\s*\n\s*\.command\("install"\)([\s\S]*?)\.action\(/,
    );

    // then
    expect(installBlock).not.toBeNull();
    expect(installBlock?.[1]).toContain('.alias("setup")');
  });

  test("cleanup command exposes Codex cleanup for lazycodex migrations", async () => {
    // given
    const cliProgramSource = await readFile(
      path.resolve(import.meta.dir, "cleanup-command.ts"),
      "utf-8",
    );

    // when
    const cleanupBlock = cliProgramSource.match(
      /program\s*\n\s*\.command\("cleanup"\)([\s\S]*?)\.action\(/,
    );

    // then
    expect(cleanupBlock).not.toBeNull();
    expect(cleanupBlock?.[1]).toContain('new Option("--platform <platform>"');
    expect(cleanupBlock?.[1]).toContain('.choices(["codex"])');
    expect(cleanupBlock?.[1]).toContain("--codex-home");
    expect(cleanupBlock?.[1]).toContain("--project");
  });

  test("cleanup command exposes uninstall as the user-facing alias", async () => {
    // given
    const cliProgramSource = await readFile(
      path.resolve(import.meta.dir, "cleanup-command.ts"),
      "utf-8",
    );

    // when
    const cleanupBlock = cliProgramSource.match(
      /program\s*\n\s*\.command\("cleanup"\)([\s\S]*?)\.action\(/,
    );

    // then
    expect(cleanupBlock).not.toBeNull();
    expect(cleanupBlock?.[1]).toContain('.alias("uninstall")');
  });

  test("config migrate command exposes dry-run and JSON-only controls", async () => {
    // given
    const cliProgramSource = await readFile(
      path.resolve(import.meta.dir, "cli-program.ts"),
      "utf-8",
    );

    // when
    const migrateBlock = cliProgramSource.match(
      /\.command\("config"\)([\s\S]*?)configureRuntimeCommands/,
    );

    // then
    expect(migrateBlock).not.toBeNull();
    expect(migrateBlock?.[1]).toContain('.command("migrate")');
    expect(migrateBlock?.[1]).toMatch(/\.option\(\s*"--dry-run"/);
    expect(migrateBlock?.[1]).toMatch(/\.option\(\s*"--json"/);
    expect(migrateBlock?.[1]).toContain("runConfigMigrate");
  });

  test("doctor command exposes explicit platform selection for Codex-only diagnostics", async () => {
    // given
    const cliProgramSource = await readFile(
      path.resolve(import.meta.dir, "cli-program.ts"),
      "utf-8",
    );

    // when
    const doctorBlock = cliProgramSource.match(
      /program\s*\n\s*\.command\("doctor"\)([\s\S]*?)\.action\(/,
    );

    // then
    expect(doctorBlock).not.toBeNull();
    expect(doctorBlock?.[1]).toMatch(
      /new Option\(\s*"--platform <platform>"/,
    );
    expect(doctorBlock?.[1]).toContain('.choices(["opencode", "codex"])');
    expect(cliProgramSource).toMatch(
      /resolveDoctorTarget\(\s*process\.env\.OMO_INVOCATION_NAME,\s*options\.platform \?\? rootDoctorPlatform,?\s*\)/,
    );
  });
});

test("program configures explicit '-h, --help' help option for consistent help-flag ordering", async () => {
  // given
  const cliProgramSource = await readFile(
    path.resolve(import.meta.dir, "cli-program.ts"),
    "utf-8",
  );

  // when
  const programBlock = cliProgramSource.match(
    /program\s*\n((?:\s*\.\w+\([^)]*\)\s*\n?)*)/,
  );

  // then
  expect(programBlock).not.toBeNull();
  expect(programBlock?.[1]).toContain(
    '.helpOption("-h, --help", "Display help for command")',
  );
});

test("program registers runtime commands", async () => {
  // given
  const cliProgramSource = await readFile(
    path.resolve(import.meta.dir, "cli-program.ts"),
    "utf-8",
  );
  const registersRuntimeCommands =
    /configureRuntimeCommands\(program\b/.test(cliProgramSource);

  // then
  expect(registersRuntimeCommands).toBe(true);
});
