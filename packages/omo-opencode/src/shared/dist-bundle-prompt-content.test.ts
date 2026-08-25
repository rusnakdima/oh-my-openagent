/// <reference types="bun-types" />

import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const DIST_INDEX = "dist/index.js";
const PROMETHEUS_SOURCE = "packages/prompts-core/prompts/prometheus/default.md";
const BUNDLE_PROBE_SCRIPT = `
const [distUrl, projectDirectory] = process.argv.slice(1);
const module = await import(distUrl);
const hooks = await module.default.server({
  directory: projectDirectory,
  client: {},
  serverUrl: new URL("http://127.0.0.1:1"),
}, {});
try {
  const config = {};
  await hooks.config(config);
  const agents = Object.values(config.agent ?? {}).filter(
    (entry) => typeof entry === "object" && entry !== null && typeof entry.prompt === "string",
  );
  process.stdout.write(JSON.stringify(agents));
} finally {
  await hooks.dispose?.();
}
`;

type RuntimeAgent = {
  mode?: unknown;
  permission?: unknown;
  prompt: string;
};

type ProbeFixture = {
  fixtureRoot: string;
  projectDirectory: string;
  homeDirectory: string;
};

async function createProbeFixture(
  seedProjectConfig = false,
): Promise<ProbeFixture> {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "omo-dist-prompt-"));
  const homeDirectory = join(fixtureRoot, "home");
  const projectDirectory = join(fixtureRoot, "project");
  await Bun.write(join(homeDirectory, ".keep"), "");
  await Bun.write(join(projectDirectory, ".keep"), "");
  if (seedProjectConfig) {
    // Per-agent explicit model resolves via the "override" provenance without
    // any provider caches, so the builtin agent set registers deterministically.
    await Bun.write(
      join(projectDirectory, ".omo", "omo.jsonc"),
      JSON.stringify({
        agents: { sisyphus: { model: "anthropic/claude-sonnet-4-5" } },
      }),
    );
  }
  return { fixtureRoot, projectDirectory, homeDirectory };
}

async function runBundleProbe(
  fixture: ProbeFixture,
): Promise<{ runtimeAgents: RuntimeAgent[]; diagnostics: string }> {
  const node = Bun.which("node");
  expect(
    node,
    "node is required to execute the published ESM bundle seam",
  ).not.toBeNull();
  const child = Bun.spawn({
    cmd: [
      node!,
      "--input-type=module",
      "-e",
      BUNDLE_PROBE_SCRIPT,
      new URL(`../../../../${DIST_INDEX}`, import.meta.url).href,
      fixture.projectDirectory,
    ],
    cwd: process.cwd(),
    env: {
      ...Bun.env,
      HOME: fixture.homeDirectory,
      XDG_CONFIG_HOME: join(fixture.homeDirectory, ".config"),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exitCode, `${stdout}\n${stderr}`.trim()).toBe(0);
  return { runtimeAgents: JSON.parse(stdout), diagnostics: stderr.trim() };
}

describe("dist bundle prompt content", () => {
  test.skipIf(!existsSync(DIST_INDEX))(
    "#given a sanitized bare environment #when the built plugin runtime assembles agents #then no builtin agents register (provider-default-wins policy)",
    async () => {
      const fixture = await createProbeFixture();
      try {
        const { runtimeAgents } = await runBundleProbe(fixture);
        expect(runtimeAgents).toEqual([]);
      } finally {
        await rm(fixture.fixtureRoot, { recursive: true, force: true });
      }
    },
    30_000,
  );

  test.skipIf(!existsSync(DIST_INDEX))(
    "#given a project config with an explicit per-agent model #when the built plugin runtime assembles agents #then prometheus registers and the bundled prompt equals its source artifact",
    async () => {
      const fixture = await createProbeFixture(true);
      try {
        const { runtimeAgents } = await runBundleProbe(fixture);
        const sourcePrompt = await readFile(PROMETHEUS_SOURCE, "utf8");
        const runtimeAgent = runtimeAgents.find((agent) =>
          agent.prompt === sourcePrompt
        );
        expect(
          runtimeAgent,
          `${PROMETHEUS_SOURCE} was not returned by the built plugin runtime`,
        ).toBeDefined();
        expect(runtimeAgent).toMatchObject({
          mode: "primary",
          permission: {
            call_omo_agent: "deny",
            edit: "allow",
            question: "allow",
            task: "allow",
            webfetch: "allow",
          },
        });
      } finally {
        await rm(fixture.fixtureRoot, { recursive: true, force: true });
      }
    },
    30_000,
  );
});

