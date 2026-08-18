import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

export type GoalStatus = "active" | "paused" | "complete"

export type TuiGoalSnapshot = {
  readonly id: string
  readonly title: string
  readonly status: "in_progress" | "complete"
  readonly successCriteria: readonly []
}

export type TuiLoopSnapshot = {
  readonly version: 1
  readonly activeGoalId: string | undefined
  readonly goals: readonly TuiGoalSnapshot[]
}

function goalStatusForTui(status: GoalStatus): "in_progress" | "complete" {
  return status === "complete" ? "complete" : "in_progress"
}

export type TuiMirrorOptions = {
  readonly projectDir: string
}

export type TuiMirror = ReturnType<typeof createTuiMirror>

export function createTuiMirror(options: TuiMirrorOptions) {
  const { projectDir } = options
  const baseDir = join(projectDir, ".omo", "ulw-loop")

  function tuiMirrorPath(sessionID: string): string {
    return join(baseDir, sessionID, "goals.json")
  }

  function writeTuiMirror(sessionID: string, goal: { id: string; objective: string; status: GoalStatus } | null): void {
    const path = tuiMirrorPath(sessionID)
    const snapshot: TuiLoopSnapshot = {
      version: 1,
      activeGoalId: goal?.id,
      goals: goal === null
        ? []
        : [{
            id: goal.id,
            title: goal.objective,
            status: goalStatusForTui(goal.status),
            successCriteria: [],
          }],
    }
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8")
  }

  return { writeTuiMirror, tuiMirrorPath }
}
