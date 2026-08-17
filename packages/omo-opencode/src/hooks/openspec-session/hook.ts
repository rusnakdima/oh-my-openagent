/**
 * hook.ts — OpenSpec session hook.
 *
 * Implements:
 * - `chat.message`: auto-inject spec context when openspec.auto_inject is true
 * - `tool.execute.after`: write task completion markers back to tasks.md
 *   when openspec.task_write_back is true
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { log } from "../../shared"
import {
  resolveSpecRoot,
  resolveSpecFile,
  readSpecFile,
  listSpecs,
  parseTaskStats,
  markInProgressAsCompleted,
  writeSpecFile,
} from "../../tools/openspec/store"

const HOOK_NAME = "openspec-session"

export type OpenSpecHookOptions = {
  readonly projectDir: string
  readonly specDir?: string
  readonly autoInject?: boolean
  readonly shortenInterview?: boolean
  readonly taskWriteBack?: boolean
}

// Tracks sessions where auto-inject has already fired (prevent double injection)
const injectedSessions = new Set<string>()

/**
 * Injects a concise OpenSpec context block into the user message parts.
 *
 * Reads the root spec.md (or spec.md in the named spec subdirectory) and
 * injects its content as a text part into the output message.
 */
async function injectSpecContext(
  output: {
    parts: Array<{ type: string; text?: string; [key: string]: unknown }>
  },
  specName: string,
  specDir: string,
  projectDir: string,
  shortenInterview: boolean,
): Promise<void> {
  const specFile = resolveSpecFile(projectDir, specDir, specName, "spec.md")
  const planFile = resolveSpecFile(projectDir, specDir, specName, "plan.md")
  const tasksFile = resolveSpecFile(projectDir, specDir, specName, "tasks.md")

  const [specContent, planContent, tasksContent] = await Promise.all([
    readSpecFile(specFile),
    readSpecFile(planFile),
    readSpecFile(tasksFile),
  ])

  const parts: string[] = []

  if (specContent) {
    if (shortenInterview) {
      // Short form: just the title line and first heading
      const firstLine = specContent.split("\n")[0] ?? ""
      const firstHeading = specContent.match(/^## .+/m)?.[0] ?? ""
      parts.push(`**OpenSpec: ${firstLine.replace(/^#\s*/, "")}** — ${firstHeading.replace(/^##\s*/, "")}`)
    } else {
      parts.push(`## OpenSpec: ${specName}\n\n${specContent}`)
    }
  }

  if (planContent && !shortenInterview) {
    parts.push(`\n## Technical Plan\n\n${planContent}`)
  }

  if (tasksContent) {
    const stats = parseTaskStats(tasksContent)
    const taskLines = [`| Status | Description |`, `| ------ | ----------- |`]
    // Parse task rows from the tasks.md
    for (const line of tasksContent.split("\n")) {
      if (line.match(/^\|\s*\[[ x~!]\]\s\|/)) {
        taskLines.push(line)
      }
    }
    const taskBlock =
      stats.open === 0 && stats.in_progress === 0 && stats.blocked === 0
        ? `All tasks completed (${stats.completed} done).`
        : `${stats.open} pending, ${stats.in_progress} in-progress, ${stats.blocked} blocked, ${stats.completed} done.`
    parts.push(`\n**Tasks (${taskBlock})**\n${taskLines.slice(0, 6).join("\n")}${stats.open + stats.in_progress + stats.completed + stats.blocked > 5 ? "\n..." : ""}`)
  }

  if (parts.length === 0) return

  const injectedText = parts.join("\n")

  // Find the first real user text part and append the spec context
  const textPartIdx = output.parts.findIndex(
    (p) => p.type === "text" && typeof p.text === "string" && p.text.trim().length > 0,
  )
  if (textPartIdx !== -1) {
    const existing = output.parts[textPartIdx].text ?? ""
    output.parts[textPartIdx].text = `${existing}\n\n---\n\n${injectedText}`
  } else {
    // Fallback: prepend a text part
    output.parts.unshift({ type: "text", text: injectedText })
  }
}

export function createOpenSpecSessionHook(
  _ctx: PluginInput,
  options: OpenSpecHookOptions,
) {
  const {
    projectDir,
    specDir = "openspec",
    autoInject = true,
    shortenInterview = false,
    taskWriteBack = true,
  } = options

  return {
    "chat.message": async (
      input: { sessionID: string },
      output: {
        parts: Array<{ type: string; text?: string; [key: string]: unknown }>
      },
    ): Promise<void> => {
      if (!autoInject) return
      if (injectedSessions.has(input.sessionID)) return

      const specRoot = resolveSpecRoot(projectDir, specDir)
      const specs = await listSpecs(specRoot)
      if (specs.length === 0) return

      // Use the first spec found (or allow config to pick a default)
      const specName = specs[0]
      injectedSessions.add(input.sessionID)

      try {
        await injectSpecContext(output, specName, specDir, projectDir, shortenInterview)
        log(`[${HOOK_NAME}] Injected spec context for session ${input.sessionID}, spec: ${specName}`)
      } catch (err) {
        log(`[${HOOK_NAME}] Failed to inject spec context:`, err)
      }
    },

    "tool.execute.after": async (
      toolInput: { tool: string; sessionID: string; callID: string },
      toolOutput: { title: string; output: string },
    ): Promise<void> => {
      if (!taskWriteBack) return

      // Only react to task system completions or major task tool results
      const toolName = toolInput.tool.toLowerCase()
      const isRelevantTool = [
        "task",
        "delegate-task",
        "task_update",
        "todowrite",
        "todo_write",
      ].some((t) => toolName.includes(t))

      if (!isRelevantTool) return
      if (typeof toolOutput.output !== "string") return

      // Check for completion signals in the output
      const output = toolOutput.output.toLowerCase()
      const indicatesCompletion = [
        "completed",
        "done",
        "finished",
        "all tasks",
        "successfully",
      ].some((keyword) => output.includes(keyword))

      if (!indicatesCompletion) return

      // Find and update tasks.md
      const specRoot = resolveSpecRoot(projectDir, specDir)
      const specs = await listSpecs(specRoot)
      if (specs.length === 0) return

      for (const specName of specs) {
        const tasksFile = resolveSpecFile(projectDir, specDir, specName, "tasks.md")
        const content = await readSpecFile(tasksFile)
        if (!content) continue

        const updated = markInProgressAsCompleted(content)
        if (updated) {
          await writeSpecFile(tasksFile, updated)
          log(`[${HOOK_NAME}] Wrote task completion back to ${specName}/tasks.md`)
          break // Only update one spec per hook fire
        }
      }
    },
  }
}
