import type { PluginInput } from "@opencode-ai/plugin"
import { sendSessionNotification } from "../session-notification-send"
import type { GitMasterConfig } from "../../config/schema/git-master"
import { platform } from "node:os"

export function createGitPreCommitHook(config?: GitMasterConfig) {
  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown> },
    ): Promise<void> => {
      if (input.tool !== "bash") return
      const args = output.args
      if (!args.command || typeof args.command !== "string") return
      const cmd = args.command as string
      if (!cmd.includes("git commit")) return

      // git-env-prefix: if set, inject the env prefix into the command
      const prefix = config?.git_env_prefix
      if (prefix && typeof prefix === "string" && prefix.length > 0) {
        const gitEnvPrefix = prefix.endsWith("=") ? prefix : `${prefix}=1`
        // Prepend env prefix to the git command
        const modifiedCmd = cmd.replace(/^(\s*)/, `$1${gitEnvPrefix} `)
        output.args.command = modifiedCmd
      }
    },
  }
}

export function createGitPostCommitHook() {
  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      _output: { title: string; output: string; metadata: Record<string, unknown> },
    ): Promise<void> => {
      if (input.tool !== "bash") return
      // Extract commit hash from output
      const stdout = (_output.output || "").match(/\b[0-9a-f]{7,40}\b/i)
      const commitRef = stdout ? stdout[0].slice(0, 7) : ""

      const title = commitRef ? `Git commit: ${commitRef}` : "Git commit completed"
      const message = commitRef
        ? `Commit ${commitRef} created successfully`
        : "Git commit created successfully"

      try {
        await sendSessionNotification(
          { client: {} } as unknown as PluginInput,
          platform() as "darwin" | "linux" | "win32",
          title,
          message,
        )
      } catch {
        // non-fatal
      }
    },
  }
}
