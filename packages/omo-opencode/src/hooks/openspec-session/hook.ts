/**
 * hook.ts — OpenSpec session hook.
 *
 * Implements:
 * - `chat.message`: auto-inject spec context when openspec.auto_inject is true
 * - `tool.execute.after`: write task completion markers back to tasks.md
 *   when openspec.task_write_back is true
 * - `event`: session.idle → idle continuation; session.deleted → cleanup
 * - Command methods: propose, verify, apply, archive, status, list (via controller)
 */

import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { dispatchInternalPrompt, isInternalPromptDispatchAccepted } from "../../shared/prompt-async-gate"
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
import type { OpenSpecController } from "./controller"
import {
  deleteSessionRecord,
  loadAllSessionRecords,
  writeSessionRecord,
} from "./persistence"
import { extractPromptText } from "../keyword-detector/detector"

const HOOK_NAME = "openspec-session"

// ── Helpers for auto-create ────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

function extractSpecName(messageText: string): string {
  const firstSentence = messageText.split(/[.!?]\s/)[0]?.trim() ?? "untitled"
  const cleaned = firstSentence.replace(/^(plan|build|create|implement|make|write|design|develop)\s+(a?\s*|the\s*)/i, "")
  return slugify(cleaned).slice(0, 64) || "untitled"
}

function extractDescription(messageText: string): string {
  const firstParagraph = messageText.split(/\n\n/)[0]?.trim() ?? ""
  const cleaned = firstParagraph.replace(/^[^:]+?:\s*/, "").trim()
  return cleaned.slice(0, 500) || messageText.slice(0, 200)
}

export type OpenSpecHookOptions = {
  readonly projectDir: string
  readonly specDir?: string
  readonly autoInject?: boolean
  readonly autoCreate?: boolean
  readonly shortenInterview?: boolean
  readonly taskWriteBack?: boolean
  readonly controller: OpenSpecController
}

// Tracks sessions where auto-inject has already fired (prevent double injection)
// Map: sessionID -> specName
// Note: declared inside createOpenSpecSessionHook to avoid cross-session pollution

/**
 * Injects a concise OpenSpec context block into the user message parts.
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
    for (const line of tasksContent.split("\n")) {
      if (line.match(/^\|\s*\[[ x~!]\]\s\|/)) {
        taskLines.push(line)
      }
    }
    const taskBlock =
      stats.open === 0 && stats.in_progress === 0 && stats.blocked === 0
        ? `All tasks completed (${stats.completed} done).`
        : `${stats.open} pending, ${stats.in_progress} in-progress, ${stats.blocked} blocked, ${stats.completed} done.`
    parts.push(
      `\n**Tasks (${taskBlock})**\n${taskLines.slice(0, 6).join("\n")}${stats.open + stats.in_progress + stats.completed + stats.blocked > 5 ? "\n..." : ""}`,
    )
  }

  if (parts.length === 0) return

  const injectedText = parts.join("\n")

  const textPartIdx = output.parts.findIndex(
    (p) => p.type === "text" && typeof p.text === "string" && p.text.trim().length > 0,
  )
  if (textPartIdx !== -1) {
    const existing = output.parts[textPartIdx].text ?? ""
    output.parts[textPartIdx].text = `${existing}\n\n---\n\n${injectedText}`
  } else {
    output.parts.unshift({ type: "text", text: injectedText })
  }
}

function getSessionIDFromEvent(properties: unknown): string | undefined {
  if (typeof properties === "object" && properties !== null) {
    const maybe = (properties as { sessionID?: string }).sessionID
    if (typeof maybe === "string") return maybe
    const maybeId = (properties as { id?: string }).id
    if (typeof maybeId === "string") return maybeId
  }
  return undefined
}

function sessionDeletedEvent(
  event: { type: string; properties?: unknown },
  injected: Map<string, string>,
  baseDir: string,
): void {
  if (event.type !== "session.deleted") return
  const sessionID = getSessionIDFromEvent(event.properties)
  if (sessionID === undefined) return
  if (!injected.has(sessionID)) return
  injected.delete(sessionID)
  deleteSessionRecord(baseDir, sessionID)
}

async function buildIdleContinuationPrompt(
  specName: string,
  projectDir: string,
  specDir: string,
): Promise<string | null> {
  const tasksFile = resolveSpecFile(projectDir, specDir, specName, "tasks.md")
  const content = await readSpecFile(tasksFile)
  if (!content) return null

  const stats = parseTaskStats(content)
  if (stats.open === 0 && stats.in_progress === 0 && stats.blocked === 0) {
    return null
  }

  const pendingLines: string[] = []
  for (const line of content.split("\n")) {
    if (line.match(/^\|\s*\[\s*\]\s\|/)) {
      pendingLines.push(line)
    }
    if (line.match(/^\|\s*\[\s*!\]\s\|/)) {
      pendingLines.push(line)
    }
  }

  const pendingCount = stats.open + stats.blocked
  const lines: string[] = [
    "The active OpenSpec has pending tasks. Continue working toward completing them.",
    "",
    `Spec: **${specName}** (${specDir}/${specName}/)`,
    "",
    `${pendingCount} task(s) remaining: open ${stats.open}, blocked ${stats.blocked}`,
    "",
  ]

  if (pendingLines.length > 0) {
    lines.push("Pending tasks:")
    for (const t of pendingLines.slice(0, 10)) {
      lines.push(t)
    }
    if (pendingLines.length > 10) {
      lines.push(`... and ${pendingLines.length - 10} more`)
    }
  }

  lines.push("")
  lines.push("Choose the next concrete action to advance the spec. Avoid repeating work already done.")

  return lines.join("\n")
}

export function createOpenSpecSessionHook(
  ctx: PluginInput,
  options: OpenSpecHookOptions,
) {
  const {
    projectDir,
    specDir = "openspec",
    autoInject = true,
    autoCreate = false,
    shortenInterview = false,
    taskWriteBack = true,
    controller,
  } = options

  // Per-instance session map (avoids cross-session pollution)
  const injectedSessions = new Map<string, string>()

  // Restore previously injected sessions from disk (survives plugin reload)
  const sessionStoreDir = join(projectDir, ".omo", "openspec", "sessions")
  const restored = loadAllSessionRecords(sessionStoreDir)
  for (const [sessionID, specName] of restored) {
    injectedSessions.set(sessionID, specName)
  }

  return {
    // ── Command methods (called by /openspec command handler) ──────────────
    propose: controller.propose.bind(controller),
    verify: controller.verify.bind(controller),
    apply: controller.apply.bind(controller),
    archive: controller.archive.bind(controller),
    status: controller.status.bind(controller),
    list: controller.list.bind(controller),

    // ── Session hooks ────────────────────────────────────────────────────────
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

      // auto-create path: no specs exist AND autoCreate is enabled
      if (specs.length === 0 && autoCreate) {
        const messageText = extractPromptText(output.parts)
        const specName = extractSpecName(messageText)
        const description = extractDescription(messageText)
        await controller.propose(specName, description)
        await controller.apply(specName)
        injectedSessions.set(input.sessionID, specName)
        writeSessionRecord(sessionStoreDir, input.sessionID, { specName, injectedAt: Date.now() })
        try {
          await injectSpecContext(output, specName, specDir, projectDir, shortenInterview)
          log(`[${HOOK_NAME}] Auto-created spec "${specName}" for session ${input.sessionID}`)
        } catch (err) {
          log(`[${HOOK_NAME}] Failed to inject auto-created spec context:`, err)
        }
        return
      }

      if (specs.length === 0) return

      const specName = specs[0]
      injectedSessions.set(input.sessionID, specName)
      writeSessionRecord(sessionStoreDir, input.sessionID, { specName, injectedAt: Date.now() })

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

      const output = toolOutput.output.toLowerCase()
      const indicatesCompletion = [
        "completed",
        "done",
        "finished",
        "all tasks",
        "successfully",
      ].some((keyword) => output.includes(keyword))

      if (!indicatesCompletion) return

      // Target the session's active spec if known, otherwise fall back to
      // iterating all specs alphabetically
      const activeSpec = injectedSessions.get(toolInput.sessionID)
      if (activeSpec) {
        const tasksFile = resolveSpecFile(projectDir, specDir, activeSpec, "tasks.md")
        const content = await readSpecFile(tasksFile)
        if (content) {
          const updated = markInProgressAsCompleted(content)
          if (updated) {
            await writeSpecFile(tasksFile, updated)
            log(`[${HOOK_NAME}] Wrote task completion back to ${activeSpec}/tasks.md`)
          }
        }
      } else {
        const specRoot = resolveSpecRoot(projectDir, specDir)
        const specs = await listSpecs(specRoot)
        for (const specName of specs) {
          const tasksFile = resolveSpecFile(projectDir, specDir, specName, "tasks.md")
          const content = await readSpecFile(tasksFile)
          if (!content) continue

          const updated = markInProgressAsCompleted(content)
          if (updated) {
            await writeSpecFile(tasksFile, updated)
            log(`[${HOOK_NAME}] Wrote task completion back to ${specName}/tasks.md`)
            break
          }
        }
      }
    },

    event: async (input: { event: { type: string; properties?: unknown } }): Promise<void> => {
      const sessionID = getSessionIDFromEvent(input.event.properties)
      if (sessionID === undefined) return

      if (input.event.type === "session.idle") {
        const specName = injectedSessions.get(sessionID)
        if (!specName) return

        const promptText = await buildIdleContinuationPrompt(specName, projectDir, specDir)
        if (!promptText) return

        const promptResult = await dispatchInternalPrompt({
          mode: "async",
          client: ctx.client,
          sessionID,
          source: `${HOOK_NAME}:idle-continuation`,
          settleMs: 150,
          queueBehavior: "defer",
          input: {
            path: { id: sessionID },
            body: {
              parts: [{ type: "text", text: promptText }],
            },
          },
        })
        if (promptResult.status === "failed" && !isInternalPromptDispatchAccepted(promptResult)) {
          // eslint-disable-next-line no-console
          console.warn(`[${HOOK_NAME}] Idle continuation dispatch failed`, promptResult.error)
        }
      }

      if (input.event.type === "session.deleted") {
        sessionDeletedEvent(input.event, injectedSessions, sessionStoreDir)
      }
    },
  }
}
