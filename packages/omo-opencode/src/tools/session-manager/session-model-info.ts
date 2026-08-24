import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import { getModelResolutionInfoWithOverrides } from "../../cli/doctor/checks/model-resolution";
import { loadOmoConfig } from "../../cli/doctor/checks/model-resolution-config";

export const SESSION_MODEL_INFO_DESCRIPTION =
  "Shows the currently stored session model and what model each agent and category will use at runtime. " +
  "Use this to verify whether a TUI-selected model is active and correctly propagated to agents/categories. " +
  "No arguments required.";

function formatModel(
  model: { providerID: string; modelID: string } | null | undefined,
): string {
  if (!model) return "(not set)";
  return `${model.providerID}/${model.modelID}`;
}

export function createSessionModelInfoTool(): ToolDefinition {
  return tool({
    description: SESSION_MODEL_INFO_DESCRIPTION,
    args: {},
    execute: async () => {
      const { getMainSessionID } = await import(
        "../../features/claude-code-session-state/state"
      );
      const { getSessionModel } = await import(
        "../../shared/session-model-state"
      );
      const { getModelResolutionInfoWithOverrides } = await import(
        "../../cli/doctor/checks/model-resolution"
      );
      const { loadOmoConfig } = await import(
        "../../cli/doctor/checks/model-resolution-config"
      );

      const mainSessionID = getMainSessionID();
      const storedSessionModel = mainSessionID
        ? getSessionModel(mainSessionID)
        : undefined;

      const lines: string[] = [];
      lines.push("=== SESSION MODEL STATE ===");
      lines.push(`  mainSessionID : ${mainSessionID ?? "(not set)"}`);
      lines.push(`  storedModel   : ${formatModel(storedSessionModel)}`);
      lines.push("");

      const config = await loadOmoConfig();
      const staticInfo = getModelResolutionInfoWithOverrides(config, undefined);

      lines.push("=== PER-AGENT MODELS (static config, no TUI override) ===");
      for (const agent of staticInfo.agents) {
        lines.push(`  ${agent.name.padEnd(20)} → ${agent.effectiveModel}`);
      }
      lines.push("");

      lines.push(
        "=== PER-CATEGORY MODELS (static config, no TUI override) ===",
      );
      for (const category of staticInfo.categories) {
        lines.push(
          `  ${category.name.padEnd(20)} → ${category.effectiveModel}`,
        );
      }
      lines.push("");

      if (storedSessionModel) {
        const liveInfo = getModelResolutionInfoWithOverrides(
          config,
          storedSessionModel,
        );
        lines.push(
          "=== WITH TUI MODEL OVERRIDE (live session model applied to ALL) ===",
        );
        lines.push(`  TUI model: ${formatModel(storedSessionModel)}`);
        lines.push("");
        lines.push("  Agents:");
        for (const agent of liveInfo.agents) {
          const staticModel = staticInfo.agents.find((a) =>
            a.name === agent.name
          )?.effectiveModel ?? "(unknown)";
          const changed = staticModel !== agent.effectiveModel
            ? " ← OVERRIDE APPLIED"
            : "";
          lines.push(
            `    ${agent.name.padEnd(20)} → ${agent.effectiveModel}${changed}`,
          );
        }
        lines.push("");
        lines.push("  Categories:");
        for (const cat of liveInfo.categories) {
          const staticModel = staticInfo.categories.find((c) =>
            c.name === cat.name
          )?.effectiveModel ?? "(unknown)";
          const changed = staticModel !== cat.effectiveModel
            ? " ← OVERRIDE APPLIED"
            : "";
          lines.push(
            `    ${cat.name.padEnd(20)} → ${cat.effectiveModel}${changed}`,
          );
        }
      } else {
        lines.push("=== WITH TUI MODEL OVERRIDE ===");
        lines.push("  (no TUI model stored — no override will be applied)");
        lines.push("");
        lines.push(
          "  To store a TUI model: select a model in the TUI picker and send a message.",
        );
        lines.push("  Then run this tool again to see the override effect.");
      }

      lines.push("");
      lines.push("=== SUBAGENT MODEL (what task tool passes to subagents) ===");
      if (storedSessionModel) {
        const modelStr =
          `${storedSessionModel.providerID}/${storedSessionModel.modelID}`;
        lines.push(`  systemDefaultModel : ${modelStr}`);
        lines.push(
          "  → Passed to resolveSubagentExecution → resolveModelForDelegateTask",
        );
        lines.push("  → If model is in availableModels: used directly");
        lines.push(
          "  → If NOT in availableModels: delegate-core skips userModel and uses fallback",
        );
      } else {
        lines.push("  systemDefaultModel : (not set)");
        lines.push(
          "  → Subagents use category fallback model, NOT TUI-selected model!",
        );
      }

      return lines.join("\n");
    },
  });
}
