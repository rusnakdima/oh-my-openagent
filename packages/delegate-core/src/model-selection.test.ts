import { describe, expect, test } from "bun:test"
import { resolveModelForDelegateTask } from "./model-selection"

describe("resolveModelForDelegateTask", () => {
  test("#given available models #when userModel is provided #then returns user model", () => {
    const result = resolveModelForDelegateTask({
      userModel: "openai/gpt-5.4",
      availableModels: new Set(["openai/gpt-5.4", "anthropic/claude-sonnet-4.6"]),
      systemDefaultModel: "anthropic/claude-sonnet-4.6",
    }, {})

    expect(result).toEqual({ model: "openai/gpt-5.4" })
  })

  test("#given userModel with variant #when variant in model string #then extracts variant", () => {
    const result = resolveModelForDelegateTask({
      userModel: "openai/gpt-5.4 medium",
      availableModels: new Set(["openai/gpt-5.4", "anthropic/claude-sonnet-4.6"]),
      systemDefaultModel: "anthropic/claude-sonnet-4.6",
    }, {})

    expect(result).toEqual({ model: "openai/gpt-5.4", variant: "medium" })
  })

  test("#given no userModel #when availableModels is empty #then returns skipped sentinel", () => {
    const result = resolveModelForDelegateTask({
      availableModels: new Set(),
      systemDefaultModel: "anthropic/claude-sonnet-4.6",
    }, {})

    expect(result).toEqual({ skipped: true })
  })

  test("#given available models with no userModel #when systemDefaultModel set #then returns system default", () => {
    const result = resolveModelForDelegateTask({
      availableModels: new Set(["openai/gpt-5.4"]),
      systemDefaultModel: "anthropic/claude-sonnet-4.6",
    }, {})

    expect(result).toEqual({ model: "anthropic/claude-sonnet-4.6" })
  })

  test("#given available models #when no userModel and no systemDefaultModel #then returns undefined", () => {
    const result = resolveModelForDelegateTask({
      availableModels: new Set(["openai/gpt-5.4"]),
    }, {})

    expect(result).toBeUndefined()
  })
})
