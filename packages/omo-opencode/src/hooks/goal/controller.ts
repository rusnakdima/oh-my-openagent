import { join } from "node:path";
import { createTuiMirror } from "../../features/ulw-loop/tui-mirror";
import { clearGoal, createGoal, readGoal, updateGoal } from "./store";
import type { Goal, TokenUsageSnapshot } from "./types";
import { validateObjective } from "./validation";

export type GoalControllerOptions = {
  readonly projectDir: string;
};

export type GoalController = ReturnType<typeof createGoalController>;

export function createGoalController(options: GoalControllerOptions) {
  const { projectDir } = options;
  const baseDir = join(projectDir, ".omo", "goal");

  const storeRef = (sessionID: string) => ({ baseDir, sessionID });

  const tuiMirror = createTuiMirror({ projectDir });

  return {
    setGoal(sessionID: string, rawObjective: string): Goal {
      const objective = validateObjective(rawObjective);
      const ref = storeRef(sessionID);
      clearGoal(ref);
      const goal = createGoal(ref, objective);
      tuiMirror.writeTuiMirror(sessionID, goal);
      return goal;
    },

    getGoal(sessionID: string): Goal | null {
      return readGoal(storeRef(sessionID));
    },

    pauseGoal(sessionID: string): Goal | null {
      const goal = updateGoal(storeRef(sessionID), { status: "paused" });
      if (goal !== null) tuiMirror.writeTuiMirror(sessionID, goal);
      return goal;
    },

    resumeGoal(sessionID: string): Goal | null {
      const goal = updateGoal(storeRef(sessionID), { status: "active" });
      if (goal !== null) tuiMirror.writeTuiMirror(sessionID, goal);
      return goal;
    },

    clearGoal(sessionID: string): boolean {
      const ref = storeRef(sessionID);
      const existed = readGoal(ref) !== null;
      clearGoal(ref);
      tuiMirror.writeTuiMirror(sessionID, null);
      return existed;
    },

    markComplete(sessionID: string): Goal | null {
      const goal = updateGoal(storeRef(sessionID), { status: "complete" });
      if (goal !== null) tuiMirror.writeTuiMirror(sessionID, goal);
      return goal;
    },

    accountUsage(
      sessionID: string,
      usage: TokenUsageSnapshot,
      elapsedSeconds: number,
    ): Goal | null {
      const ref = storeRef(sessionID);
      const goal = readGoal(ref);
      if (goal === null || goal.status !== "active") {
        return goal;
      }
      const tokenDelta = Math.max(0, usage.input) + Math.max(0, usage.output);
      const updated = updateGoal(ref, {
        tokensUsed: goal.tokensUsed + tokenDelta,
        timeUsedSeconds: goal.timeUsedSeconds + Math.max(0, elapsedSeconds),
      });
      if (updated !== null) tuiMirror.writeTuiMirror(sessionID, updated);
      return updated;
    },

    updateTui(sessionID: string): void {
      tuiMirror.writeTuiMirror(sessionID, readGoal(storeRef(sessionID)));
    },
  };
}
