import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { unsafeTestValue } from "../../../../../test-support/unsafe-test-value";
import type { OhMyOpenCodeConfig } from "../../config";
import {
  _resetForTesting,
  registerAgentName,
  setSessionAgent,
} from "../../features/claude-code-session-state";
import { _resetGlobalModelStoreCacheForTesting } from "../../shared/global-model-store";
import {
  clearGlobalTuiModel,
  setSelectedGlobalModel,
} from "../../shared/session-model-state";
import { applyGlobalModelToChatMessage } from "./global-model-apply";
import type { ChatMessageHandlerOutput, ChatMessageInput } from "./types";

function makeIO(): {
  input: ChatMessageInput;
  output: ChatMessageHandlerOutput;
} {
  return {
    input: { sessionID: "ses_global_apply", agent: "sisyphus" },
    output: { message: {}, parts: [] },
  };
}

describe("applyGlobalModelToChatMessage (global model → all OMO agent modes)", () => {
  let tempDataHome = "";
  let originalXdgDataHome: string | undefined;

  beforeEach(() => {
    tempDataHome = mkdtempSync(join(tmpdir(), "global-model-apply-"));
    originalXdgDataHome = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = tempDataHome;
    _resetGlobalModelStoreCacheForTesting();
    clearGlobalTuiModel();
    _resetForTesting();
    // Simulate the server process having registered OMO agents at config time
    for (
      const name of [
        "sisyphus",
        "atlas",
        "hephaestus",
        "multimodal-looker",
        "librarian",
      ]
    ) {
      registerAgentName(name);
    }
  });

  afterEach(() => {
    clearGlobalTuiModel();
    _resetForTesting();
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

  it("#given a global pick and registered agent #when chat.message fires #then model is overridden for that mode", () => {
    setSelectedGlobalModel({
      providerID: "anthropic",
      modelID: "claude-opus-5",
    });
    const { input, output } = makeIO();

    applyGlobalModelToChatMessage(
      input,
      output,
      unsafeTestValue<OhMyOpenCodeConfig>({}),
    );

    expect(output.message.model).toEqual({
      providerID: "anthropic",
      modelID: "claude-opus-5",
    });
  });

  it("#given no global pick #when chat.message fires #then model is untouched", () => {
    const { input, output } = makeIO();

    applyGlobalModelToChatMessage(
      input,
      output,
      unsafeTestValue<OhMyOpenCodeConfig>({}),
    );

    expect(output.message.model).toBeUndefined();
  });

  it("#given a non-OMO agent #when chat.message fires #then model is untouched", () => {
    setSelectedGlobalModel({
      providerID: "anthropic",
      modelID: "claude-opus-5",
    });
    const { output } = makeIO();
    const input: ChatMessageInput = {
      sessionID: "ses_global_apply",
      agent: "some-external-agent",
    };

    applyGlobalModelToChatMessage(
      input,
      output,
      unsafeTestValue<OhMyOpenCodeConfig>({}),
    );

    expect(output.message.model).toBeUndefined();
  });

  it("#given an explicit per-agent model override in user config #when chat.message fires #then override wins, global skipped", () => {
    setSelectedGlobalModel({
      providerID: "anthropic",
      modelID: "claude-opus-5",
    });
    const { input, output } = makeIO();
    const pluginConfig = unsafeTestValue<OhMyOpenCodeConfig>({
      agents: { sisyphus: { model: "openai/gpt-5.4" } },
    });

    applyGlobalModelToChatMessage(input, output, pluginConfig);

    expect(output.message.model).toBeUndefined();
  });

  it("#given vision-required agent and a text-only pick #when chat.message fires #then agent keeps its model", () => {
    // claude-opus-5 has image input in the bundled snapshot; a text-only model
    // (e.g. deepseek-reasoner) must not be forced onto multimodal-looker.
    setSelectedGlobalModel({
      providerID: "deepseek",
      modelID: "deepseek-reasoner",
    });
    const { output } = makeIO();
    const input: ChatMessageInput = {
      sessionID: "ses_global_apply",
      agent: "multimodal-looker",
    };

    applyGlobalModelToChatMessage(
      input,
      output,
      unsafeTestValue<OhMyOpenCodeConfig>({}),
    );

    expect(output.message.model).toBeUndefined();
  });

  it("#given vision-required agent and a vision-capable pick #when chat.message fires #then pick applies", () => {
    setSelectedGlobalModel({
      providerID: "anthropic",
      modelID: "claude-opus-5",
    });
    const { output } = makeIO();
    const input: ChatMessageInput = {
      sessionID: "ses_global_apply",
      agent: "multimodal-looker",
    };

    applyGlobalModelToChatMessage(
      input,
      output,
      unsafeTestValue<OhMyOpenCodeConfig>({}),
    );

    expect(output.message.model).toEqual({
      providerID: "anthropic",
      modelID: "claude-opus-5",
    });
  });

  it("#given agent only known via session map #when input.agent is missing #then session agent is used", () => {
    setSelectedGlobalModel({
      providerID: "anthropic",
      modelID: "claude-opus-5",
    });
    const { output } = makeIO();
    const input: ChatMessageInput = { sessionID: "ses_global_apply" };
    setSessionAgent("ses_global_apply", "atlas");

    applyGlobalModelToChatMessage(
      input,
      output,
      unsafeTestValue<OhMyOpenCodeConfig>({}),
    );

    expect(output.message.model).toEqual({
      providerID: "anthropic",
      modelID: "claude-opus-5",
    });
  });
});
