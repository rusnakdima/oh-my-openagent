/**
 * team-lead-quiescence-handler.ts
 *
 * Fires on `session.idle` for the team lead session.
 *
 * When the lead goes idle with no unread messages, it has no autonomous trigger
 * to review team state and decide what to do next — unlike members who wake
 * from incoming mailbox messages. This handler checks for full member quiescence
 * (all idle/completed) and dispatches a continuation prompt so the lead can
 * decide whether to wrap up or keep working.
 *
 * Fixes #4990 — "Team-mode lead can stall after full quiescence".
 */
import type { TeamModeConfig } from "../../config/schema/team-mode"
import type { Task } from "@oh-my-opencode/team-core/types"
import { findResolvedMemberSession } from "../../features/team-mode/member-session-resolution"
import {
  loadRuntimeState,
} from "../../features/team-mode/team-state-store/store"
import { listUnreadMessages } from "../../features/team-mode/team-mailbox/inbox"
import { listTasks } from "../../features/team-mode/team-tasklist/list"
import { resolveSessionEventID } from "../../shared/event-session-id"
import { log } from "../../shared/logger"
import { dispatchInternalPrompt } from "../../shared/prompt-async-gate"
import type { TeamIdleWakeHintNarrowClient } from "../../plugin/build-team-idle-wake-hint-client"

type HookInput = { event: { type: string; properties?: unknown } }
export type HookImpl = (input: HookInput) => Promise<void>

/**
 * Returns the session ID from a session.idle event's properties.
 */
function getSessionIDFromIdleEvent(properties: unknown): string | undefined {
  return resolveSessionEventID(properties)
}

/**
 * Returns true when all given members are in a quiescent state (idle, completed,
 * or shutdown_approved — i.e., no longer actively doing work).
 */
function areAllMembersQuiescent(
  members: { status: string }[],
): boolean {
  const QUIESCENT_STATUSES = new Set(["idle", "completed", "shutdown_approved"])
  return members.every((m) => QUIESCENT_STATUSES.has(m.status))
}

/**
 * Creates the team-lead-quiescence handler.
 *
 * Dispatches a continuation prompt to the lead when:
 * 1. The lead session idles with no unread messages (already checked by teamIdleWakeHint
 *    returning early — we only fire here when that path was taken)
 * 2. All team members are quiescent (idle / completed / shutdown_approved)
 *
 * The prompt asks the lead to review team_task_list and team_status to decide
 * whether work remains or the team run can be concluded.
 */
type PromptAsyncInput = {
  path: { id: string }
  body: {
    parts: Array<{ type: "text"; text: string }>
    agent?: string
    model?: { providerID: string; modelID: string }
    variant?: string
  }
  query: { directory: string }
}

type TeamLeadQuiescenceContext = {
  directory: string
  client: TeamIdleWakeHintNarrowClient
}

export function createTeamLeadQuiescenceHandler(
  teamModeConfig: TeamModeConfig,
  ctx: TeamLeadQuiescenceContext,
): HookImpl {
  return async (input: HookInput) => {
    if (input.event.type !== "session.idle") return

    const sessionID = getSessionIDFromIdleEvent(input.event.properties)
    if (sessionID === undefined) return

    const runtimeMember = await findResolvedMemberSession(
      sessionID,
      teamModeConfig,
      "team lead quiescence handler",
    )
    if (runtimeMember === null) return

    const runtimeState = await loadRuntimeState(
      runtimeMember.teamRunId,
      teamModeConfig,
    )

    // Only act when the lead session idles — not for regular member sessions.
    if (runtimeState.leadSessionId !== sessionID) return

    // If there are unread messages, teamIdleWakeHint already handled the wake.
    const unreadMessages = await listUnreadMessages(
      runtimeMember.teamRunId,
      runtimeMember.memberName,
      teamModeConfig,
    )
    if (unreadMessages.length > 0) return

    // Check member quiescence — if any member is still active, let them drive.
    if (!areAllMembersQuiescent(runtimeState.members)) {
      log("team lead quiescence: members still active, skipping", {
        event: "team-lead-quiescence-skip-active-members",
        teamRunId: runtimeMember.teamRunId,
        memberStatuses: runtimeState.members.map((m) => `${m.name}:${m.status}`),
      })
      return
    }

    // All members quiescent — check whether there is remaining work.
    let pendingTaskCount = 0
    let totalTaskCount = 0
    try {
      const tasks = await listTasks(runtimeMember.teamRunId, teamModeConfig)
      totalTaskCount = tasks.length
      pendingTaskCount = tasks.filter(
        (t: Task) => t.status === "pending" || t.status === "claimed",
      ).length
    } catch {
      // Task list unavailable — still prompt the lead to review state.
    }

    const continuationPrompt =
      pendingTaskCount > 0
        ? `All team members are now idle and no messages are pending delivery. ` +
          `${pendingTaskCount} of ${totalTaskCount} task(s) remain incomplete. ` +
          `Call team_task_list and team_status to review the current state, then ` +
          `decide the next steps — delegate remaining tasks, wait for members, ` +
          `or conclude the team run.`
        : `All team members are idle and the task list is clear. ` +
          `Call team_status to confirm the team run is complete, then use ` +
          `team_delete to shut down the team cleanly, or continue ` +
          `delegating new work if needed.`

    await dispatchInternalPrompt({
      mode: "async",
      queueBehavior: "defer",
      client: ctx.client,
      sessionID,
      source: "team-lead-quiescence-handler",
      input: {
        path: { id: sessionID },
        body: {
          parts: [{ type: "text" as const, text: continuationPrompt }],
        },
        query: { directory: ctx.directory },
      } as PromptAsyncInput,
    })

    log("team lead quiescence: dispatched continuation", {
      event: "team-lead-quiescence-continuation",
      teamRunId: runtimeMember.teamRunId,
      pendingTaskCount,
      totalTaskCount,
    })
  }
}
