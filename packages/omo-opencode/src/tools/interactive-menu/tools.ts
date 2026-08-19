import { spawn } from "bun"
import { tool } from "@opencode-ai/plugin/tool"
import type { ToolDefinition } from "@opencode-ai/plugin"
import { DEFAULT_MENU_TIMEOUT_MS, INTERACTIVE_MENU_DESCRIPTION, POLL_INTERVAL_MS } from "./constants"
import { getCachedTmuxPath } from "../interactive-bash/tmux-path-resolver"

function extractInputFromPane(paneContent: string | null): string | null {
  if (!paneContent) return null
  // Look for the prompt line with user input after ">"
  const lines = paneContent.split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("> ")) {
      const input = trimmed.slice(2).trim()
      if (input.length > 0) return input
    }
  }
  return null
}

type MenuArgs = {
  prompt: string
  options?: string[]
  timeout_ms?: number
}

async function executeInteractiveMenu(args: MenuArgs): Promise<string> {
  const timeout = args.timeout_ms ?? DEFAULT_MENU_TIMEOUT_MS
  const tmux = getCachedTmuxPath()
  const escapedPrompt = args.prompt.replace(/'/g, "'\\''")

  // Build the display text
  let displayText = args.prompt
  if (args.options && args.options.length > 0) {
    displayText += "\n\n"
    for (let i = 0; i < args.options.length; i++) {
      displayText += `${i + 1}. ${args.options[i]}\n`
    }
  }
  const escapedDisplay = displayText.replace(/'/g, "'\\''")

  // Create a dedicated tmux session for this menu
  const sessionName = `omo-menu-${Date.now()}`
  const createCmd = `tmux new-session -d -s '${sessionName}' -x 80 -y 20 \\; set remain-on-exit on \\; send-keys 'echo ""; echo "${escapedDisplay}"; echo ""; echo "> " \\; display-message "MENU_ACTIVE" 2>/dev/null || true'`
  const createResult = await runCommand(createCmd, 5000)

  if (!createResult.success) {
    return JSON.stringify({ error: "Failed to create tmux session", details: createResult.output })
  }

  const killSession = async () => {
    try {
      await runCommand(`tmux kill-session -t '${sessionName}' 2>/dev/null || true`, 2000)
    } catch { /* best effort */ }
  }

  try {
    // Wait for the session to be ready
    await new Promise((r) => setTimeout(r, 300))

    // Poll for the MENU_ACTIVE marker
    let sessionReady = false
    for (let i = 0; i < 10; i++) {
      const checkResult = await runCommand(`tmux capture-pane -t '${sessionName}:0' -p 2>/dev/null || true`, 2000)
      if (checkResult.output.includes("MENU_ACTIVE") || checkResult.output.includes(args.prompt.slice(0, 20))) {
        sessionReady = true
        break
      }
      await new Promise((r) => setTimeout(r, 200))
    }

    if (!sessionReady) {
      return JSON.stringify({ error: "Menu session failed to initialize" })
    }

    // Poll for user input with timeout
    const deadline = Date.now() + timeout
    let attempts = 0
    const maxAttempts = Math.floor(timeout / POLL_INTERVAL_MS)

    while (Date.now() < deadline && attempts < maxAttempts) {
      const captureResult = await runCommand(
        `tmux capture-pane -t '${sessionName}:0' -p 2>/dev/null || true`,
        2000,
      )
      if (captureResult.success && captureResult.output) {
        const input = extractInputFromPane(captureResult.output)
        if (input !== null) {
          return JSON.stringify({ value: input })
        }
      }
      attempts++
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }

    // Timeout
    return JSON.stringify({ cancelled: true, reason: "timeout" })
  } finally {
    await killSession()
  }
}

async function runCommand(cmd: string, timeoutMs: number): Promise<{ success: boolean; output: string }> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("timeout")), timeoutMs)
  })
  try {
    const proc = spawn({ cmd: ["/bin/bash", "-c", cmd], stdout: "pipe", stderr: "pipe" })
    const exitCode = await Promise.race([proc.exited, timeoutPromise])
    const stdout = await new Response(proc.stdout).text()
    return { success: exitCode === 0, output: stdout.trim() }
  } catch {
    return { success: false, output: "" }
  }
}

export const interactive_menu: ToolDefinition = tool({
  description: INTERACTIVE_MENU_DESCRIPTION,
  args: {
    prompt: tool.schema.string().describe("The question/prompt to display to the user"),
    options: tool.schema.array(tool.schema.string()).optional().describe("Optional list of choices to display"),
    timeout_ms: tool.schema.number().optional().describe(`Timeout in milliseconds (default: ${DEFAULT_MENU_TIMEOUT_MS})`),
  },
  execute: executeInteractiveMenu,
})
