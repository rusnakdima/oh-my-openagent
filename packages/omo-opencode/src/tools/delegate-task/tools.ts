import { tool, type ToolDefinition } from "@opencode-ai/plugin";
import type {
  DelegatedModelConfig,
  DelegateTaskToolOptions,
  ToolContextWithMetadata,
} from "./types";
import { log } from "../../shared/logger";
import {
  getEffectiveModelForAgent,
  getSessionModel,
} from "../../shared/session-model-state";
import { getMainSessionID } from "../../features/claude-code-session-state";
import { buildSystemContent } from "./prompt-builder";
import {
  executeBackgroundContinuation,
  executeBackgroundTask,
  executeSyncContinuation,
  executeSyncTask,
  executeUnstableAgentTask,
  resolveCategoryExecution,
  resolveParentContext,
  resolveSkillContent,
  resolveSubagentExecution,
} from "./executor";
import { prepareDelegateTaskArgs } from "./tool-argument-preparation";
import { createDelegateTaskPresentation } from "./tool-description";
import type { AvailableSkill } from "../../agents/dynamic-agent-prompt-builder";
import {
  mergeNativeSkillInfos,
  type NativeSkillEntry,
} from "../skill/native-skills";
import type { SkillInfo } from "../skill/types";

async function loadNativeSkillEntries(
  nativeSkills: DelegateTaskToolOptions["nativeSkills"] | undefined,
): Promise<NativeSkillEntry[]> {
  if (!nativeSkills) return [];
  try {
    const list = await nativeSkills.all();
    return Array.isArray(list) ? list : [];
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log("[delegate-task] nativeSkills.all() failed; skipping native skills", {
      error: errorMessage,
    });
    return [];
  }
}

function buildPromptNativeSkillInfos(
  availableSkills: AvailableSkill[],
  nativeSkillEntries: NativeSkillEntry[],
  disabledSkills: ReadonlySet<string> | undefined,
): Array<{ name: string; description: string; location: string }> {
  if (nativeSkillEntries.length === 0) return [];
  const availableSkillInfos: SkillInfo[] = availableSkills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    location: undefined,
    scope: skill.location === "plugin" ? "builtin" : skill.location,
  }));
  const initialCount = availableSkillInfos.length;
  mergeNativeSkillInfos(
    availableSkillInfos,
    nativeSkillEntries,
    disabledSkills,
  );
  return availableSkillInfos.slice(initialCount).map((skill) => ({
    name: skill.name,
    description: skill.description,
    location: skill.location ?? "",
  }));
}

export { resolveCategoryConfig } from "./categories";
export type {
  BuildSystemContentInput,
  DelegateTaskToolOptions,
  SyncSessionCreatedEvent,
} from "./types";
export { buildSystemContent, buildTaskPrompt } from "./prompt-builder";

const delegateTaskArgsSchema = {
  load_skills: tool.schema
    .array(tool.schema.string())
    .optional()
    .describe(
      'Skill names to inject. Optional; defaults to [] when omitted. Pass an explicit array (e.g. ["git-master"]) for skill-specific tasks.',
    ),
  description: tool.schema.string().optional().describe(
    "Short task description (3-5 words). Auto-generated from prompt if omitted.",
  ),
  prompt: tool.schema.string().describe("Full detailed prompt for the agent"),
  run_in_background: tool.schema
    .boolean()
    .optional()
    .describe(
      "Optional; defaults to false (sync). true=async (returns background task ID `bg_...` for background_output), false=sync (waits). Use true ONLY for parallel exploration; otherwise omit or pass false for task delegation.",
    ),
  category: tool.schema.string().optional().describe(
    "REQUIRED if subagent_type not provided. Do NOT provide both category and subagent_type.",
  ),
  subagent_type: tool.schema.string().optional().describe(
    "REQUIRED if category not provided. Do NOT provide both category and subagent_type.",
  ),
  task_id: tool.schema
    .string()
    .optional()
    .describe(
      "Continuation session id (`ses_...`) from task metadata; not a background task id (`bg_...`).",
    ),
  command: tool.schema.string().optional().describe(
    "The command that triggered this task",
  ),
};

export function createDelegateTask(
  options: DelegateTaskToolOptions,
): ToolDefinition {
  const {
    availableCategories,
    availableSkills,
    categoryExamples,
    description,
  } = createDelegateTaskPresentation(options);

  return tool({
    description,
    args: delegateTaskArgsSchema,
    async execute(args, toolContext) {
      const ctx = toolContext as ToolContextWithMetadata;
      const delegateTaskArgs = await prepareDelegateTaskArgs(args, ctx);

      const runInBackground = delegateTaskArgs.run_in_background === true;

      const {
        content: skillContent,
        contents: skillContents,
        error: skillError,
      } = await resolveSkillContent(delegateTaskArgs.load_skills, {
        gitMasterConfig: options.gitMasterConfig,
        browserProvider: options.browserProvider,
        disabledSkills: options.disabledSkills,
        teamModeEnabled: options.teamModeEnabled,
        directory: options.directory,
        targetAgent: delegateTaskArgs.subagent_type,
        nativeSkills: options.nativeSkills,
        getLoadedSkills: options.getLoadedSkills,
      });
      if (skillError) {
        return skillError;
      }
      const nativeSkillEntries = await loadNativeSkillEntries(
        options.nativeSkills,
      );
      const nativeSkillInfos = buildPromptNativeSkillInfos(
        availableSkills,
        nativeSkillEntries,
        options.disabledSkills,
      );

      const continuationSystemContent = buildSystemContent({
        skillContent,
        skillContents,
        availableCategories,
        availableSkills,
        nativeSkillInfos,
      });

      const parentContext = await resolveParentContext(ctx, options.client);

      if (delegateTaskArgs.task_id) {
        if (runInBackground) {
          return executeBackgroundContinuation(
            delegateTaskArgs,
            ctx,
            options,
            parentContext,
            continuationSystemContent,
          );
        }
        return executeSyncContinuation(
          delegateTaskArgs,
          ctx,
          options,
          parentContext,
          undefined,
          continuationSystemContent,
        );
      }

      if (!delegateTaskArgs.category && !delegateTaskArgs.subagent_type) {
        return `Invalid arguments: Must provide either category or subagent_type.`;
      }

      // SESSION-INHERITED MODEL (Aug 2026): subagents inherit the model of the
      // session that spawned them — e.g. a task delegated by Atlas runs on
      // Atlas's currently selected model; one delegated by Prometheus uses
      // Prometheus's model. Falls back to the triggering message's model, then
      // to the global TUI pick.
      const resolveSpawnDefaultModel = (): {
        model: string | undefined;
        source: "parent-session" | "parent-message" | "global";
      } => {
        const inherited = getSessionModel(parentContext.sessionID);
        if (inherited) {
          return {
            model: `${inherited.providerID}/${inherited.modelID}`,
            source: "parent-session",
          };
        }
        const inline = parentContext.model;
        if (
          inline && typeof inline.providerID === "string" &&
          typeof inline.modelID === "string"
        ) {
          return {
            model: `${inline.providerID}/${inline.modelID}`,
            source: "parent-message",
          };
        }
        const targetKey = delegateTaskArgs.category ??
          delegateTaskArgs.subagent_type ?? "sisyphus-junior";
        try {
          const effective = getEffectiveModelForAgent(targetKey);
          return {
            model: effective
              ? `${effective.providerID}/${effective.modelID}`
              : undefined,
            source: "global",
          };
        } catch {
          return { model: undefined, source: "global" };
        }
      };

      log("[task] model resolution", {
        parentContextModel: parentContext.model,
        parentSessionModel: getSessionModel(parentContext.sessionID),
      });

      let agentToUse: string;
      let categoryModel: DelegatedModelConfig | undefined;
      let categoryPromptAppend: string | undefined;
      let modelInfo:
        | import("../../features/task-toast-manager/types").ModelFallbackInfo
        | undefined;
      let actualModel: string | undefined;
      let isUnstableAgent = false;
      let maxPromptTokens: number | undefined;
      let systemDefaultModel: string | undefined;

      if (delegateTaskArgs.category) {
        // Spawn-time model: parent session > parent message > global pick
        const spawn = resolveSpawnDefaultModel();
        systemDefaultModel = spawn.model;
        log("[task] category spawn model resolved", {
          category: delegateTaskArgs.category,
          model: systemDefaultModel,
          source: spawn.source,
        });
        const resolution = await resolveCategoryExecution(
          delegateTaskArgs,
          options,
          systemDefaultModel,
        );
        if (resolution.error) {
          return resolution.error;
        }
        agentToUse = resolution.agentToUse;
        categoryModel = resolution.categoryModel;
        categoryPromptAppend = resolution.categoryPromptAppend;
        modelInfo = resolution.modelInfo;
        actualModel = resolution.actualModel;
        isUnstableAgent = resolution.isUnstableAgent;
        maxPromptTokens = resolution.maxPromptTokens;

        const isRunInBackgroundExplicitlyFalse = isExplicitSyncRun(
          delegateTaskArgs.run_in_background,
        );

        log("[task] unstable agent detection", {
          category: delegateTaskArgs.category,
          actualModel,
          isUnstableAgent,
          run_in_background_value: delegateTaskArgs.run_in_background,
          run_in_background_type: typeof delegateTaskArgs.run_in_background,
          isRunInBackgroundExplicitlyFalse,
          willForceBackground: isUnstableAgent &&
            isRunInBackgroundExplicitlyFalse,
        });

        if (isUnstableAgent && isRunInBackgroundExplicitlyFalse) {
          const systemContent = buildSystemContent({
            skillContent,
            skillContents,
            categoryPromptAppend,
            agentName: agentToUse,
            maxPromptTokens,
            model: categoryModel,
            availableCategories,
            availableSkills,
            nativeSkillInfos,
          });
          return executeUnstableAgentTask(
            delegateTaskArgs,
            ctx,
            options,
            parentContext,
            agentToUse,
            categoryModel,
            systemContent,
            actualModel,
          );
        }
      } else {
        // Spawn-time model: parent session > parent message > global pick
        const spawn = resolveSpawnDefaultModel();
        systemDefaultModel = spawn.model;
        log("[task] subagent spawn model resolved", {
          subagent_type: delegateTaskArgs.subagent_type,
          model: systemDefaultModel,
          source: spawn.source,
        });
        const resolution = await resolveSubagentExecution(
          delegateTaskArgs,
          options,
          parentContext.agent,
          categoryExamples,
          { systemDefaultModel },
        );
        if (resolution.error) {
          return resolution.error;
        }
        agentToUse = resolution.agentToUse;
        categoryModel = resolution.categoryModel;
      }

      const systemContent = buildSystemContent({
        skillContent,
        skillContents,
        categoryPromptAppend,
        agentName: agentToUse,
        maxPromptTokens,
        model: categoryModel,
        availableCategories,
        availableSkills,
        nativeSkillInfos,
      });

      if (runInBackground) {
        return executeBackgroundTask(
          delegateTaskArgs,
          ctx,
          options,
          parentContext,
          agentToUse,
          categoryModel,
          systemContent,
        );
      }

      return executeSyncTask(
        delegateTaskArgs,
        ctx,
        options,
        parentContext,
        agentToUse,
        categoryModel,
        systemContent,
        modelInfo,
      );
    },
  });
}

function isExplicitSyncRun(runInBackground: unknown): boolean {
  return runInBackground === false || runInBackground === "false";
}
