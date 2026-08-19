import type { AgentOverrides } from "../../config/schema"
import { detectHeuristicModelFamily } from "@oh-my-opencode/model-core"
import { getAgentConfigKey } from "../../shared/agent-display-names"
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

  const availableModels = await getAvailableModelsForDelegateTask(executorCtx.client, executorCtx.availableModelsOverride)
  const hasExplicitOverride = agentOverride?.model || agentCategoryModel

  // GLOBAL-ONLY MODEL (Aug 2026): TUI model is the ONLY source.
  // When systemDefaultModel is set, it always wins — no fallback to builtin or discovered defaults.
  if (systemDefaultModel) {
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
      let normalized = normalizeModelFormat(systemDefaultModel)
      if (!normalized && systemDefaultModel) {
        const bareModel = systemDefaultModel
        const detected = detectHeuristicModelFamily(bareModel)
        if (detected) {
          normalized = {
            providerID: detected.provider ?? detected.family,
            modelID: bareModel,
          }
        }
      }
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

    return { categoryModel }
  }

  // No TUI model: ERROR — do not fall back to builtin or discovered defaults.
  // The agent must have a TUI model selected.
  log("[delegate-task] No TUI model selected for subagent delegation — model is required", {
    agent: agentToUse,
    hasExplicitOverride,
  })

  return { categoryModel: undefined }
}
