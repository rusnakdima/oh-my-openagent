import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { writeGlobalModelToConfigs } from "./persist-config-model"

describe("writeGlobalModelToConfigs", () => {
  let tempRoot = ""
  let originalXdgConfigHome: string | undefined
  let originalOpencodeConfigDir: string | undefined

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "persist-config-model-"))
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME
    originalOpencodeConfigDir = process.env.OPENCODE_CONFIG_DIR
    // Sandbox both resolvers: XDG_CONFIG_HOME for mimocode, OPENCODE_CONFIG_DIR for opencode
    process.env.XDG_CONFIG_HOME = join(tempRoot, "config")
    process.env.OPENCODE_CONFIG_DIR = join(tempRoot, "config", "opencode")
    mkdirSync(process.env.OPENCODE_CONFIG_DIR, { recursive: true })
  })

  afterEach(() => {
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome
    }
    if (originalOpencodeConfigDir === undefined) {
      delete process.env.OPENCODE_CONFIG_DIR
    } else {
      process.env.OPENCODE_CONFIG_DIR = originalOpencodeConfigDir
    }
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it("#given opencode.jsonc with user comments #when writeGlobalModelToConfigs #then comments survive and model is set", () => {
    const configPath = join(process.env.OPENCODE_CONFIG_DIR, "opencode.jsonc")
    writeFileSync(configPath, [
      "{",
      "  // my custom comment that must survive",
      '  "theme": "dark",',
      '  "model": "openai/gpt-4o"',
      "}",
    ].join("\n"), "utf-8")

    writeGlobalModelToConfigs({ providerID: "anthropic", modelID: "claude-opus-5" })

    const updated = readFileSync(configPath, "utf-8")
    expect(updated).toContain("// my custom comment that must survive")
    expect(updated).toContain('"anthropic/claude-opus-5"')
    expect(updated).toContain('"theme": "dark"')
    expect(updated).not.toContain("gpt-4o")
  })

  it("#given mimocode.jsonc exists #when writeGlobalModelToConfigs #then both configs are updated", () => {
    const openCodePath = join(process.env.OPENCODE_CONFIG_DIR, "opencode.jsonc")
    const mimocodeDir = join(process.env.XDG_CONFIG_HOME as string, "mimocode")
    mkdirSync(mimocodeDir, { recursive: true })
    const mimocodePath = join(mimocodeDir, "mimocode.jsonc")
    writeFileSync(openCodePath, "{\n}", "utf-8")
    writeFileSync(mimocodePath, "{\n  // keep me\n}\n", "utf-8")

    writeGlobalModelToConfigs({ providerID: "openai", modelID: "gpt-5.4" })

    expect(readFileSync(openCodePath, "utf-8")).toContain("gpt-5.4")
    const mimocodeUpdated = readFileSync(mimocodePath, "utf-8")
    expect(mimocodeUpdated).toContain("gpt-5.4")
    expect(mimocodeUpdated).toContain("// keep me")
  })

  it("#given neither config file exists #when writeGlobalModelToConfigs #then no config file is created", () => {
    writeGlobalModelToConfigs({ providerID: "openai", modelID: "gpt-5.4" })
    expect(readdirSync(process.env.OPENCODE_CONFIG_DIR)).toEqual([])
  })
})
