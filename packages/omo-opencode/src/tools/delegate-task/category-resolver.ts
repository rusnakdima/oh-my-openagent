import type { ModelFallbackInfo } from "../../features/task-toast-manager/types"
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
  inheritedModel: string | undefined,
  systemDefaultModel: string | undefined
): Promise<CategoryResolutionResult> {
  const { client, userCategories, sisyphusJuniorModel } = executorCtx

  const categoryName = args.category!
  const enabledCategories = mergeCategories(userCategories)
  const categoryExists = enabledCategories[categoryName] !== undefined

  if (!categoryExists) {
    const allCategoryNames = Object.keys(enabledCategories).join(", ")
    return categoryResolutionError(`Unknown category: "${categoryName}". Available: ${allCategoryNames}`)
  }

  const availableModels = await getAvailableModelsForDelegateTask(client)

  const resolved = resolveCategoryConfig(categoryName, {
    userCategories,
    inheritedModel,
    systemDefaultModel,
    availableModels,
  })

  if (!resolved) {
    const requirement = CATEGORY_MODEL_REQUIREMENTS[categoryName]
    const requiredModel = requirement?.requiresModel ?? BUILTIN_CATEGORY_REQUIRES_MODEL[categoryName]
    const allCategoryNames = Object.keys(enabledCategories).join(", ")

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
    // Precedence: explicit category model > sisyphus-junior default > category resolved model
    // This keeps `sisyphus-junior.model` useful as a global default while allowing
    // per-category overrides via `categories[category].model`.
    actualModel = explicitCategoryModel ?? overrideModel ?? categoryResolvedModel
    if (actualModel) {
      modelInfo = explicitCategoryModel || overrideModel
        ? { model: actualModel, type: "user-defined", source: "override" }
        : { model: actualModel, type: "system-default", source: "system-default" }
      const parsedModel = parseModelString(actualModel)
      const variantToUse = userCategories?.[args.category!]?.variant ?? resolved.config.variant
      categoryModel = parsedModel
        ? applyCategoryParams({ ...parsedModel, variant: variantToUse ?? parsedModel.variant }, resolved.config)
        : undefined
    }
  } else {
    // TUI model (systemDefaultModel) wins at step 1 if set; otherwise use explicit category override.
    const userModelForResolution = systemDefaultModel ?? explicitCategoryModel ?? overrideModel
    const resolution = resolveModelForDelegateTask({
      userModel: userModelForResolution,
      availableModels,
      systemDefaultModel: systemDefaultModel ?? undefined,
    })

    if (resolution && "skipped" in resolution) {
      isModelResolutionSkipped = true
      // Prefer TUI model in cold cache; fall back to explicit override.
      const userModelOverride = systemDefaultModel ?? explicitCategoryModel ?? overrideModel
      if (userModelOverride) {
        actualModel = userModelOverride
        const parsedModel = parseModelString(userModelOverride)
        const variantToUse = userCategories?.[args.category!]?.variant ?? resolved.config.variant
        categoryModel = parsedModel
          ? applyCategoryParams({ ...parsedModel, variant: variantToUse ?? parsedModel.variant }, resolved.config)
          : undefined
        modelInfo = { model: userModelOverride, type: "user-defined", source: "override" }
      }
    } else if (resolution) {
      const { model: resolvedModel, variant: resolvedVariant } = resolution
      actualModel = resolvedModel

      if (!parseModelString(actualModel)) {
        return categoryResolutionError(`Invalid model format "${actualModel}". Expected "provider/model" format (e.g., "anthropic/claude-sonnet-4-6").`)
      }

      const type: "user-defined" | "inherited" | "category-default" | "system-default" =
        (explicitCategoryModel || overrideModel)
          ? "user-defined"
          : (systemDefaultModel && actualModel === systemDefaultModel)
              ? "system-default"
              : "category-default"

      const source: "override" | "category-default" | "system-default" =
        type === "user-defined"
          ? "override"
          : type === "system-default"
              ? "system-default"
              : "category-default"

      modelInfo = { model: actualModel, type, source }

      const parsedModel = parseModelString(actualModel)
      const variantToUse = userCategories?.[args.category!]?.variant ?? resolvedVariant ?? resolved.config.variant
      categoryModel = parsedModel
        ? applyCategoryParams({ ...parsedModel, variant: variantToUse ?? parsedModel.variant }, resolved.config)
        : undefined
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

  if (!categoryModel && !actualModel && !isModelResolutionSkipped) {
    const categoryNames = Object.keys(enabledCategories)
    return categoryResolutionError(`Model not configured for category "${args.category}".

Configure in one of:
1. OpenCode: Set "model" in opencode.json
2. Oh-My-OpenCode: Set category model in .omo/omo.jsonc
3. Provider: Connect a provider with available models

Current category: ${args.category}
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
