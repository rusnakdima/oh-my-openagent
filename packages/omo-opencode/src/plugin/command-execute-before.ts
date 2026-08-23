import type { CreatedHooks } from "../create-hooks"
import { parseGoalCommand } from "../hooks/goal/command-arguments"
import { parseOpenSpecCommand } from "../hooks/openspec-session/command-arguments"
import { log } from "../shared/logger"
import { stopContinuation } from "./stop-continuation"

type CommandExecuteBeforeInput = {
  command: string
  sessionID: string
  arguments: string
}

type CommandExecuteBeforeOutput = {
  parts: Array<{ type: string; text?: string; [key: string]: unknown }>
}

const NATIVE_GOAL_COMMAND_MARKER = "<omo-native-goal-command>"

export function markNativeGoalCommand(
  parts: CommandExecuteBeforeOutput["parts"],
): void {
  parts.push({
    type: "text",
    text: NATIVE_GOAL_COMMAND_MARKER,
    synthetic: true,
  })
}

export function consumeNativeGoalCommandMarker(
  parts: CommandExecuteBeforeOutput["parts"],
): boolean {
  const markerIndex = parts.findIndex(
    (part) => (
      part.type === "text"
      && part.text === NATIVE_GOAL_COMMAND_MARKER
      && part["synthetic"] === true
    ),
  )
  if (markerIndex === -1) {
    return false
  }
  parts.splice(markerIndex, 1)
  return true
}

function hasPartsOutput(value: unknown): value is CommandExecuteBeforeOutput {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  const parts = record["parts"]
  return Array.isArray(parts)
}

export function createCommandExecuteBeforeHandler(args: {
  directory: string
  hooks: CreatedHooks
}): (
  input: CommandExecuteBeforeInput,
  output: CommandExecuteBeforeOutput,
) => Promise<void> {
  const { directory, hooks } = args

  return async (input, output): Promise<void> => {
    await hooks.autoSlashCommand?.["command.execute.before"]?.(input, output)

    const normalizedCommand = input.command.toLowerCase()
    const sessionID = input.sessionID
    if (normalizedCommand === "stop-continuation" && sessionID) {
      stopContinuation({ directory, hooks, sessionID })
    }

    if (hooks.goal && sessionID && normalizedCommand === "goal") {
      const parsed = parseGoalCommand(input.arguments)
      switch (parsed.kind) {
        case "setObjective":
          hooks.goal.setGoal(sessionID, parsed.objective)
          break
        case "setStatus":
          if (parsed.status === "paused") {
            hooks.goal.pauseGoal(sessionID)
          } else {
            hooks.goal.resumeGoal(sessionID)
          }
          break
        case "clear":
          hooks.goal.clearGoal(sessionID)
          break
        case "show":
          // No side effect.
          break
        default:
          break
      }
      markNativeGoalCommand(output.parts)
    }

    if (
      hooks.openspecSession &&
      sessionID &&
      normalizedCommand === "openspec" &&
      hasPartsOutput(output)
    ) {
      const parsed = parseOpenSpecCommand(input.arguments)
      switch (parsed.kind) {
        case "propose": {
          const result = await hooks.openspecSession.propose(parsed.specName, parsed.description)
          output.parts.push({ type: "text", text: result.message })
          break
        }
        case "verify": {
          const results = await hooks.openspecSession.verify(parsed.specName)
          for (const r of results) {
            const files = r.files
              .map((f) => `  ${f.name}: ${f.exists && f.nonEmpty ? "ok" : "MISSING"}`)
              .join("\n")
            const stats = r.taskStats
              ? `  Tasks: ${r.taskStats.open} open, ${r.taskStats.in_progress} in-progress, ${r.taskStats.blocked} blocked, ${r.taskStats.completed} done`
              : ""
            output.parts.push({
              type: "text",
              text: `Spec: ${r.specName} | Valid: ${r.valid}\n${files}\n${stats}`,
            })
          }
          break
        }
        case "apply": {
          const result = await hooks.openspecSession.apply(parsed.specName, sessionID)
          output.parts.push({ type: "text", text: result.message })
          break
        }
        case "archive": {
          const result = await hooks.openspecSession.archive(parsed.specName)
          output.parts.push({ type: "text", text: result.message })
          break
        }
        case "status": {
          const statuses = await hooks.openspecSession.status()
          for (const s of statuses) {
            const taskInfo = s.taskStats
              ? `open=${s.taskStats.open} in_progress=${s.taskStats.in_progress} blocked=${s.taskStats.blocked} done=${s.taskStats.completed}`
              : "no tasks"
            output.parts.push({ type: "text", text: `[${s.valid ? "ok" : "INVALID"}] ${s.specName} (${taskInfo})` })
          }
          break
        }
        case "list": {
          const specs = await hooks.openspecSession.list()
          output.parts.push({ type: "text", text: specs.length === 0 ? "No specs found." : `Specs:\n${specs.map((n) => `  - ${n}`).join("\n")}` })
          break
        }
        case "help":
        default: {
          output.parts.push({
            type: "text",
            text: "Available /openspec subcommands:\n  propose <name> [desc] — Create a new spec\n  verify <name> — Verify a spec\n  apply <name> — Mark pending tasks in-progress\n  archive <name> — Move to ARCHIVE/\n  status — Show all specs\n  list — List all specs",
          })
          break
        }
      }
    }

    if (
      hooks.startWork
      && normalizedCommand === "start-work"
      && hasPartsOutput(output)
    ) {
      await hooks.startWork["command.execute.before"]?.(input, output)
      if (hooks.stopContinuationGuard?.isStopped(sessionID)) {
        hooks.stopContinuationGuard.clear(sessionID)
        log("[stop-continuation] Stop state cleared by native command", {
          sessionID,
          command: normalizedCommand,
        })
      }
    }
  }
}
