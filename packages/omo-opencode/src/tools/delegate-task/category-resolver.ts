import type { ModelFallbackInfo } from "../../features/task-toast-manager/types"
import { detectHeuristicModelFamily } from "@oh-my-opencode/model-core"
import type { DelegateTaskArgs } from "./types"
import type { ExecutorContext } from "./executor-types"
import { mergeCategories } from "../../shared/merge-categories"
import { SISYPHUS_JUNIOR_AGENT } from "./sisyphus-junior-agent"
import { resolveCategoryConfig } from "./categories"
import { BUILTIN_CATEGORY_REQUIRES_MODEL, CATEGORY_PROMPT_APPEND_RESOLVERS } from "./constants"
import { parseModelString } from "../../shared/model-string-parser"
import { CATEGORY_MODEL_REQUIREMENTS } from "../../shared/model-requirements"
import { getAvailableModelsForDelegateTask } from "./available-models"
import { resolveModelForDelegateTask } from "./model-selection"
import type { DelegatedModelConfig } from "./types"
import { applyCategoryParams } from "./delegated-model-config"

function getConfiguredModel(entry: string | { model: string } | undefined): string | undefined {
  return typeof entry === "string" ? entry : entry?.model
}

function resolveCategoryPromptAppendForModel(
  categoryName: string,
  actualModel: string | undefined,
  staticPromptAppend: string,
  userPromptAppend: string | undefined,
): string | undefined {
  const dynamicResolver = CATEGORY_PROMPT_APPEND_RESOLVERS[categoryName]
  if (!dynamicResolver) {
    return staticPromptAppend || undefined
  }
  const dynamicBase = dynamicResolver(actualModel)
  if (!userPromptAppend) {
    return dynamicBase || undefined
  }
  return dynamicBase ? `${dynamicBase}\n\n${userPromptAppend}` : userPromptAppend
}

export interface CategoryResolutionResult {
  agentToUse: string
  categoryModel: DelegatedModelConfig | undefined
  categoryPromptAppend: string | undefined
  maxPromptTokens?: number
  modelInfo: ModelFallbackInfo | undefined
  actualModel: string | undefined
  isUnstableAgent: boolean
  error?: string
}

function categoryResolutionError(error: string): CategoryResolutionResult {
  return {
    agentToUse: "",
    categoryModel: undefined,
    categoryPromptAppend: undefined,
    maxPromptTokens: undefined,
    modelInfo: undefined,
    actualModel: undefined,
    isUnstableAgent: false,
    error,
  }
}

export async function resolveCategoryExecution(
  args: DelegateTaskArgs,
  executorCtx: ExecutorContext,
  systemDefaultModelOrInherited: string | undefined,
  systemDefaultModelMaybe?: string | undefined
): Promise<CategoryResolutionResult> {
  // Backward compat: old callers passed (args, ctx, inheritedModel, systemDefaultModel)
  // New callers pass (args, ctx, systemDefaultModel) — no inheritedModel.
  const systemDefaultModel = systemDefaultModelMaybe ?? systemDefaultModelOrInherited
  const { client, userCategories, sisyphusJuniorModel, availableModelsOverride } = executorCtx

  const categoryName = args.category!
  const enabledCategories = mergeCategories(userCategories)
  const categoryExists = enabledCategories[categoryName] !== undefined

  if (!categoryExists) {
    const allCategoryNames = Object.keys(enabledCategories).join(", ")
    return categoryResolutionError(`Unknown category: "${categoryName}". Available: ${allCategoryNames}`)
  }

  const availableModels = await getAvailableModelsForDelegateTask(client, availableModelsOverride)

  const resolved = resolveCategoryConfig(categoryName, {
    userCategories,
    systemDefaultModel,
    availableModels,
  })

  if (!resolved) {
    const requirement = CATEGORY_MODEL_REQUIREMENTS[categoryName]
    const requiredModel = requirement?.requiresModel ?? BUILTIN_CATEGORY_REQUIRES_MODEL[categoryName]
    const allCategoryNames = Object.keys(enabledCategories).join(", ")
    const configuredModels = userCategories?.[categoryName]?.models

    if (configuredModels && availableModels.size > 0) {
      const configuredChain = configuredModels.map((entry) => getConfiguredModel(entry)).join(" -> ")
      return categoryResolutionError(`Configured model chain is unavailable for category "${categoryName}": ${configuredChain}`)
    }

    if (categoryExists && requiredModel) {
      return categoryResolutionError(`Category "${categoryName}" requires model "${requiredModel}" which is not available.

To use this category:
1. Connect a provider with this model: ${requiredModel}
2. Or configure an alternative model in your .omo/omo.jsonc for this category

Available categories: ${allCategoryNames}`)
    }

    return categoryResolutionError(`Unknown category: "${categoryName}". Available: ${allCategoryNames}`)
  }

  const requirement = CATEGORY_MODEL_REQUIREMENTS[args.category!]
  const hasCanonicalModels = resolved.config.models !== undefined
  const canonicalPrimaryEntry = resolved.config.models?.[0]
  const configuredPrimaryModel = getConfiguredModel(canonicalPrimaryEntry)
  const categoryResolvedModel = hasCanonicalModels ? configuredPrimaryModel : resolved.model
  let actualModel: string | undefined
  let modelInfo: ModelFallbackInfo | undefined
  let categoryModel: DelegatedModelConfig | undefined
  let isModelResolutionSkipped = false

  const overrideModel = sisyphusJuniorModel
  const explicitCategoryModel = hasCanonicalModels
    ? configuredPrimaryModel
    : userCategories?.[args.category!]?.model

  if (!requirement) {
    // GLOBAL-ONLY MODEL (Aug 2026): TUI model is the ONLY source.
    // No implicit fallback to builtin category models.
    // Error if no TUI model selected.
    if (!systemDefaultModel) {
      // No TUI model selected — error, do not fall back to builtin or configured defaults
      const categoryNames = Object.keys(enabledCategories)
      return categoryResolutionError(`No model selected in TUI for category "${args.category}".

Select a model in the TUI model picker first, then retry.
Available categories: ${categoryNames.join(", ")}`)
    }
    // TUI model is set — use it directly for unknown categories too
    let parsedModel = parseModelString(systemDefaultModel)
    if (!parsedModel) {
      const detected = detectHeuristicModelFamily(systemDefaultModel)
      if (detected) {
        parsedModel = {
          providerID: detected.provider ?? detected.family,
          modelID: systemDefaultModel,
        }
      }
    }
    if (parsedModel) {
      actualModel = systemDefaultModel
      const variantToUse = userCategories?.[args.category!]?.variant ?? resolved.config.variant
      categoryModel = applyCategoryParams({ ...parsedModel, variant: variantToUse ?? parsedModel.variant }, resolved.config)
      modelInfo = { model: systemDefaultModel, type: "system-default", source: "system-default" }
    }
  } else {
    // GLOBAL-ONLY MODEL (Aug 2026): TUI model is the ONLY source.
    // No fallback to overrideModel (sisyphusJuniorModel) or builtin category defaults.
    if (systemDefaultModel) {
      // TUI model is set: use it directly, bypass delegate-core cold-cache behavior.
      const resolution = resolveModelForDelegateTask({
        userModel: systemDefaultModel,
        availableModels,
        systemDefaultModel: undefined,
      })

      if (resolution && "skipped" in resolution) {
        isModelResolutionSkipped = true
        // Cold cache: apply TUI model directly without delegate-core.
        let parsedModel = parseModelString(systemDefaultModel)
        if (!parsedModel) {
          const detected = detectHeuristicModelFamily(systemDefaultModel)
          if (detected) {
            parsedModel = {
              providerID: detected.provider ?? detected.family,
              modelID: systemDefaultModel,
            }
          }
        }
        if (parsedModel) {
          const variantToUse = userCategories?.[args.category!]?.variant ?? resolved.config.variant
          categoryModel = applyCategoryParams({ ...parsedModel, variant: variantToUse ?? parsedModel.variant }, resolved.config)
          actualModel = systemDefaultModel
          modelInfo = { model: systemDefaultModel, type: "system-default", source: "system-default" }
        }
      } else if (resolution) {
        const { model: resolvedModel, variant: resolvedVariant } = resolution
        actualModel = resolvedModel

        if (!parseModelString(actualModel)) {
          return categoryResolutionError(`Invalid model format "${actualModel}". Expected "provider/model" format (e.g., "anthropic/claude-sonnet-4-6").`)
        }

        modelInfo = { model: actualModel, type: "system-default", source: "system-default" }

        const parsedModel = parseModelString(actualModel)
        const variantToUse = userCategories?.[args.category!]?.variant ?? resolvedVariant ?? resolved.config.variant
        categoryModel = parsedModel
          ? applyCategoryParams({ ...parsedModel, variant: variantToUse ?? parsedModel.variant }, resolved.config)
          : undefined
      }
    } else {
      // No TUI model: ERROR — do not fall back to builtin or configured defaults.
      isModelResolutionSkipped = true
      const categoryNames = Object.keys(enabledCategories)
      return categoryResolutionError(`No model selected in TUI for category "${args.category}".

Select a model in the TUI model picker first, then retry.
Available categories: ${categoryNames.join(", ")}`)
    }
  }

  if (!categoryModel && actualModel) {
    const parsedModel = parseModelString(actualModel)
    categoryModel = parsedModel ?? undefined
  }
  const categoryPromptAppend = resolveCategoryPromptAppendForModel(
    args.category!,
    actualModel,
    resolved.promptAppend,
    userCategories?.[args.category!]?.prompt_append,
  )

  if (!categoryModel && !actualModel) {
    // This should not be reached — when systemDefaultModel is set, we always produce a model.
    // This is a last-resort guard in case something slips through.
    const categoryNames = Object.keys(enabledCategories)
    return categoryResolutionError(`No model available for category "${args.category}". Select a model in the TUI picker first.
Available categories: ${categoryNames.join(", ")}`)
  }

  const resolvedModel = actualModel?.toLowerCase()
  const isUnstableAgent = resolved.config.is_unstable_agent ?? (resolvedModel ? resolvedModel.includes("gemini") || resolvedModel.includes("minimax") : false)

  return {
    agentToUse: SISYPHUS_JUNIOR_AGENT,
    categoryModel,
    categoryPromptAppend,
    maxPromptTokens: resolved.config.max_prompt_tokens,
    modelInfo,
    actualModel,
    isUnstableAgent,
  }
}
