import { describe, expect, it } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { resolveRoster } from "./roster-resolver"

type EnvSnapshot = {
  readonly HOME: string | undefined
  readonly OPENCODE_CONFIG_DIR: string | undefined
  readonly XDG_CONFIG_HOME: string | undefined
}

const ENV_KEYS = ["HOME", "OPENCODE_CONFIG_DIR", "XDG_CONFIG_HOME"] as const

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const key of ENV_KEYS) {
    const value = snapshot[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

function withIsolatedConfig<T>(name: string, run: (root: string) => T): T {
  const original: EnvSnapshot = {
    HOME: process.env.HOME,
    OPENCODE_CONFIG_DIR: process.env.OPENCODE_CONFIG_DIR,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  }
  const root = join(tmpdir(), `omo-tui-roster-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  try {
    mkdirSync(root, { recursive: true })
    process.env.HOME = root
    process.env.OPENCODE_CONFIG_DIR = join(root, "custom-config")
    process.env.XDG_CONFIG_HOME = join(root, "xdg-config")
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
    restoreEnv(original)
  }
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(join(filePath, ".."), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8")
}

describe("resolveRoster", () => {
  it("#given no config #when resolving roster #then it returns empty (no fallback models shown)", () => {
    withIsolatedConfig("defaults", (root) => {
      // given
      const project = join(root, "project")
      mkdirSync(project, { recursive: true })

      // when
      const rows = resolveRoster(project)

      // then - no user config means no entries shown (fallback chains not used since Aug 2026)
      expect(rows.length).toBe(0)
    })
  })

  it("#given agent and category overrides #when resolving roster #then it flattens sorted display rows", () => {
    withIsolatedConfig("overrides", (root) => {
      // given
      const project = join(root, "project")
      writeJson(join(project, ".omo", "omo.jsonc"), {
        "[opencode]": {
          agents: {
            sisyphus: { model: "provider/family/model-leaf" },
          },
          categories: {
            deep: { model: "simple-model" },
          },
        },
      })

      // when
      const rows = resolveRoster(project)

      // then
      expect(rows).toEqual([...rows].sort((left, right) => left.label.localeCompare(right.label)))
      expect(rows).toContainEqual({ label: "sisyphus", model: "model-leaf" })
      expect(rows).toContainEqual({ label: "deep", model: "simple-model" })
    })
  })

  it("#given malformed config #when resolving roster #then it returns empty (malformed means no valid override)", () => {
    withIsolatedConfig("malformed", (root) => {
      // given
      const project = join(root, "project")
      writeJson(join(project, ".opencode", "omo.json"), {
        agents: { sisyphus: { model: 123 } },
      })

      // when
      const rows = resolveRoster(project)

      // then - malformed config means no valid userOverride, so empty
      expect(rows.length).toBe(0)
    })
  })
})
