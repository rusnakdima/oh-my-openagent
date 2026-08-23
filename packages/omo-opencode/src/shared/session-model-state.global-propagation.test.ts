import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as connectedCache from "./connected-providers-cache";
import {
  clearAllPerAgentModels,
  clearGlobalTuiModel,
  getEffectiveModelForAgent,
  setSelectedGlobalModel,
} from "./session-model-state";
import {
  _resetGlobalModelStoreCacheForTesting,
  persistGlobalModel,
} from "./global-model-store";

describe("global model applies to all agent modes (repro /models bug)", () => {
  let tempDataHome = "";
  let originalXdgDataHome: string | undefined;

  beforeEach(() => {
    tempDataHome = mkdtempSync(join(tmpdir(), "global-propagation-"));
    originalXdgDataHome = process.env.XDG_DATA_HOME;
    // Sandbox the persisted-store fallback — never read a real user pick
    process.env.XDG_DATA_HOME = tempDataHome;
    _resetGlobalModelStoreCacheForTesting();
    clearGlobalTuiModel();
    clearAllPerAgentModels();
    // Ensure provider default does not shadow fallback
    spyOn(connectedCache, "readProviderModelsCache").mockReturnValue(
      null as unknown as ReturnType<
        typeof connectedCache.readProviderModelsCache
      >,
    );
  });

  afterEach(() => {
    clearGlobalTuiModel();
    clearAllPerAgentModels();
    _resetGlobalModelStoreCacheForTesting();
    if (originalXdgDataHome === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = originalXdgDataHome;
    }
    if (tempDataHome) {
      rmSync(tempDataHome, { recursive: true, force: true });
    }
    const mockRestore = (connectedCache.readProviderModelsCache as unknown as {
      mockRestore?: () => void;
    }).mockRestore;
    if (typeof mockRestore === "function") {
      mockRestore.call(connectedCache.readProviderModelsCache);
    }
  });

  it("all agents return selected model, not their fallback chain", () => {
    // given: user picked via /models (TUI or chat.params capture)
    setSelectedGlobalModel({
      providerID: "anthropic",
      modelID: "claude-opus-5",
    });
    const selected = "anthropic/claude-opus-5";
    const fallbackExample = "openai/gpt-5.6-luna-fast"; // librarian/explore first entry

    const sisyphus = getEffectiveModelForAgent("sisyphus"); // primary
    const hephaestus = getEffectiveModelForAgent("hephaestus"); // primary
    const atlas = getEffectiveModelForAgent("atlas"); // primary
    const oracle = getEffectiveModelForAgent("oracle"); // subagent
    const librarian = getEffectiveModelForAgent("librarian"); // subagent
    const explore = getEffectiveModelForAgent("explore"); // subagent
    const multimodal = getEffectiveModelForAgent("multimodal-looker");
    const metis = getEffectiveModelForAgent("metis");
    const momus = getEffectiveModelForAgent("momus");
    const junior = getEffectiveModelForAgent("sisyphus-junior");
    const categoryHigh = getEffectiveModelForAgent("ultrabrain"); // category

    for (
      const ef of [
        sisyphus,
        hephaestus,
        atlas,
        oracle,
        librarian,
        explore,
        multimodal,
        metis,
        momus,
        junior,
        categoryHigh,
      ]
    ) {
      expect(ef).toEqual({ providerID: "anthropic", modelID: "claude-opus-5" });
      expect(`${ef!.providerID}/${ef!.modelID}`).toBe(selected);
      expect(`${ef!.providerID}/${ef!.modelID}`).not.toBe(fallbackExample);
    }
  });

  it("without global, falls back to builtin chain (proves test would fail pre-fix vs post-fix distinct)", () => {
    const librarianFallback = getEffectiveModelForAgent("librarian");
    expect(librarianFallback).toEqual({
      providerID: "openai",
      modelID: "gpt-5.6-luna-fast",
    });
  });

  it("global overrides provider default for all modes", () => {
    // provider default would be openai/gpt-4 if cache set, but global should win
    spyOn(connectedCache, "readProviderModelsCache").mockReturnValue({
      models: { openai: [{ id: "gpt-4" } as unknown as { id: string }] },
      connected: ["openai"],
    } as unknown as ReturnType<typeof connectedCache.readProviderModelsCache>);
    setSelectedGlobalModel({
      providerID: "anthropic",
      modelID: "claude-opus-5",
    });
    expect(getEffectiveModelForAgent("librarian")).toEqual({
      providerID: "anthropic",
      modelID: "claude-opus-5",
    });
    expect(getEffectiveModelForAgent("sisyphus")).toEqual({
      providerID: "anthropic",
      modelID: "claude-opus-5",
    });
  });

  it("persisted cross-process pick is honored when heap is empty (TUI-process pick)", () => {
    // given: TUI process persisted a pick; server process heap is empty
    persistGlobalModel({ providerID: "openai", modelID: "gpt-5.4" });

    // then: every mode resolves to the persisted pick without any heap value
    expect(getEffectiveModelForAgent("sisyphus")).toEqual({
      providerID: "openai",
      modelID: "gpt-5.4",
    });
    expect(getEffectiveModelForAgent("librarian")).toEqual({
      providerID: "openai",
      modelID: "gpt-5.4",
    });
  });

  it("heap pick wins over stale persisted pick", () => {
    persistGlobalModel({ providerID: "openai", modelID: "gpt-5.4" });
    setSelectedGlobalModel({
      providerID: "anthropic",
      modelID: "claude-opus-5",
    });
    expect(getEffectiveModelForAgent("sisyphus")).toEqual({
      providerID: "anthropic",
      modelID: "claude-opus-5",
    });
  });
});
