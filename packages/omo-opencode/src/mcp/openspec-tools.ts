/**
 * openspec-tools.ts — MCP tool descriptors and request dispatcher for OpenSpec MCP.
 *
 * Exports:
 *   - createOpenSpecMcpTools(options): returns MCP tool definitions
 *   - handleOpenSpecMcpRequest(name, args, cwd, specDir): executes a tool and returns MCP result
 */

import { readFile, writeFile, readdir, stat, mkdir, rename } from "node:fs/promises"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"

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
  const specRoot = join(cwd, specDir)

  switch (toolName) {
    case "openspec_read": {
      const file = args["file"] as string
      const specName = args["spec_name"] as string | undefined
      const filePath = specName
        ? join(specRoot, specName, file)
        : join(specRoot, file)
      const content = await readFileSafe(filePath)
      return { content: [{ type: "text", text: content ?? `No ${file} found.` }] }
    }

    case "openspec_verify": {
      const specName = args["spec_name"] as string | undefined
      const specs = specName ? [specName] : await listSpecs(specRoot)
      const lines: string[] = ["## OpenSpec Verification Results\n"]
      for (const spec of specs) {
        const specPath = join(specRoot, spec)
        const hasSpec = await fileExists(join(specPath, "spec.md"))
        const hasPlan = await fileExists(join(specPath, "plan.md"))
        const hasTasks = await fileExists(join(specPath, "tasks.md"))
        const valid = hasSpec && hasPlan && hasTasks
        lines.push(`### ${spec}: ${valid ? "✅ Valid" : "❌ Invalid"}`)
        if (!hasSpec) lines.push(`  - Missing spec.md`)
        if (!hasPlan) lines.push(`  - Missing plan.md`)
        if (!hasTasks) lines.push(`  - Missing tasks.md`)
      }
      return { content: [{ type: "text", text: lines.join("\n") }] }
    }

    case "openspec_status": {
      const specName = args["spec_name"] as string | undefined
      const specs = specName ? [specName] : await listSpecs(specRoot)
      if (specs.length === 0) {
        return { content: [{ type: "text", text: "No specs found." }] }
      }
      const lines: string[] = ["## OpenSpec Status\n"]
      for (const spec of specs) {
        const tasksPath = join(specRoot, spec, "tasks.md")
        const content = await readFileSafe(tasksPath) ?? ""
        let open = 0, done = 0, blocked = 0, inProg = 0
        for (const l of content.split("\n")) {
          if (l.includes("[ ]")) open++
          else if (l.includes("[x]")) done++
          else if (l.includes("[~]")) inProg++
          else if (l.includes("[!]")) blocked++
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
      await mkdir(specPath, { recursive: true })

      const specContent = `# ${title}\n\n${requirements}\n`
      const planContent = `# ${title} — Technical Plan\n\n${plan_summary}\n`
      const taskLines = ["# Tasks\n", "\n", "| Status | Description |\n", "| ------ | ------------- |\n"]
      for (const t of tasks ?? []) {
        const marker = t.status === "in_progress" ? "~" : t.status === "completed" ? "x" : t.status === "blocked" ? "!" : " "
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
      const tasksPath = join(specRoot, spec_name, "tasks.md")
      const content = await readFileSafe(tasksPath)
      if (!content) {
        return { content: [{ type: "text", text: `Spec "${spec_name}" not found or has no tasks.md.` }] }
      }
      const updated = content.replace(/^(\| \[ \] \|)/gm, "| [~] |")
      await writeSpecFile(tasksPath, updated)
      return {
        content: [{ type: "text", text: `Spec "${spec_name}" applied. All pending tasks marked in-progress.` }],
      }
    }

    case "openspec_archive": {
      const { spec_name } = args as { spec_name: string }
      const archivePath = join(specRoot, "ARCHIVE")
      const srcPath = join(specRoot, spec_name)
      const destPath = join(archivePath, spec_name)
      await mkdir(archivePath, { recursive: true })
      await rename(srcPath, destPath)
      return { content: [{ type: "text", text: `Spec "${spec_name}" archived.` }] }
    }

    default:
      return { content: [{ type: "text", text: `Unknown tool: ${toolName}` }], isError: true }
  }
}

// ─── File helpers ────────────────────────────────────────────────────────────

async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8")
  } catch {
    return null
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function listSpecs(specRoot: string): Promise<string[]> {
  let entries: string[]
  try {
    entries = await readdir(specRoot)
  } catch {
    return []
  }
  const specs: string[] = []
  for (const entry of entries) {
    if (entry === "ARCHIVE" || entry === ".tmp") continue
    try {
      const st = await stat(join(specRoot, entry))
      if (st.isDirectory() && await fileExists(join(specRoot, entry, "spec.md"))) {
        specs.push(entry)
      }
    } catch {}
  }
  return specs.sort()
}

async function writeSpecFile(path: string, content: string): Promise<void> {
  const tmp = join(tmpdir(), `openspec-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
  await writeFile(tmp, content, "utf-8")
  await rename(tmp, path)
}
