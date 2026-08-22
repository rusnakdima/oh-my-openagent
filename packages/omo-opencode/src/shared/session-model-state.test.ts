import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  clearAllPerAgentModels,
  clearGlobalTuiModel,
  clearPerAgentModel,
  getEffectiveModelForAgent,
  getGlobalTuiModel,
  getPerAgentModel,
  setGlobalTuiModel,
  setPerAgentModel,
  setSelectedGlobalModel,
  getSelectedGlobalModel,
} from "./session-model-state"
import { _resetGlobalModelStoreCacheForTesting } from "./global-model-store"

describe("session-model-state", () => {
  let tempDataHome = ""
  let originalXdgDataHome: string | undefined

  // Reset all state before each test to ensure isolation. XDG_DATA_HOME is
  // sandboxed so getEffectiveModelForAgent's persisted-store fallback can never
  // read a real user pick from this machine.
  beforeEach(() => {
    tempDataHome = mkdtempSync(join(tmpdir(), "session-model-state-"))
    originalXdgDataHome = process.env.XDG_DATA_HOME
    process.env.XDG_DATA_HOME = tempDataHome
    _resetGlobalModelStoreCacheForTesting()
    clearGlobalTuiModel()
    clearAllPerAgentModels()
  })

  afterEach(() => {
    clearGlobalTuiModel()
    clearAllPerAgentModels()
    _resetGlobalModelStoreCacheForTesting()
    if (originalXdgDataHome === undefined) {
      delete process.env.XDG_DATA_HOME
    } else {
      process.env.XDG_DATA_HOME = originalXdgDataHome
    }
    if (tempDataHome) {
      rmSync(tempDataHome, { recursive: true, force: true })
    }
  })

  describe("setGlobalTuiModel / getGlobalTuiModel", () => {
    it("#given no global model set #when getGlobalTuiModel #then returns null", () => {
      expect(getGlobalTuiModel()).toBeNull()
    })

    it("#given a global model is set #when getGlobalTuiModel #then returns that model", () => {
      const model = { providerID: "anthropic", modelID: "claude-3-5-sonnet" }
      setGlobalTuiModel(model)
      expect(getGlobalTuiModel()).toEqual(model)
    })

    it("#given a global model is set #when setGlobalTuiModel again #then replaces the previous value", () => {
      setGlobalTuiModel({ providerID: "anthropic", modelID: "claude-opus-4" })
      setGlobalTuiModel({ providerID: "openai", modelID: "gpt-4o" })
      expect(getGlobalTuiModel()).toEqual({ providerID: "openai", modelID: "gpt-4o" })
    })
  })

  describe("clearGlobalTuiModel", () => {
    it("#given a global model is set #when clearGlobalTuiModel #then returns null", () => {
      setGlobalTuiModel({ providerID: "anthropic", modelID: "claude-3-5-sonnet" })
      clearGlobalTuiModel()
      expect(getGlobalTuiModel()).toBeNull()
    })
  })

  describe("setPerAgentModel / getPerAgentModel", () => {
    it("#given no per-agent model set #when getPerAgentModel #then returns undefined", () => {
      expect(getPerAgentModel("sisyphus")).toBeUndefined()
    })

    it("#given a per-agent model is set #when getPerAgentModel #then returns that model", () => {
      const model = { providerID: "anthropic", modelID: "claude-3-5-sonnet" }
      setPerAgentModel("sisyphus", model)
      expect(getPerAgentModel("sisyphus")).toEqual(model)
    })

    it("#given per-agent models set for multiple agents #when getPerAgentModel #then returns only the requested agent", () => {
      setPerAgentModel("sisyphus", { providerID: "anthropic", modelID: "claude-opus-4" })
      setPerAgentModel("atlas", { providerID: "openai", modelID: "gpt-4o" })
      expect(getPerAgentModel("sisyphus")).toEqual({ providerID: "anthropic", modelID: "claude-opus-4" })
      expect(getPerAgentModel("atlas")).toEqual({ providerID: "openai", modelID: "gpt-4o" })
    })

    it("#given a per-agent model is set #when setPerAgentModel again for same agent #then replaces the previous value", () => {
      setPerAgentModel("sisyphus", { providerID: "anthropic", modelID: "claude-opus-4" })
      setPerAgentModel("sisyphus", { providerID: "minimax", modelID: "MiniMax-M2.7" })
      expect(getPerAgentModel("sisyphus")).toEqual({ providerID: "minimax", modelID: "MiniMax-M2.7" })
    })
  })

  describe("clearPerAgentModel", () => {
    it("#given a per-agent model is set #when clearPerAgentModel #then removes only that agent", () => {
      setPerAgentModel("sisyphus", { providerID: "anthropic", modelID: "claude-opus-4" })
      setPerAgentModel("atlas", { providerID: "openai", modelID: "gpt-4o" })
      clearPerAgentModel("sisyphus")
      expect(getPerAgentModel("sisyphus")).toBeUndefined()
      expect(getPerAgentModel("atlas")).toEqual({ providerID: "openai", modelID: "gpt-4o" })
    })
  })

  describe("clearAllPerAgentModels", () => {
    it("#given per-agent models set #when clearAllPerAgentModels #then removes all per-agent overrides", () => {
      setPerAgentModel("sisyphus", { providerID: "anthropic", modelID: "claude-opus-4" })
      setPerAgentModel("atlas", { providerID: "openai", modelID: "gpt-4o" })
      setPerAgentModel("hephaestus", { providerID: "minimax", modelID: "MiniMax-M2.7" })
      clearAllPerAgentModels()
      expect(getPerAgentModel("sisyphus")).toBeUndefined()
      expect(getPerAgentModel("atlas")).toBeUndefined()
      expect(getPerAgentModel("hephaestus")).toBeUndefined()
    })
  })

  describe("getEffectiveModelForAgent", () => {
    // Aug 2026 Phase 9: falls back to CATEGORY_MODEL_REQUIREMENTS / AGENT_MODEL_REQUIREMENTS
    it("#given no global model #when getEffectiveModelForAgent for category #then returns built-in fallback", () => {
      // ultrabrain is in CATEGORY_MODEL_REQUIREMENTS with first entry openai/gpt-5.6-sol
      const result = getEffectiveModelForAgent("ultrabrain")
      expect(result).toEqual({ providerID: "openai", modelID: "gpt-5.6-sol" })
    })

    it("#given no global model #when getEffectiveModelForAgent for agent #then returns built-in fallback", () => {
      // prometheus is in AGENT_MODEL_REQUIREMENTS with first entry anthropic/claude-fable-5
      const result = getEffectiveModelForAgent("prometheus")
      expect(result).toEqual({ providerID: "anthropic", modelID: "claude-fable-5" })
    })

    it("#given no global model #when getEffectiveModelForAgent for unknown name #then returns null", () => {
      // No requirements entry for this name
      const result = getEffectiveModelForAgent("unknown-agent-xyz")
      expect(result).toBeNull()
    })

    it("#given TUI model selected #when getEffectiveModelForAgent #then returns TUI model (overrides fallback)", () => {
      setGlobalTuiModel({ providerID: "minimaxi", modelID: "MiniMax-M2.7" })
      expect(getEffectiveModelForAgent("ultrabrain")).toEqual({ providerID: "minimaxi", modelID: "MiniMax-M2.7" })
      expect(getEffectiveModelForAgent("prometheus")).toEqual({ providerID: "minimaxi", modelID: "MiniMax-M2.7" })
    })

    // Aug 2026: per-agent overrides are kept internally but getEffectiveModelForAgent
    // ignores them — TUI model or built-in chain takes priority.
    it("#given per-agent override but TUI model set #when getEffectiveModelForAgent #then returns TUI model (per-agent ignored)", () => {
      setGlobalTuiModel({ providerID: "anthropic", modelID: "claude-3-5-sonnet" })
      setPerAgentModel("sisyphus", { providerID: "openai", modelID: "gpt-4o" })
      expect(getEffectiveModelForAgent("sisyphus")).toEqual({ providerID: "anthropic", modelID: "claude-3-5-sonnet" })
    })

    it("#given per-agent override but no TUI model #when getEffectiveModelForAgent #then returns built-in fallback (per-agent ignored)", () => {
      setPerAgentModel("sisyphus", { providerID: "openai", modelID: "gpt-4o" })
      // Should fall back to AGENT_MODEL_REQUIREMENTS, not the per-agent override
      const result = getEffectiveModelForAgent("sisyphus")
      expect(result?.providerID).toBe("anthropic") // first chain entry: anthropic/claude-opus-5
      expect(result?.modelID).toBe("claude-opus-5")
    })

    it("#given per-agent model is cleared and no TUI model #when getEffectiveModelForAgent #then falls back to built-in", () => {
      setGlobalTuiModel({ providerID: "anthropic", modelID: "claude-3-5-sonnet" })
      setPerAgentModel("sisyphus", { providerID: "openai", modelID: "gpt-4o" })
      clearGlobalTuiModel()
      clearPerAgentModel("sisyphus")
      const result = getEffectiveModelForAgent("sisyphus")
      expect(result?.providerID).toBe("anthropic")
      expect(result?.modelID).toBe("claude-opus-5")
    })
  })

  describe("setSelectedGlobalModel / getSelectedGlobalModel", () => {
    beforeEach(() => {
      clearGlobalTuiModel()
      clearAllPerAgentModels()
    })

    it("#given no model set #when getSelectedGlobalModel #then returns null", () => {
      expect(getSelectedGlobalModel()).toBeNull()
    })

    it("#given a model is set via setSelectedGlobalModel #when getSelectedGlobalModel #then returns it", () => {
      setSelectedGlobalModel({ providerID: "openai", modelID: "gpt-4o" })
      expect(getSelectedGlobalModel()).toEqual({ providerID: "openai", modelID: "gpt-4o" })
    })

    it("#when setSelectedGlobalModel is called #then it also clears all per-agent overrides", () => {
      setPerAgentModel("sisyphus", { providerID: "minimax", modelID: "MiniMax-M2.7" })
      setPerAgentModel("atlas", { providerID: "google", modelID: "gemini-pro" })
      expect(getPerAgentModel("sisyphus")).toEqual({ providerID: "minimax", modelID: "MiniMax-M2.7" })
      setSelectedGlobalModel({ providerID: "openai", modelID: "gpt-4o" })
      expect(getSelectedGlobalModel()).toEqual({ providerID: "openai", modelID: "gpt-4o" })
      expect(getPerAgentModel("sisyphus")).toBeUndefined()
      expect(getPerAgentModel("atlas")).toBeUndefined()
    })

    it("#given a per-agent override exists #when setSelectedGlobalModel is called #then getEffectiveModelForAgent returns the new global model", () => {
      setPerAgentModel("sisyphus", { providerID: "openai", modelID: "gpt-4o" })
      setSelectedGlobalModel({ providerID: "anthropic", modelID: "claude-opus-5" })
      expect(getEffectiveModelForAgent("sisyphus")).toEqual({ providerID: "anthropic", modelID: "claude-opus-5" })
      expect(getEffectiveModelForAgent("atlas")).toEqual({ providerID: "anthropic", modelID: "claude-opus-5" })
    })
  })
})
