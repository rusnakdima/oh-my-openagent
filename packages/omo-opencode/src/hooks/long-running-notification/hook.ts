import type { PluginInput } from "@opencode-ai/plugin";
import { platform } from "node:os";
import { sendSessionNotification } from "../session-notification-send";
import type { NotificationConfig } from "../../config/schema";

type ToolCallID = string;

interface RunningTool {
  tool: string;
  startedAt: number;
  timer: ReturnType<typeof setTimeout>;
}

// Stub PluginInput for notifications that need client but have no full context
const stubPluginInput: PluginInput = { client: {} } as unknown as PluginInput;

export function createLongRunningNotificationHooks(
  config?: NotificationConfig,
) {
  const thresholdSeconds = config?.long_running_tool_seconds ?? 300;
  if (thresholdSeconds <= 0) return null;

  const thresholdMs = thresholdSeconds * 1000;
  const runningTools = new Map<ToolCallID, RunningTool>();

  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      _output: { args: Record<string, unknown> },
    ): Promise<void> => {
      const timer = setTimeout(async () => {
        const entry = runningTools.get(input.callID);
        if (entry) {
          runningTools.delete(input.callID);
          try {
            await sendSessionNotification(
              stubPluginInput,
              platform() as "darwin" | "linux" | "win32",
              `Long-running tool: ${input.tool}`,
              `Tool ${input.tool} has been running for over ${thresholdSeconds}s`,
            );
          } catch {
            // notification failure is non-fatal
          }
        }
      }, thresholdMs);

      runningTools.set(input.callID, {
        tool: input.tool,
        startedAt: Date.now(),
        timer,
      });
    },

    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      _output: {
        title: string;
        output: string;
        metadata: Record<string, unknown>;
      },
    ): Promise<void> => {
      const entry = runningTools.get(input.callID);
      if (entry) {
        clearTimeout(entry.timer);
        runningTools.delete(input.callID);
      }
    },
  };
}
