import type { OhMyOpenCodeConfig, HookName } from "../../config"
import type { BackgroundManager } from "../../features/background-agent"
import type { ModelFallbackControllerAccessor } from "../../hooks/model-fallback"
import type { ModelCacheState } from "../../plugin-state"
import type { PluginContext } from "../types"

import {
  createSessionNotification,
  createThinkModeHook,
  createAnthropicContextWindowLimitRecoveryHook,
  createAutoUpdateCheckerHook,
  createCodegraphBootstrapHook,
  createAstGrepSgProvisionHook,
  createAgentUsageReminderHook,
  createNonInteractiveEnvHook,
  createInteractiveBashSessionHook,
  createInteractiveMenuSessionHook,
  createEditErrorRecoveryHook,
  createDelegateTaskRetryHook,
  createTaskResumeInfoHook,
  createStartWorkHook,
  createPrometheusMdOnlyHook,
  createSisyphusJuniorNotepadHook,

  createHephaestusAgentsMdInjectorHook,
  createQuestionLabelTruncatorHook,
  createPreemptiveCompactionHook,
  createRuntimeFallbackHook,
  createLegacyPluginToastHook,
  createOpenSpecSessionHook,
  createOpenSpecController,
} from "../../hooks"
import { createGoalHook } from "../../hooks/goal"
import {
  detectExternalNotificationPlugin,
  getNotificationConflictWarning,
  log,
} from "../../shared"
import { safeCreateHook } from "../../shared/safe-create-hook"
import { sessionExists } from "../../tools"
import { isTmuxIntegrationEnabled } from "../../create-runtime-tmux-config"

export type SessionHooks = {
  preemptiveCompaction: ReturnType<typeof createPreemptiveCompactionHook> | null
  sessionNotification: ReturnType<typeof createSessionNotification> | null
  thinkMode: ReturnType<typeof createThinkModeHook> | null
  anthropicContextWindowLimitRecovery: ReturnType<typeof createAnthropicContextWindowLimitRecoveryHook> | null
  autoUpdateChecker: ReturnType<typeof createAutoUpdateCheckerHook> | null
  codegraphBootstrap: ReturnType<typeof createCodegraphBootstrapHook> | null
  astGrepSgProvision: ReturnType<typeof createAstGrepSgProvisionHook> | null
  agentUsageReminder: ReturnType<typeof createAgentUsageReminderHook> | null
  nonInteractiveEnv: ReturnType<typeof createNonInteractiveEnvHook> | null
  interactiveBashSession: ReturnType<typeof createInteractiveBashSessionHook> | null
  interactiveMenuSession: ReturnType<typeof createInteractiveMenuSessionHook> | null
  goal: ReturnType<typeof createGoalHook> | null
  editErrorRecovery: ReturnType<typeof createEditErrorRecoveryHook> | null
  delegateTaskRetry: ReturnType<typeof createDelegateTaskRetryHook> | null
  startWork: ReturnType<typeof createStartWorkHook> | null
  prometheusMdOnly: ReturnType<typeof createPrometheusMdOnlyHook> | null
  sisyphusJuniorNotepad: ReturnType<typeof createSisyphusJuniorNotepadHook> | null

  hephaestusAgentsMdInjector: ReturnType<typeof createHephaestusAgentsMdInjectorHook> | null
  questionLabelTruncator: ReturnType<typeof createQuestionLabelTruncatorHook> | null
  taskResumeInfo: ReturnType<typeof createTaskResumeInfoHook> | null
  runtimeFallback: ReturnType<typeof createRuntimeFallbackHook> | null
  legacyPluginToast: ReturnType<typeof createLegacyPluginToastHook> | null
  openspecSession: ReturnType<typeof createOpenSpecSessionHook> | null
}

export function createSessionHooks(args: {
  ctx: PluginContext
  pluginConfig: OhMyOpenCodeConfig
  modelCacheState: ModelCacheState
  backgroundManager: BackgroundManager
  modelFallbackControllerAccessor?: ModelFallbackControllerAccessor
  isHookEnabled: (hookName: HookName) => boolean
  safeHookEnabled: boolean
}): SessionHooks {
  const { ctx, pluginConfig, modelCacheState, backgroundManager, modelFallbackControllerAccessor, isHookEnabled, safeHookEnabled } = args
  const safeHook = <T>(hookName: HookName, factory: () => T): T | null =>
    safeCreateHook(hookName, factory, { enabled: safeHookEnabled })

  const preemptiveCompaction =
    isHookEnabled("preemptive-compaction") &&
    pluginConfig.experimental?.preemptive_compaction
      ? safeHook("preemptive-compaction", () =>
          createPreemptiveCompactionHook(ctx, pluginConfig, modelCacheState))
      : null

  let sessionNotification: ReturnType<typeof createSessionNotification> | null = null
  if (isHookEnabled("session-notification")) {
    const forceEnable = pluginConfig.notification?.force_enable ?? false
    const externalNotifier = detectExternalNotificationPlugin(ctx.directory)
    if (externalNotifier.detected && externalNotifier.pluginName && !forceEnable) {
      log(getNotificationConflictWarning(externalNotifier.pluginName))
    } else {
      sessionNotification = safeHook("session-notification", () => createSessionNotification(ctx))
    }
  }

  const thinkMode = isHookEnabled("think-mode")
    ? safeHook("think-mode", () => createThinkModeHook())
    : null

  const anthropicContextWindowLimitRecovery = isHookEnabled("anthropic-context-window-limit-recovery")
    ? safeHook("anthropic-context-window-limit-recovery", () =>
        createAnthropicContextWindowLimitRecoveryHook(ctx, { experimental: pluginConfig.experimental, pluginConfig }))
    : null

  const autoUpdateChecker = isHookEnabled("auto-update-checker")
    ? safeHook("auto-update-checker", () =>
        createAutoUpdateCheckerHook(ctx, {
          showStartupToast: isHookEnabled("startup-toast"),
          isSisyphusEnabled: pluginConfig.sisyphus_agent?.disabled !== true,
          autoUpdate: pluginConfig.auto_update ?? true,
          modelCapabilities: pluginConfig.model_capabilities,
        }))
    : null

  const codegraphBootstrap = isHookEnabled("codegraph-bootstrap")
    ? safeHook("codegraph-bootstrap", () => createCodegraphBootstrapHook(ctx, pluginConfig.codegraph))
    : null

  const astGrepSgProvision = isHookEnabled("ast-grep-sg-provision")
    ? safeHook("ast-grep-sg-provision", () => createAstGrepSgProvisionHook())
    : null

  const agentUsageReminder = isHookEnabled("agent-usage-reminder")
    ? safeHook("agent-usage-reminder", () => createAgentUsageReminderHook(ctx))
    : null

  const nonInteractiveEnv = isHookEnabled("non-interactive-env")
    ? safeHook("non-interactive-env", () => createNonInteractiveEnvHook(ctx))
    : null

  const interactiveBashSession =
    isHookEnabled("interactive-bash-session") &&
    isTmuxIntegrationEnabled(pluginConfig)
    ? safeHook("interactive-bash-session", () => createInteractiveBashSessionHook(ctx))
    : null

  const interactiveMenuSession =
    isHookEnabled("interactive-menu-session") &&
    isTmuxIntegrationEnabled(pluginConfig)
    ? safeHook("interactive-menu-session", () => createInteractiveMenuSessionHook(ctx))
    : null

  const goal = isHookEnabled("goal") && pluginConfig.goal?.enabled
    ? safeHook("goal", () =>
        createGoalHook(ctx, {
          projectDir: ctx.directory,
          autoStart: pluginConfig.goal?.auto_start ?? false,
          ultrawork: pluginConfig.default_mode?.ultrawork ?? false,
          getSessionExists: async (sessionId) => await sessionExists(sessionId),
        }))
    : null

  const editErrorRecovery = isHookEnabled("edit-error-recovery")
    ? safeHook("edit-error-recovery", () => createEditErrorRecoveryHook(ctx))
    : null

  const delegateTaskRetry = isHookEnabled("delegate-task-retry")
    ? safeHook("delegate-task-retry", () => createDelegateTaskRetryHook(ctx))
    : null

  const startWork = isHookEnabled("start-work")
    ? safeHook("start-work", () => createStartWorkHook(ctx))
    : null

  const prometheusMdOnly = isHookEnabled("prometheus-md-only")
    ? safeHook("prometheus-md-only", () => createPrometheusMdOnlyHook(ctx))
    : null

  const sisyphusJuniorNotepad = isHookEnabled("sisyphus-junior-notepad")
    ? safeHook("sisyphus-junior-notepad", () => createSisyphusJuniorNotepadHook(ctx))
    : null

  const hephaestusAgentsMdInjector = isHookEnabled("hephaestus-agents-md-injector")
    ? safeHook("hephaestus-agents-md-injector", () =>
      createHephaestusAgentsMdInjectorHook(ctx, modelCacheState))
    : null

  const questionLabelTruncator = isHookEnabled("question-label-truncator")
    ? safeHook("question-label-truncator", () => createQuestionLabelTruncatorHook())
    : null
  const taskResumeInfo = isHookEnabled("task-resume-info")
    ? safeHook("task-resume-info", () => createTaskResumeInfoHook())
    : null

  const runtimeFallbackConfig =
    typeof pluginConfig.runtime_fallback === "boolean"
      ? { enabled: pluginConfig.runtime_fallback }
      : pluginConfig.runtime_fallback

  const runtimeFallback = isHookEnabled("runtime-fallback")
    ? safeHook("runtime-fallback", () =>
        createRuntimeFallbackHook(ctx, {
          config: runtimeFallbackConfig,
          pluginConfig,
        }))
    : null

  const legacyPluginToast = isHookEnabled("legacy-plugin-toast")
    ? safeHook("legacy-plugin-toast", () => createLegacyPluginToastHook(ctx))
    : null

  const openspecSession =
    isHookEnabled("openspec-session") && pluginConfig.openspec?.enabled
      ? safeHook("openspec-session", () => {
          const controller = createOpenSpecController({
            projectDir: ctx.directory,
            specDir: pluginConfig.openspec?.spec_dir,
          })
          return createOpenSpecSessionHook(ctx, {
            projectDir: ctx.directory,
            specDir: pluginConfig.openspec?.spec_dir,
            autoInject: pluginConfig.openspec?.auto_inject ?? true,
            autoCreate: pluginConfig.openspec?.auto_create ?? false,
            shortenInterview: pluginConfig.openspec?.shorten_interview ?? false,
            taskWriteBack: pluginConfig.openspec?.task_write_back ?? true,
            controller,
          })
        })
      : null

  return {
    preemptiveCompaction,
    sessionNotification,
    thinkMode,
    anthropicContextWindowLimitRecovery,
    autoUpdateChecker,
    codegraphBootstrap,
    astGrepSgProvision,
    agentUsageReminder,
    nonInteractiveEnv,
    interactiveBashSession,
    interactiveMenuSession,
    goal,
    editErrorRecovery,
    delegateTaskRetry,
    startWork,
    prometheusMdOnly,
    sisyphusJuniorNotepad,
    hephaestusAgentsMdInjector,
    questionLabelTruncator,
    taskResumeInfo,
    runtimeFallback,
    legacyPluginToast,
    openspecSession,
  }
}
