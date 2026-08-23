import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  _resetGlobalModelStoreCacheForTesting,
  globalModelStorePath,
  persistGlobalModel,
  readPersistedGlobalModel,
} from "./global-model-store";

describe("global-model-store", () => {
  let tempDataHome = "";
  let originalXdgDataHome: string | undefined;

  beforeEach(() => {
    tempDataHome = mkdtempSync(join(tmpdir(), "global-model-store-"));
    originalXdgDataHome = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = tempDataHome;
    _resetGlobalModelStoreCacheForTesting();
  });

  afterEach(() => {
    _resetGlobalModelStoreCacheForTesting();
    if (originalXdgDataHome === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = originalXdgDataHome;
    }
    if (tempDataHome) {
      rmSync(tempDataHome, { recursive: true, force: true });
    }
  });

  it("#given empty store #when readPersistedGlobalModel #then returns null (never throws)", () => {
    expect(readPersistedGlobalModel()).toBeNull();
  });

  it("#given a persisted pick #when readPersistedGlobalModel #then round-trips the model", () => {
    persistGlobalModel({ providerID: "anthropic", modelID: "claude-opus-5" });
    expect(readPersistedGlobalModel()).toEqual({
      providerID: "anthropic",
      modelID: "claude-opus-5",
    });
  });

  it("#given a persisted pick #when read from a fresh process cache #then still returns the model", () => {
    persistGlobalModel({ providerID: "openai", modelID: "gpt-5.4" });
    // Simulate another process: drop the in-memory mtime cache
    _resetGlobalModelStoreCacheForTesting();
    expect(readPersistedGlobalModel()).toEqual({
      providerID: "openai",
      modelID: "gpt-5.4",
    });
  });

  it("#given an externally rewritten store #when readPersistedGlobalModel #then mtime cache invalidates", () => {
    persistGlobalModel({ providerID: "openai", modelID: "gpt-5.4" });
    expect(readPersistedGlobalModel()).toEqual({
      providerID: "openai",
      modelID: "gpt-5.4",
    });

    // External writer (the other process) replaces the pick
    const storePath = globalModelStorePath();
    writeFileSync(
      storePath,
      JSON.stringify({
        version: 1,
        providerID: "anthropic",
        modelID: "claude-opus-5",
        updatedAt: new Date().toISOString(),
      }),
      "utf-8",
    );

    expect(readPersistedGlobalModel()).toEqual({
      providerID: "anthropic",
      modelID: "claude-opus-5",
    });
  });

  it("#given invalid store content #when readPersistedGlobalModel #then degrades to null", () => {
    const storePath = globalModelStorePath();
    existsSync(storePath); // path computed but store not yet created
    mkdirSync(join(tempDataHome, "opencode/storage/oh-my-openagent"), {
      recursive: true,
    });
    writeFileSync(storePath, "{not json", "utf-8");
    expect(readPersistedGlobalModel()).toBeNull();

    writeFileSync(
      storePath,
      JSON.stringify({ version: 99, providerID: "x", modelID: "y" }),
      "utf-8",
    );
    expect(readPersistedGlobalModel()).toBeNull();

    writeFileSync(
      storePath,
      JSON.stringify({ version: 1, providerID: "", modelID: "y" }),
      "utf-8",
    );
    expect(readPersistedGlobalModel()).toBeNull();
  });

  it("#when persistGlobalModel #then write is atomic (no .tmp leftover) and readable", () => {
    persistGlobalModel({ providerID: "openai", modelID: "gpt-5.4" });
    const storePath = globalModelStorePath();
    expect(existsSync(storePath)).toBe(true);
    expect(existsSync(`${storePath}.tmp`)).toBe(false);
    const raw = JSON.parse(readFileSync(storePath, "utf-8")) as {
      version: number;
      providerID: string;
      modelID: string;
    };
    expect(raw.version).toBe(1);
    expect(raw.providerID).toBe("openai");
    expect(raw.modelID).toBe("gpt-5.4");
  });

  it("#given a later pick #when persistGlobalModel #then replaces the previous pick", () => {
    persistGlobalModel({ providerID: "openai", modelID: "gpt-5.4" });
    persistGlobalModel({ providerID: "anthropic", modelID: "claude-opus-5" });
    expect(readPersistedGlobalModel()).toEqual({
      providerID: "anthropic",
      modelID: "claude-opus-5",
    });
  });
});
