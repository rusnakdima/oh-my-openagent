/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import { resolveModelForDelegateTask } from "./model-selection"
import * as connectedProvidersCache from "../../shared/connected-providers-cache"

describe("resolveModelForDelegateTask", () => {
	let hasConnectedProvidersSpy: ReturnType<typeof spyOn> | undefined
	let hasProviderModelsSpy: ReturnType<typeof spyOn> | undefined

	beforeEach(() => {
		mock.restore()
	})

	afterEach(() => {
		hasConnectedProvidersSpy?.mockRestore()
		hasProviderModelsSpy?.mockRestore()
	})

	// ─────────────────────────────────────────────────────────────
	// Step 1: userModel — always wins when provided
	// ─────────────────────────────────────────────────────────────

	describe("#given userModel is set", () => {
		describe("#when availableModels is empty (cold cache)", () => {
			test("#then returns userModel as-is (user's explicit choice is honored)", () => {
				const result = resolveModelForDelegateTask({
					userModel: "minimax/MiniMax-M2.7",
					availableModels: new Set(),
				})
				expect(result).toEqual({ model: "minimax/MiniMax-M2.7" })
			})
		})

		describe("#when availableModels is warm and model is available", () => {
			test("#then returns userModel with availability confirmed", () => {
				const result = resolveModelForDelegateTask({
					userModel: "minimax/MiniMax-M2.7",
					availableModels: new Set(["minimax/MiniMax-M2.7"]),
				})
				expect(result).toEqual({ model: "minimax/MiniMax-M2.7" })
			})
		})

		describe("#when userModel has variant (space-separated)", () => {
			test("#then extracts variant from space-separated syntax", () => {
				const result = resolveModelForDelegateTask({
					userModel: "openai/gpt-5.4 high",
					availableModels: new Set(["openai/gpt-5.4"]),
				})
				expect(result).toEqual({ model: "openai/gpt-5.4", variant: "high" })
			})
		})

		describe("#when userModel has variant (parenthesized)", () => {
			test("#then extracts variant from parenthesized syntax", () => {
				const result = resolveModelForDelegateTask({
					userModel: "openai/gpt-5.4(max)",
					availableModels: new Set(),
				})
				expect(result).toEqual({ model: "openai/gpt-5.4", variant: "max" })
			})
		})

		describe("#when userModel has no variant syntax", () => {
			test("#then returns model without variant", () => {
				const result = resolveModelForDelegateTask({
					userModel: "minimax/MiniMax-M2.7",
					availableModels: new Set(),
				})
				expect(result).toEqual({ model: "minimax/MiniMax-M2.7" })
			})
		})

		describe("#when userModel has a non-variant suffix in the name", () => {
			test("#then preserves the full model name without extracting a variant", () => {
				const result = resolveModelForDelegateTask({
					userModel: "new-api-openai/gpt-5.4-high",
					availableModels: new Set(),
				})
				expect(result).toEqual({ model: "new-api-openai/gpt-5.4-high" })
			})
		})

		describe("#when userModel is in availableModels with different provider format", () => {
			test("#then fuzzy-matches the provider", () => {
				const result = resolveModelForDelegateTask({
					userModel: "openai/gpt-5.4",
					availableModels: new Set(["openai/gpt-5.4"]),
				})
				expect(result).toEqual({ model: "openai/gpt-5.4" })
			})
		})

		describe("#when userModel is NOT in availableModels but cache is warm", () => {
			test("#then returns userModel as-is (user's explicit choice honored even if unavailable)", () => {
				const result = resolveModelForDelegateTask({
					userModel: "minimax/MiniMax-M2.7",
					availableModels: new Set(["openai/gpt-5.4"]),
				})
				expect(result).toEqual({ model: "minimax/MiniMax-M2.7" })
			})
		})
	})

	// ─────────────────────────────────────────────────────────────
	// Step 2: Cold cache — availableModels is empty
	// ─────────────────────────────────────────────────────────────

	describe("#given availableModels is empty (cold cache)", () => {
		describe("#when userModel is also not set", () => {
			test("#then returns skipped sentinel", () => {
				const result = resolveModelForDelegateTask({
					availableModels: new Set(),
				})
				expect(result).toEqual({ skipped: true })
			})
		})

		describe("#when userModel is set but we want to verify cold cache skip doesn't override user choice", () => {
			test("#then userModel still wins (step 1 takes priority over cold-cache skip)", () => {
				const result = resolveModelForDelegateTask({
					userModel: "minimax/MiniMax-M2.7",
					availableModels: new Set(),
				})
				// userModel is checked first, so it's returned even with empty availableModels
				expect(result).toEqual({ model: "minimax/MiniMax-M2.7" })
			})
		})

		describe("#when no userModel but systemDefaultModel is set (cold cache, no TUI override)", () => {
			test("#then cold cache skip fires (systemDefaultModel NOT used as userModel here — callers handle this)", () => {
				// NOTE: The callers (resolveSubagentModel, resolveCategoryExecution) now pass
				// systemDefaultModel as userModel instead of systemDefaultModel. This test
				// documents the raw function behavior: when userModel is absent and cache is
				// cold, step 2 returns {skipped: true} before step 3 is reached.
				const result = resolveModelForDelegateTask({
					availableModels: new Set(),
					systemDefaultModel: "minimax/MiniMax-M2.7",
				})
				expect(result).toEqual({ skipped: true })
			})
		})
	})

	// ─────────────────────────────────────────────────────────────
	// Step 3: systemDefaultModel — used when no userModel and cache is warm
	// ─────────────────────────────────────────────────────────────

	describe("#given availableModels is warm (has entries) and no userModel", () => {
		describe("#when systemDefaultModel is set", () => {
			test("#then returns systemDefaultModel", () => {
				const result = resolveModelForDelegateTask({
					availableModels: new Set(["minimax/MiniMax-M2.7", "openai/gpt-5.4"]),
					systemDefaultModel: "minimax/MiniMax-M2.7",
				})
				expect(result).toEqual({ model: "minimax/MiniMax-M2.7" })
			})
		})

		describe("#when systemDefaultModel has variant", () => {
			test("#then returns systemDefaultModel as normalized string (variant not extracted from systemDefaultModel)", () => {
				const result = resolveModelForDelegateTask({
					availableModels: new Set(["openai/gpt-5.4"]),
					systemDefaultModel: "openai/gpt-5.4 high",
				})
				// systemDefaultModel is returned as a normalized string; variant parsing only applies to userModel
				expect(result).toEqual({ model: "openai/gpt-5.4 high" })
			})
		})

		describe("#when systemDefaultModel is set but not in availableModels", () => {
			test("#then returns systemDefaultModel as-is", () => {
				const result = resolveModelForDelegateTask({
					availableModels: new Set(["openai/gpt-5.4"]),
					systemDefaultModel: "minimax/MiniMax-M2.7",
				})
				// systemDefaultModel is returned even if not in availableModels
				expect(result).toEqual({ model: "minimax/MiniMax-M2.7" })
			})
		})

		describe("#when no systemDefaultModel either", () => {
			test("#then returns undefined", () => {
				const result = resolveModelForDelegateTask({
					availableModels: new Set(["openai/gpt-5.4"]),
				})
				expect(result).toBeUndefined()
			})
		})
	})

	// ─────────────────────────────────────────────────────────────
	// Priority: userModel > cold cache skip > systemDefaultModel > undefined
	// ─────────────────────────────────────────────────────────────

	describe("#priority ordering", () => {
		test("#userModel wins over systemDefaultModel", () => {
			const result = resolveModelForDelegateTask({
				userModel: "minimax/MiniMax-M2.7",
				availableModels: new Set(["minimax/MiniMax-M2.7"]),
				systemDefaultModel: "openai/gpt-5.4",
			})
			expect(result).toEqual({ model: "minimax/MiniMax-M2.7" })
		})

		test("#cold cache skip takes priority over systemDefaultModel", () => {
			const result = resolveModelForDelegateTask({
				availableModels: new Set(),
				systemDefaultModel: "minimax/MiniMax-M2.7",
			})
			expect(result).toEqual({ skipped: true })
		})

		test("#systemDefaultModel is used when cache warm and no userModel", () => {
			const result = resolveModelForDelegateTask({
				availableModels: new Set(["anthropic/claude-opus-5"]),
				systemDefaultModel: "anthropic/claude-opus-5",
			})
			expect(result).toEqual({ model: "anthropic/claude-opus-5" })
		})

		test("#all empty returns undefined", () => {
			const result = resolveModelForDelegateTask({
				availableModels: new Set(["openai/gpt-5.4"]),
			})
			expect(result).toBeUndefined()
		})
	})
})
