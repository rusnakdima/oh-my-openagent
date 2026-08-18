/**
 * index.ts — OpenSpec tools factory.
 *
 * 6 tools:
 *   openspec_read, openspec_verify, openspec_status,
 *   openspec_propose, openspec_apply, openspec_archive
 *
 * All tools use toolContext.directory as the project root, and
 * config.openspec.spec_dir (default "openspec") as the spec root.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { z } from "zod"

import { join } from "node:path"
import {
  resolveSpecRoot,
  resolveSpecFile,
  resolveRootSpecFile,
  specExists,
  isDirectory,
  readSpecFile,
  writeSpecFile,
  listSpecs,
  parseTaskStats,
} from "./store"
import { verifySpec } from "./verify"
import { applySpec } from "./apply"
import type {
  OpenSpecReadArgs,
  OpenSpecVerifyArgs,
  OpenSpecStatusArgs,
  OpenSpecProposeArgs,
  OpenSpecApplyArgs,
  OpenSpecArchiveArgs,
} from "./types"

// ─── Tool arg schemas (local TypeScript types for execute callbacks) ───────────

interface OpenSpecToolContext {
  directory: string
  sessionID: string
  openspecSpecDir: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build markdown table row for a task line */
function formatTaskLine(
  description: string,
  status: "pending" | "in_progress" | "completed" | "blocked",
): string {
  const marker =
    status === "pending"
      ? " "
      : status === "in_progress"
        ? "~"
        : status === "completed"
          ? "x"
          : "!!"
  const safe = description.replace(/\|/g, "\\|").replace(/\n/g, " ")
  return `| [${marker}] | ${safe} |`
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

function createOpenSpecReadTool(
  ctx: PluginInput,
): ToolDefinition {
  return tool({
    description:
      "Read an OpenSpec file: spec.md (requirements + scope), plan.md (technical approach), or tasks.md (task checklist).",
    args: {
      file: tool.schema
        .enum(["spec.md", "plan.md", "tasks.md"])
        .describe("Which file to read."),
      spec_name: tool.schema
        .string()
        .optional()
        .describe(
          "Spec subdirectory name. If omitted, reads from the root spec_dir.",
        ),
    },
    execute: async (args) => {
      const projectDir = (ctx as unknown as OpenSpecToolContext).directory
      const specDir = (ctx as unknown as OpenSpecToolContext).openspecSpecDir
      const filePath = args.spec_name
        ? resolveSpecFile(projectDir, specDir, args.spec_name, args.file)
        : resolveRootSpecFile(projectDir, specDir, args.file)
      const content = await readSpecFile(filePath)
      if (!content) {
        return `No ${args.file} found${args.spec_name ? ` at ${args.spec_name}/` : ""}.`
      }
      return content
    },
  })
}

function createOpenSpecVerifyTool(
  _ctx: PluginInput,
): ToolDefinition {
  return tool({
    description:
      "Verify one or all OpenSpecs for consistency: checks spec.md, plan.md, and tasks.md all exist and are non-empty.",
    args: {
      spec_name: tool.schema
        .string()
        .optional()
        .describe("Specific spec to verify. If omitted, verifies all specs."),
    },
    execute: async (args, _execCtx) => {
      const projectDir = (_ctx as unknown as OpenSpecToolContext).directory
      const specDir = (_ctx as unknown as OpenSpecToolContext).openspecSpecDir
      const results = await verifySpec(projectDir, specDir, args.spec_name)

      if (results.length === 0) {
        return "No specs found."
      }

      const lines: string[] = ["## OpenSpec Verification Results\n"]
      for (const r of results) {
        const icon = r.valid ? "✅" : "❌"
        lines.push(`### ${icon} ${r.specName}`)
        for (const f of r.files) {
          const status = !f.exists ? "MISSING" : !f.nonEmpty ? "EMPTY" : "OK"
          lines.push(`  - ${f.name}: ${status}`)
        }
        if (r.taskStats) {
          const { open, in_progress, completed, blocked } = r.taskStats
          lines.push(
            `  - Tasks: ${open} open, ${in_progress} in-progress, ${completed} done, ${blocked} blocked`,
          )
        }
      }
      return lines.join("\n")
    },
  })
}

function createOpenSpecStatusTool(
  _ctx: PluginInput,
): ToolDefinition {
  return tool({
    description:
      "Dump the current state of one or all OpenSpecs: spec path and task counts.",
    args: {
      spec_name: tool.schema
        .string()
        .optional()
        .describe("Specific spec to check. If omitted, checks all specs."),
    },
    execute: async (args, execCtx) => {
      const projectDir = (execCtx as unknown as OpenSpecToolContext).directory
      const specDir = (execCtx as unknown as OpenSpecToolContext).openspecSpecDir
      const specRoot = resolveSpecRoot(projectDir, specDir)
      const toCheck = args.spec_name ? [args.spec_name] : await listSpecs(specRoot)

      if (toCheck.length === 0) {
        return "No specs found."
      }

      const lines: string[] = ["## OpenSpec Status\n"]
      for (const spec of toCheck) {
        const tasksFile = resolveSpecFile(projectDir, specDir, spec, "tasks.md")
        const content = await readSpecFile(tasksFile) ?? ""
        const stats = parseTaskStats(content)
        lines.push(`### ${spec}`)
        lines.push(`- spec: \`${specDir}/${spec}/spec.md\``)
        lines.push(
          `- tasks: ${stats.open} open, ${stats.in_progress} in-progress, ${stats.completed} done, ${stats.blocked} blocked`,
        )
      }
      return lines.join("\n")
    },
  })
}

function createOpenSpecProposeTool(
  _ctx: PluginInput,
): ToolDefinition {
  return tool({
    description:
      "Create a new OpenSpec with spec.md, plan.md, and tasks.md from structured arguments.",
    args: {
      title: tool.schema
        .string()
        .describe("Title of the spec."),
      spec_name: tool.schema
        .string()
        .describe(
          "Directory name for the spec. Must be directory-safe (no /, \\, or :).",
        ),
      requirements: tool.schema
        .string()
        .describe("Requirements section text for spec.md."),
      plan_summary: tool.schema
        .string()
        .describe("Technical plan summary for plan.md."),
      tasks: tool.schema
        .array(
          tool.schema.object({
            description: tool.schema.string(),
            status: tool.schema
              .enum(["pending", "in_progress", "completed", "blocked"])
              .default("pending"),
          }),
        )
        .describe("List of tasks for tasks.md."),
    },
    execute: async (args, execCtx) => {
      const projectDir = (execCtx as unknown as OpenSpecToolContext).directory
      const specDir = (execCtx as unknown as OpenSpecToolContext).openspecSpecDir
      const specPath = join(projectDir, specDir, args.spec_name)

      // Check spec doesn't already exist
      if (await specExists(specPath)) {
        return `Spec "${args.spec_name}" already exists at ${specDir}/${args.spec_name}/. Use a different spec_name or archive the existing spec first.`
      }

      // Create spec directory
      await isDirectory(specPath) ||
        (await import("node:fs/promises")).mkdir(specPath, { recursive: true })

      const specContent = `# ${args.title}\n\n${args.requirements}\n`
      const planContent = `# ${args.title} — Technical Plan\n\n${args.plan_summary}\n`

      const taskLines: string[] = [
        "# Tasks\n",
        "\n",
        "| Status | Description |\n",
        "| ------ | ------------- |\n",
      ]
      for (const t of args.tasks ?? []) {
        taskLines.push(formatTaskLine(t.description, t.status) + "\n")
      }

      await writeSpecFile(join(specPath, "spec.md"), specContent)
      await writeSpecFile(join(specPath, "plan.md"), planContent)
      await writeSpecFile(join(specPath, "tasks.md"), taskLines.join(""))

      return [
        `Spec "${args.title}" created at ${specDir}/${args.spec_name}/`,
        `- spec.md: ${specContent.split("\n").length} lines`,
        `- plan.md: ${planContent.split("\n").length} lines`,
        `- tasks.md: ${(args.tasks ?? []).length} tasks`,
      ].join("\n")
    },
  })
}

function createOpenSpecApplyTool(
  _ctx: PluginInput,
): ToolDefinition {
  return tool({
    description:
      "Mark all pending tasks in an OpenSpec as in-progress. Idempotent — no change if all tasks are already in-progress.",
    args: {
      spec_name: tool.schema.string().describe("Name of the spec to apply."),
    },
    execute: async (args, execCtx) => {
      const projectDir = (execCtx as unknown as OpenSpecToolContext).directory
      const specDir = (execCtx as unknown as OpenSpecToolContext).openspecSpecDir
      const sessionID = (execCtx as unknown as OpenSpecToolContext).sessionID
      const result = await applySpec(projectDir, specDir, args.spec_name, sessionID)
      return result.message
    },
  })
}

function createOpenSpecArchiveTool(
  _ctx: PluginInput,
): ToolDefinition {
  return tool({
    description: "Move a completed spec to the ARCHIVE/ directory.",
    args: {
      spec_name: tool.schema.string().describe("Name of the spec to archive."),
    },
    execute: async (args, execCtx) => {
      const projectDir = (execCtx as unknown as OpenSpecToolContext).directory
      const specDir = (execCtx as unknown as OpenSpecToolContext).openspecSpecDir
      const specRoot = resolveSpecRoot(projectDir, specDir)
      const srcPath = join(specRoot, args.spec_name)
      const archivePath = join(specRoot, "ARCHIVE")
      const destPath = join(archivePath, args.spec_name)

      if (!(await specExists(srcPath))) {
        return `Spec "${args.spec_name}" not found.`
      }
      if (await specExists(destPath)) {
        return `Archived spec "${args.spec_name}" already exists in ARCHIVE/.`
      }

      await (await import("node:fs/promises")).mkdir(archivePath, {
        recursive: true,
      })
      await (await import("node:fs/promises")).rename(srcPath, destPath)

      return `Spec "${args.spec_name}" archived to ${specDir}/ARCHIVE/${args.spec_name}/`
    },
  })
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export interface OpenSpecToolsOptions {
  readonly openspecSpecDir?: string
}

export function createOpenSpecTools(
  ctx: PluginInput,
  options: OpenSpecToolsOptions = {},
): Record<string, ToolDefinition> {
  const specDir = options.openspecSpecDir ?? "openspec"

  // Augment the tool context with openspec config
  const toolCtx = ctx as unknown as OpenSpecToolContext
  const augmentedCtx = {
    ...ctx,
    ...toolCtx,
    openspecSpecDir: specDir,
  }

  return {
    openspec_read: createOpenSpecReadTool(augmentedCtx as PluginInput),
    openspec_verify: createOpenSpecVerifyTool(augmentedCtx as PluginInput),
    openspec_status: createOpenSpecStatusTool(augmentedCtx as PluginInput),
    openspec_propose: createOpenSpecProposeTool(augmentedCtx as PluginInput),
    openspec_apply: createOpenSpecApplyTool(augmentedCtx as PluginInput),
    openspec_archive: createOpenSpecArchiveTool(augmentedCtx as PluginInput),
  }
}
