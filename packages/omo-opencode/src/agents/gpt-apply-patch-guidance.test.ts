import { describe, expect, test } from "bun:test";

import {
  createHephaestusAgent,
  getHephaestusPrompt,
  getHephaestusPromptSource,
} from "./hephaestus";
import { maybeCreateHephaestusConfig } from "./builtin-agents/hephaestus-agent";
import type { AgentOverrides } from "./types";
import type { CategoryConfig } from "../config/schema";

describe("Hephaestus model eligibility", () => {
  test("#given non-GPT Hephaestus variants #when rendering prompts #then the generic GPT fallback prompt is used", () => {
    // given
    const models = [
      "opencode-go/qwen3.7-plus",
      "opencode-go/qwen3.7PLUS",
      "qwen3.7PLUS",
      "bailian-coding-plan/qwen3.7PLUS",
      "Qwen3.7PLUS",
      "opencode-go/qwen3.5-plus",
    ];

    for (const model of models) {
      // when / then - non-GPT models no longer throw; they route to the
      // generic GPT fallback prompt so the agent still registers and runs.
      expect(getHephaestusPromptSource(model)).toBe("gpt");
      const config = createHephaestusAgent(model);
      expect(config.prompt).toBe(getHephaestusPrompt(model));
    }
  });

  test("#given non-GPT Hephaestus override #when plugin config creates the agent #then Hephaestus registers with the override model", () => {
    // given
    const agentOverrides: AgentOverrides = {
      hephaestus: {
        model: "opencode-go/qwen3.7PLUS",
      },
    };
    const mergedCategories: Record<string, CategoryConfig> = {};

    // when
    const config = maybeCreateHephaestusConfig({
      disabledAgents: [],
      agentOverrides,
      availableModels: new Set(["opencode-go/qwen3.7PLUS"]),
      systemDefaultModel: "opencode-go/qwen3.7PLUS",
      isFirstRunNoCache: false,
      availableAgents: [],
      availableSkills: [],
      availableCategories: [],
      mergedCategories,
      useTaskSystem: false,
    });

    // then - non-GPT models no longer block registration
    expect(config).toBeDefined();
    expect(config?.model).toBe("opencode-go/qwen3.7PLUS");
  });
});
