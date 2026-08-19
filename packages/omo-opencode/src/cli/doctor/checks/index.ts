import type { CheckDefinition, FixResult } from "../framework/types"
import { CHECK_IDS, CHECK_NAMES } from "../framework/constants"
import { checkSystem, gatherSystemInfo } from "./system"
import { checkConfig } from "./config"
import { checkDeprecatedReasoningKeys, fixDeprecatedReasoningKeys } from "./deprecated-reasoning-keys"
import { checkTools, gatherToolsSummary } from "./tools"
import { checkModels, fixModelCache } from "./model-resolution"
import { fixAstGrep, fixCommentChecker } from "./dependencies"
import { checkTelemetry } from "./telemetry"
import { checkTeamMode } from "./team-mode"
import { checkTuiPluginConfig } from "./tui-plugin-config"
import { checkCodex, gatherCodexSummary } from "./codex"
import { CODEX_COMPONENTS_CHECK_ID, CODEX_COMPONENTS_CHECK_NAME, checkCodexComponents } from "./codex-components"
import { checkCodexRuntimeWrapper } from "./codex-runtime-wrapper"

async function fixTools(): Promise<FixResult> {
  const fixers = [
    { key: "ast-grep", fn: fixAstGrep },
    { key: "comment-checker", fn: fixCommentChecker },
  ]
  const results = await Promise.allSettled(fixers.map((f) => f.fn()))
  const fixed: string[] = []
  const messages: string[] = []

  for (const [i, result] of results.entries()) {
    const key = fixers[i].key
    if (result.status === "fulfilled") {
      const r = result.value
      if (!r.success) {
        messages.push(`${key}: ${r.message}`)
      } else if (r.fixed) {
        fixed.push(...r.fixed)
      }
    } else {
      messages.push(`${key}: ${result.reason}`)
    }
  }

  if (fixed.length === 0) {
    return { success: false, message: messages.join("; ") || "Nothing to fix" }
  }
  return { success: true, message: `Fixed ${fixed.length} issue(s)`, fixed }
}

export type { CheckDefinition }
export * from "./model-resolution-types"
export { gatherSystemInfo, gatherToolsSummary }
export { gatherCodexSummary }

export function getAllCheckDefinitions(): CheckDefinition[] {
  return [
    {
      id: CHECK_IDS.SYSTEM,
      name: CHECK_NAMES[CHECK_IDS.SYSTEM],
      check: checkSystem,
      critical: true,
    },
    {
      id: CHECK_IDS.CONFIG,
      name: CHECK_NAMES[CHECK_IDS.CONFIG],
      check: checkConfig,
    },
    {
      id: CHECK_IDS.TUI_PLUGIN,
      name: CHECK_NAMES[CHECK_IDS.TUI_PLUGIN],
      check: checkTuiPluginConfig,
    },
    {
      id: "deprecated-reasoning-keys",
      name: "Deprecated Reasoning Keys",
      check: checkDeprecatedReasoningKeys,
      fix: fixDeprecatedReasoningKeys,
    },
    {
      id: CHECK_IDS.TOOLS,
      name: CHECK_NAMES[CHECK_IDS.TOOLS],
      check: checkTools,
      fix: fixTools,
    },
    {
      id: CHECK_IDS.MODELS,
      name: CHECK_NAMES[CHECK_IDS.MODELS],
      check: checkModels,
      fix: fixModelCache,
    },
    {
      id: CHECK_IDS.TELEMETRY,
      name: CHECK_NAMES[CHECK_IDS.TELEMETRY],
      check: checkTelemetry,
    },
    {
      id: CHECK_IDS.TEAM_MODE,
      name: CHECK_NAMES[CHECK_IDS.TEAM_MODE],
      check: checkTeamMode,
    },
  ]
}

export function getCodexCheckDefinitions(): CheckDefinition[] {
  return [
    {
      id: CHECK_IDS.CODEX,
      name: CHECK_NAMES[CHECK_IDS.CODEX],
      check: checkCodex,
      critical: true,
    },
    {
      id: CODEX_COMPONENTS_CHECK_ID,
      name: CODEX_COMPONENTS_CHECK_NAME,
      check: checkCodexComponents,
    },
    {
      id: "codex-runtime-wrapper",
      name: "codex-runtime-wrapper",
      check: checkCodexRuntimeWrapper,
    },
  ]
}
