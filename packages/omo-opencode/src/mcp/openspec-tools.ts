/**
 * openspec-tools.ts — MCP tool descriptors and request dispatcher for OpenSpec MCP.
 *
 * Thin stdio adapter wrapping the native OpenSpec tools (tools/openspec/).
 * Delegates file I/O to tools/openspec/store.ts to avoid duplication.
 *
 * Exports:
 *   - createOpenSpecMcpTools(options): returns MCP tool definitions
 *   - handleOpenSpecMcpRequest(name, args, cwd, specDir): executes a tool and returns MCP result
 */

import { join } from "node:path"
import { mkdir, rename } from "node:fs/promises"

import {
  resolveSpecRoot,
  resolveSpecFile,
  readSpecFile,
  writeSpecFile,
  specExists,
  listSpecs,
  markPendingAsInProgress,
} from "../tools/openspec/store"
import { verifySpec } from "../tools/openspec/verify"
import { applySpec } from "../tools/openspec/apply"

export type OpenSpecMcpToolsOptions = {
  readonly specDir?: string
}

// ─── Tool descriptors ────────────────────────────────────────────────────────

export interface McpToolArgSchema {
  readonly type?: string
  readonly enum?: readonly string[]
  readonly properties?: Record<string, McpToolArgSchema>
  readonly required?: readonly string[]
  readonly items?: McpToolArgSchema
  readonly description?: string
}

export interface McpToolDefinition {
  readonly name: string
  readonly description: string
  readonly inputSchema: McpToolArgSchema
}

export function createOpenSpecMcpTools(_options: OpenSpecMcpToolsOptions = {}): McpToolDefinition[] {
  return [
    {
      name: "openspec_read",
      description: "Read an OpenSpec file (spec.md, plan.md, or tasks.md).",
      inputSchema: {
        type: "object",
        properties: {
          file: {
            type: "string",
            enum: ["spec.md", "plan.md", "tasks.md"],
            description: "Which file to read from the spec directory.",
          },
          spec_name: {
            type: "string",
            description: "Optional spec name subdirectory. Defaults to the root spec_dir.",
          },
        },
        required: ["file"],
      },
    },
    {
      name: "openspec_verify",
      description: "Verify the consistency and completeness of one or all specs.",
      inputSchema: {
        type: "object",
        properties: {
          spec_name: {
            type: "string",
            description: "Optional spec name to verify. Defaults to all specs.",
          },
        },
      },
    },
    {
      name: "openspec_status",
      description: "Dump current OpenSpec state including task counts per spec.",
      inputSchema: {
        type: "object",
        properties: {
          spec_name: {
            type: "string",
            description: "Optional spec name. Defaults to all specs.",
          },
        },
      },
    },
    {
      name: "openspec_propose",
      description: "Create a new OpenSpec with spec.md, plan.md, and tasks.md.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Spec title." },
          spec_name: { type: "string", description: "Directory name for the spec." },
          requirements: { type: "string", description: "Requirements section text." },
          plan_summary: { type: "string", description: "Plan section text." },
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                status: {
                  type: "string",
                  enum: ["pending", "in_progress", "completed", "blocked"],
                },
              },
              required: ["description"],
            },
          },
        },
        required: ["title", "spec_name", "requirements", "plan_summary", "tasks"],
      },
    },
    {
      name: "openspec_apply",
      description: "Mark all pending tasks in a spec as in-progress.",
      inputSchema: {
        type: "object",
        properties: {
          spec_name: { type: "string" },
        },
        required: ["spec_name"],
      },
    },
    {
      name: "openspec_archive",
      description: "Move a spec to the ARCHIVE/ directory.",
      inputSchema: {
        type: "object",
        properties: {
          spec_name: { type: "string" },
        },
        required: ["spec_name"],
      },
    },
  ]
}

// ─── Request handler ─────────────────────────────────────────────────────────

export interface OpenSpecMcpResult {
  readonly content: ReadonlyArray<{ readonly type: "text"; readonly text: string }>
  readonly isError?: boolean
}

export async function handleOpenSpecMcpRequest(
  toolName: string,
  args: Record<string, unknown>,
  cwd: string,
  specDir: string,
): Promise<OpenSpecMcpResult> {
  const specRoot = resolveSpecRoot(cwd, specDir)

  switch (toolName) {
    case "openspec_read": {
      const file = args["file"] as string
      const specName = args["spec_name"] as string | undefined
      // Determine if specName is present: when provided it selects a subdirectory
      const filePath = specName
        ? resolveSpecFile(cwd, specDir, specName, file as "spec.md" | "plan.md" | "tasks.md")
        : join(specRoot, file)
      const content = await readSpecFile(filePath)
      return { content: [{ type: "text", text: content ?? `No ${file} found.` }] }
    }

    case "openspec_verify": {
      const specName = args["spec_name"] as string | undefined
      const results = await verifySpec(cwd, specDir, specName)
      if (results.length === 0) {
        return { content: [{ type: "text", text: "No specs found." }] }
      }
      const lines: string[] = ["## OpenSpec Verification Results\n"]
      for (const r of results) {
        const icon = r.valid ? "✅" : "❌"
        lines.push(`### ${icon} ${r.specName}`)
        for (const f of r.files) {
          const status = !f.exists ? "MISSING" : !f.nonEmpty ? "EMPTY" : "OK"
          lines.push(`  - ${f.name}: ${status}`)
        }
      }
      return { content: [{ type: "text", text: lines.join("\n") }] }
    }

    case "openspec_status": {
      const specName = args["spec_name"] as string | undefined
      const toCheck = specName ? [specName] : await listSpecs(specRoot)
      if (toCheck.length === 0) {
        return { content: [{ type: "text", text: "No specs found." }] }
      }
      const lines: string[] = ["## OpenSpec Status\n"]
      for (const spec of toCheck) {
        const tasksPath = resolveSpecFile(cwd, specDir, spec, "tasks.md")
        const content = await readSpecFile(tasksPath) ?? ""
        let open = 0, done = 0, blocked = 0, inProg = 0
        for (const l of content.split("\n")) {
          if (l.includes("[ ]")) open++
          else if (l.includes("[x]")) done++
          else if (l.includes("[~]")) inProg++
          else if (l.includes("[!!]")) blocked++
        }
        lines.push(`### ${spec}`)
        lines.push(`- spec: \`${specDir}/${spec}/spec.md\``)
        lines.push(`- tasks: ${open} open, ${inProg} in-progress, ${done} completed, ${blocked} blocked`)
      }
      return { content: [{ type: "text", text: lines.join("\n") }] }
    }

    case "openspec_propose": {
      const { title, spec_name, requirements, plan_summary, tasks } = args as {
        title: string
        spec_name: string
        requirements: string
        plan_summary: string
        tasks: Array<{ description: string; status?: string }>
      }
      const specPath = join(specRoot, spec_name)

      // Check spec doesn't already exist
      if (await specExists(specPath)) {
        return {
          content: [{ type: "text", text: `Spec "${spec_name}" already exists at ${specDir}/${spec_name}/.` }],
          isError: true,
        }
      }

      await mkdir(specPath, { recursive: true })

      const specContent = `# ${title}\n\n${requirements}\n`
      const planContent = `# ${title} — Technical Plan\n\n${plan_summary}\n`

      const taskLines: string[] = ["# Tasks\n", "\n", "| Status | Description |\n", "| ------ | ------------- |\n"]
      for (const t of tasks ?? []) {
        const marker =
          t.status === "in_progress" ? "~" : t.status === "completed" ? "x" : t.status === "blocked" ? "!!" : " "
        const safeDesc = (t.description ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")
        taskLines.push(`| [${marker}] | ${safeDesc} |\n`)
      }

      await writeSpecFile(join(specPath, "spec.md"), specContent)
      await writeSpecFile(join(specPath, "plan.md"), planContent)
      await writeSpecFile(join(specPath, "tasks.md"), taskLines.join(""))

      return {
        content: [
          {
            type: "text",
            text: `Spec "${title}" created at ${specDir}/${spec_name}/\n\n- spec.md: ${requirements.split("\n").length} lines\n- plan.md: ${plan_summary.split("\n").length} lines\n- tasks.md: ${(tasks ?? []).length} tasks`,
          },
        ],
      }
    }

    case "openspec_apply": {
      const { spec_name } = args as { spec_name: string }
      const result = await applySpec(cwd, specDir, spec_name)
      return { content: [{ type: "text", text: result.message }] }
    }

    case "openspec_archive": {
      const { spec_name } = args as { spec_name: string }
      const srcPath = join(specRoot, spec_name)
      const destPath = join(specRoot, "ARCHIVE", spec_name)

      if (!(await specExists(srcPath))) {
        return { content: [{ type: "text", text: `Spec "${spec_name}" not found.` }], isError: true }
      }
      if (await specExists(destPath)) {
        return {
          content: [{ type: "text", text: `Archived spec "${spec_name}" already exists in ARCHIVE/.` }],
          isError: true,
        }
      }

      await mkdir(join(specRoot, "ARCHIVE"), { recursive: true })
      await rename(srcPath, destPath)
      return { content: [{ type: "text", text: `Spec "${spec_name}" archived.` }] }
    }

    default:
      return { content: [{ type: "text", text: `Unknown tool: ${toolName}` }], isError: true }
  }
}
