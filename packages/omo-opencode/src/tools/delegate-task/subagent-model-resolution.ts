import type { AgentOverrides } from "../../config/schema"
import { getAgentConfigKey } from "../../shared/agent-display-names"
import { fuzzyMatchModel } from "../../shared/model-availability"
import { normalizeModelFormat } from "../../shared/model-format-normalizer"
import { log } from "../../shared/logger"
import { getAvailableModelsForDelegateTask } from "./available-models"
import { applyCategoryParams } from "./delegated-model-config"
import type { ExecutorContext } from "./executor-types"
import { resolveModelForDelegateTask } from "./model-selection"
import type { AgentInfo } from "./subagent-discovery"
import type { ResolvedSubagentModel } from "./subagent-resolution-types"

function findAgentOverride(agentOverrides: AgentOverrides | undefined, agentConfigKey: string) {
  return agentOverrides?.[agentConfigKey]
    ?? Object.entries(agentOverrides ?? {}).find(([key]) => key.toLowerCase() === agentConfigKey)?.[1]
}

export async function resolveSubagentModel(
  agentToUse: string,
  matchedAgent: AgentInfo,
  executorCtx: ExecutorContext,
  systemDefaultModel?: string,
): Promise<ResolvedSubagentModel> {
  let categoryModel = undefined

  const agentConfigKey = getAgentConfigKey(agentToUse)
  const agentOverride = findAgentOverride(executorCtx.agentOverrides, agentConfigKey)
  const agentCategoryConfig = agentOverride?.category
    ? executorCtx.userCategories?.[agentOverride.category]
    : undefined
  const agentCategoryModel = agentCategoryConfig?.model

  const availableModels = await getAvailableModelsForDelegateTask(executorCtx.client)
  const normalizedMatchedModel = matchedAgent.model
    ? normalizeModelFormat(matchedAgent.model)
    : undefined

  const hasExplicitOverride = agentOverride?.model || agentCategoryModel

  if (systemDefaultModel) {
    // TUI-selected model: wins at step 1 (userModel) in resolveModelForDelegateTask.
    // Never passed as matchedAgent.model here — that would override the TUI choice.
    const resolution = resolveModelForDelegateTask({
      userModel: systemDefaultModel,
      availableModels,
      systemDefaultModel: undefined,
    })

    const resolutionSkipped = resolution && "skipped" in resolution

    if (resolution && !resolutionSkipped) {
      const normalized = normalizeModelFormat(resolution.model)
      if (normalized) {
        const variantToUse = agentOverride?.variant ?? resolution.variant ?? agentCategoryConfig?.variant
        const resolvedModel = variantToUse ? { ...normalized, variant: variantToUse } : normalized
        categoryModel = applyCategoryParams(resolvedModel, agentCategoryConfig)
        log("[delegate-task] TUI model applied to subagent", {
          agent: agentToUse,
          model: resolution.model,
        })
      }
    } else if (resolutionSkipped) {
      // Cold cache: TUI model explicitly selected — apply it directly.
      const normalized = normalizeModelFormat(systemDefaultModel)
      if (normalized) {
        const variantToUse = agentOverride?.variant ?? agentCategoryConfig?.variant
        const resolvedModel = variantToUse ? { ...normalized, variant: variantToUse } : normalized
        categoryModel = applyCategoryParams(resolvedModel, agentCategoryConfig)
        log("[delegate-task] Cold cache: using TUI model for subagent", {
          agent: agentToUse,
          model: systemDefaultModel,
        })
      }
    }
  } else if (hasExplicitOverride || matchedAgent.model) {
    // No TUI model: use explicit override (agent config / category config) or matchedAgent default.
    // Note: matchedAgent.model is passed as userModel here so the fallback chain
    // can still apply when neither TUI model nor explicit override is set.
    const resolution = resolveModelForDelegateTask({
      userModel: agentOverride?.model ?? agentCategoryModel,
      availableModels,
      systemDefaultModel: undefined,
    })
  } else {
    // No TUI model and no explicit override: let the final fallback block use matchedAgent.model.
    // Pass userModel=undefined so resolveModelForDelegateTask returns {skipped: true}
    // (step 2 fires since availableModels is non-empty), reaching the !categoryModel block below.
    const resolution = resolveModelForDelegateTask({
      userModel: undefined,
      availableModels,
      systemDefaultModel: undefined,
    })

    const resolutionSkipped = resolution && "skipped" in resolution

    if (resolution && !resolutionSkipped) {
      const normalized = normalizeModelFormat(resolution.model)
      if (normalized) {
        const variantToUse = agentOverride?.variant ?? resolution.variant ?? agentCategoryConfig?.variant
        const resolvedModel = variantToUse ? { ...normalized, variant: variantToUse } : normalized
        categoryModel = applyCategoryParams(resolvedModel, agentCategoryConfig)
      }
    }
    // If resolutionSkipped or resolution is undefined, fall through to the final
    // !categoryModel && normalizedMatchedModel block below.
  }

  if (!categoryModel && normalizedMatchedModel) {
    const fullModel = `${normalizedMatchedModel.providerID}/${normalizedMatchedModel.modelID}`
    if (availableModels.size === 0 || fuzzyMatchModel(fullModel, availableModels, [normalizedMatchedModel.providerID])) {
      categoryModel = normalizedMatchedModel
    } else {
      log("[delegate-task] Skipping unavailable agent default model", {
        agent: agentToUse,
        model: fullModel,
      })
    }
  }

  return { categoryModel }
}
