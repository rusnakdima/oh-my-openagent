import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import {
  clearAllPerAgentModels,
  clearGlobalTuiModel,
  clearPerAgentModel,
  getEffectiveModelForAgent,
  getGlobalTuiModel,
  getPerAgentModel,
  setGlobalTuiModel,
  setPerAgentModel,
} from "./session-model-state"

describe("session-model-state", () => {
  // Reset all state before each test to ensure isolation
  beforeEach(() => {
    clearGlobalTuiModel()
    clearAllPerAgentModels()
  })

  afterEach(() => {
    clearGlobalTuiModel()
    clearAllPerAgentModels()
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
    it("#given no global and no per-agent model #when getEffectiveModelForAgent #then returns null", () => {
      expect(getEffectiveModelForAgent("sisyphus")).toBeNull()
    })

    it("#given global model but no per-agent #when getEffectiveModelForAgent #then returns global", () => {
      setGlobalTuiModel({ providerID: "anthropic", modelID: "claude-3-5-sonnet" })
      expect(getEffectiveModelForAgent("sisyphus")).toEqual({ providerID: "anthropic", modelID: "claude-3-5-sonnet" })
    })

    it("#given per-agent override #when getEffectiveModelForAgent for that agent #then returns per-agent model (takes priority)", () => {
      setGlobalTuiModel({ providerID: "anthropic", modelID: "claude-3-5-sonnet" })
      setPerAgentModel("sisyphus", { providerID: "openai", modelID: "gpt-4o" })
      expect(getEffectiveModelForAgent("sisyphus")).toEqual({ providerID: "openai", modelID: "gpt-4o" })
    })

    it("#given per-agent override for one agent but not another #when getEffectiveModelForAgent for un-overridden agent #then returns global", () => {
      setGlobalTuiModel({ providerID: "anthropic", modelID: "claude-3-5-sonnet" })
      setPerAgentModel("sisyphus", { providerID: "openai", modelID: "gpt-4o" })
      expect(getEffectiveModelForAgent("atlas")).toEqual({ providerID: "anthropic", modelID: "claude-3-5-sonnet" })
    })

    it("#given per-agent model is cleared #when getEffectiveModelForAgent #then falls back to global", () => {
      setGlobalTuiModel({ providerID: "anthropic", modelID: "claude-3-5-sonnet" })
      setPerAgentModel("sisyphus", { providerID: "openai", modelID: "gpt-4o" })
      clearPerAgentModel("sisyphus")
      expect(getEffectiveModelForAgent("sisyphus")).toEqual({ providerID: "anthropic", modelID: "claude-3-5-sonnet" })
    })
  })
})
