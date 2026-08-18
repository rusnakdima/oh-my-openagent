import { createTeamIdleWakeHint } from "../hooks/team-session-events/team-idle-wake-hint";
import { createTeamLeadOrphanHandler } from "../hooks/team-session-events/team-lead-orphan-handler";
import { createTeamLeadQuiescenceHandler } from "../hooks/team-session-events/team-lead-quiescence-handler";
import { createTeamMemberErrorHandler } from "../hooks/team-session-events/team-member-error-handler";
import { createTeamMemberStatusHandler } from "../hooks/team-session-events/team-member-status-handler";
import { buildTeamIdleWakeHintClient } from "./build-team-idle-wake-hint-client";
import type { OhMyOpenCodeConfig } from "../config";
import type { Managers } from "../create-managers";
import type { PluginEventContext } from "./event-types";

export function createEventTeamHandlers(args: {
  pluginConfig: OhMyOpenCodeConfig;
  pluginContext: PluginEventContext;
  managers: Managers;
}) {
  const disabledHooks = new Set(args.pluginConfig.disabled_hooks ?? [])
  const isHookEnabled = (name: string) => !disabledHooks.has(name)

  const teamModeConfig = args.pluginConfig.team_mode?.enabled ? args.pluginConfig.team_mode : undefined

  const teamIdleWakeHint = teamModeConfig && isHookEnabled("team-idle-wake-hint")
    ? createTeamIdleWakeHint({
        directory: args.pluginContext.directory,
        client: buildTeamIdleWakeHintClient(args.pluginContext.client),
      }, teamModeConfig)
    : undefined

  const teamLeadOrphanHandler = teamModeConfig && isHookEnabled("team-lead-orphan-handler")
    ? createTeamLeadOrphanHandler(teamModeConfig, args.managers.tmuxSessionManager, args.managers.backgroundManager)
    : undefined

  const teamMemberErrorHandler = teamModeConfig && isHookEnabled("team-member-error-handler")
    ? createTeamMemberErrorHandler(teamModeConfig, { client: args.pluginContext.client })
    : undefined

  const teamMemberStatusHandler = teamModeConfig && isHookEnabled("team-member-status-handler")
    ? createTeamMemberStatusHandler(teamModeConfig)
    : undefined

  const teamLeadQuiescenceHandler = teamModeConfig && isHookEnabled("team-lead-quiescence-handler")
    ? createTeamLeadQuiescenceHandler(teamModeConfig, {
        directory: args.pluginContext.directory,
        client: args.pluginContext.client,
      })
    : undefined

  return {
    teamIdleWakeHint,
    teamLeadOrphanHandler,
    teamMemberErrorHandler,
    teamMemberStatusHandler,
    teamLeadQuiescenceHandler,
  };
}
