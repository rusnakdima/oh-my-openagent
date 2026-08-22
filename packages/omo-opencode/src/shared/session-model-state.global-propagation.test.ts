import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test"
import * as connectedCache from "./connected-providers-cache"
import {
  clearGlobalTuiModel,
  clearAllPerAgentModels,
  setSelectedGlobalModel,
  getEffectiveModelForAgent,
} from "./session-model-state"

describe("global model applies to all agent modes (repro /models bug)", () => {
  beforeEach(() => {
    clearGlobalTuiModel()
    clearAllPerAgentModels()
    // Ensure provider default does not shadow fallback
    spyOn(connectedCache, "readProviderModelsCache").mockReturnValue(null as unknown as ReturnType<typeof connectedCache.readProviderModelsCache>)
  })

  afterEach(() => {
    clearGlobalTuiModel()
    clearAllPerAgentModels()
    // @ts-ignore mock restore
    try { (connectedCache.readProviderModelsCache as unknown as { mockRestore?: () => void }).mockRestore?.() } catch {}
  })

  it("all agents return selected model, not their fallback chain", () => {
    // given: user picked via /models (TUI or chat.params capture)
    setSelectedGlobalModel({ providerID: "anthropic", modelID: "claude-opus-5" })
    const selected = "anthropic/claude-opus-5"
    const fallbackExample = "openai/gpt-5.6-luna-fast" // librarian/explore first entry

    const sisyphus = getEffectiveModelForAgent("sisyphus") // primary
    const hephaestus = getEffectiveModelForAgent("hephaestus") // primary
    const atlas = getEffectiveModelForAgent("atlas") // primary
    const oracle = getEffectiveModelForAgent("oracle") // subagent
    const librarian = getEffectiveModelForAgent("librarian") // subagent
    const explore = getEffectiveModelForAgent("explore") // subagent
    const multimodal = getEffectiveModelForAgent("multimodal-looker")
    const metis = getEffectiveModelForAgent("metis")
    const momus = getEffectiveModelForAgent("momus")
    const junior = getEffectiveModelForAgent("sisyphus-junior")
    const categoryHigh = getEffectiveModelForAgent("ultrabrain") // category

    for (const ef of [sisyphus, hephaestus, atlas, oracle, librarian, explore, multimodal, metis, momus, junior, categoryHigh]) {
      expect(ef).toEqual({ providerID: "anthropic", modelID: "claude-opus-5" })
      expect(`${ef!.providerID}/${ef!.modelID}`).toBe(selected)
      expect(`${ef!.providerID}/${ef!.modelID}`).not.toBe(fallbackExample)
    }
  })

  it("without global, falls back to builtin chain (proves test would fail pre-fix vs post-fix distinct)", () => {
    const librarianFallback = getEffectiveModelForAgent("librarian")
    expect(librarianFallback).toEqual({ providerID: "openai", modelID: "gpt-5.6-luna-fast" })
  })

  it("global overrides provider default for all modes", () => {
    // provider default would be openai/gpt-4 if cache set, but global should win
    spyOn(connectedCache, "readProviderModelsCache").mockReturnValue({
      models: { openai: [{ id: "gpt-4" } as unknown as { id: string }] },
      connected: ["openai"],
    } as unknown as ReturnType<typeof connectedCache.readProviderModelsCache>)
    setSelectedGlobalModel({ providerID: "anthropic", modelID: "claude-opus-5" })
    expect(getEffectiveModelForAgent("librarian")).toEqual({ providerID: "anthropic", modelID: "claude-opus-5" })
    expect(getEffectiveModelForAgent("sisyphus")).toEqual({ providerID: "anthropic", modelID: "claude-opus-5" })
  })
})
