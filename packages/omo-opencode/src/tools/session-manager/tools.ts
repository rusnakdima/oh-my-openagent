import type { PluginInput } from "@opencode-ai/plugin"
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import {
  SESSION_LIST_DESCRIPTION,
  SESSION_READ_DESCRIPTION,
  SESSION_SEARCH_DESCRIPTION,
  SESSION_INFO_DESCRIPTION,
  SESSION_TAG_DESCRIPTION,
  SESSION_BRANCH_DESCRIPTION,
  SESSION_MODEL_INFO_DESCRIPTION,
} from "./constants"
import { getAllSessions, getMainSessions, getSessionInfo, readSessionMessages, readSessionTodos, sessionExists, setStorageClient, getSessionTags, setSessionTags, getSessionMetadata } from "./storage"
import {
  filterSessionsByDate,
  formatSessionInfo,
  formatSessionList,
  formatSessionMessages,
  formatSearchResults,
  searchInSession,
} from "./session-formatter"
import type { SessionListArgs, SessionReadArgs, SessionSearchArgs, SessionInfoArgs, SessionTagArgs, SessionBranchArgs, SearchResult } from "./types"

const SEARCH_TIMEOUT_MS = 60_000
const MAX_SESSIONS_TO_SCAN = 50

function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms)),
  ])
}

type SessionManagerToolDeps = {
  getAllSessions: typeof getAllSessions
  getMainSessions: typeof getMainSessions
  getSessionInfo: typeof getSessionInfo
  readSessionMessages: typeof readSessionMessages
  readSessionTodos: typeof readSessionTodos
  sessionExists: typeof sessionExists
  setStorageClient: typeof setStorageClient
  getSessionTags: typeof getSessionTags
  setSessionTags: typeof setSessionTags
  getSessionMetadata: typeof getSessionMetadata
  filterSessionsByDate: typeof filterSessionsByDate
  formatSessionInfo: typeof formatSessionInfo
  formatSessionList: typeof formatSessionList
  formatSessionMessages: typeof formatSessionMessages
  formatSearchResults: typeof formatSearchResults
  searchInSession: typeof searchInSession
}

const defaultSessionManagerToolDeps: SessionManagerToolDeps = {
  getAllSessions,
  getMainSessions,
  getSessionInfo,
  readSessionMessages,
  readSessionTodos,
  sessionExists,
  setStorageClient,
  getSessionTags,
  setSessionTags,
  getSessionMetadata,
  filterSessionsByDate,
  formatSessionInfo,
  formatSessionList,
  formatSessionMessages,
  formatSearchResults,
  searchInSession,
}

export function createSessionManagerTools(
  ctx: PluginInput,
  deps: Partial<SessionManagerToolDeps> = {},
): Record<string, ToolDefinition> {
  const resolvedDeps: SessionManagerToolDeps = {
    ...defaultSessionManagerToolDeps,
    ...deps,
  }
  // Initialize storage client for SDK-based operations (beta mode)
  resolvedDeps.setStorageClient(ctx.client)

  const session_list: ToolDefinition = tool({
    description: SESSION_LIST_DESCRIPTION,
    args: {
      limit: tool.schema.number().optional().describe("Maximum number of sessions to return"),
      from_date: tool.schema.string().optional().describe("Filter sessions from this date (ISO 8601 format)"),
      to_date: tool.schema.string().optional().describe("Filter sessions until this date (ISO 8601 format)"),
      project_path: tool.schema.string().optional().describe("Filter sessions by project path (default: current working directory)"),
    },
    execute: async (args: SessionListArgs, _context) => {
      try {
        const directory = args.project_path ?? ctx.directory
        let sessions = await resolvedDeps.getMainSessions({ directory })
        let sessionIDs = sessions.map((s) => s.id)

        if (args.from_date || args.to_date) {
          sessionIDs = await resolvedDeps.filterSessionsByDate(sessionIDs, args.from_date, args.to_date)
        }

        if (args.limit && args.limit > 0) {
          sessionIDs = sessionIDs.slice(0, args.limit)
        }

        return await resolvedDeps.formatSessionList(sessionIDs)
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  })

  const session_read: ToolDefinition = tool({
    description: SESSION_READ_DESCRIPTION,
    args: {
      session_id: tool.schema.string().describe("Session ID to read"),
      include_todos: tool.schema.boolean().optional().describe("Include todo list if available (default: false)"),
      include_transcript: tool.schema.boolean().optional().describe("Include transcript log if available (default: false)"),
      limit: tool.schema.number().optional().describe("Maximum number of messages to return (default: all messages)"),
      from_end: tool.schema.boolean().optional().describe("Read messages from the END of the session (default: false). Pass true to get the most-recent / final assistant message in the output. Recommended when you want the result of a completed task."),
    },
    execute: async (args: SessionReadArgs, _context) => {
      try {
        if (!(await resolvedDeps.sessionExists(args.session_id))) {
          return `Session not found: ${args.session_id}`
        }

        let messages = await resolvedDeps.readSessionMessages(args.session_id)

        if (messages.length === 0) {
          return `Session not found: ${args.session_id}`
        }

        if (args.limit && args.limit > 0) {
          messages = args.from_end
            ? messages.slice(-args.limit)
            : messages.slice(0, args.limit)
        }

        const todos = args.include_todos ? await resolvedDeps.readSessionTodos(args.session_id) : undefined

        return resolvedDeps.formatSessionMessages(messages, args.include_todos, todos)
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  })

  const session_search: ToolDefinition = tool({
    description: SESSION_SEARCH_DESCRIPTION,
    args: {
      query: tool.schema.string().describe("Search query string"),
      session_id: tool.schema.string().optional().describe("Search within specific session only (default: all sessions)"),
      case_sensitive: tool.schema.boolean().optional().describe("Case-sensitive search (default: false)"),
      limit: tool.schema.number().optional().describe("Maximum number of results to return (default: 20)"),
    },
    execute: async (args: SessionSearchArgs, _context) => {
      try {
        const resultLimit = args.limit && args.limit > 0 ? args.limit : 20

        const searchOperation = async (): Promise<SearchResult[]> => {
          if (args.session_id) {
            return resolvedDeps.searchInSession(args.session_id, args.query, args.case_sensitive, resultLimit)
          }

          const allSessions = await resolvedDeps.getAllSessions()
          const sessionsToScan = allSessions.slice(0, MAX_SESSIONS_TO_SCAN)

          const allResults: SearchResult[] = []
          for (const sid of sessionsToScan) {
            if (allResults.length >= resultLimit) break

            const remaining = resultLimit - allResults.length
            const sessionResults = await resolvedDeps.searchInSession(sid, args.query, args.case_sensitive, remaining)
            allResults.push(...sessionResults)
          }

          return allResults.slice(0, resultLimit)
        }

        const results = await withTimeout(searchOperation(), SEARCH_TIMEOUT_MS, "Search")

        return resolvedDeps.formatSearchResults(results)
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  })

  const session_info: ToolDefinition = tool({
    description: SESSION_INFO_DESCRIPTION,
    args: {
      session_id: tool.schema.string().describe("Session ID to inspect"),
    },
    execute: async (args: SessionInfoArgs, _context) => {
      try {
        const info = await resolvedDeps.getSessionInfo(args.session_id)

        if (!info) {
          return `Session not found: ${args.session_id}`
        }

        return resolvedDeps.formatSessionInfo(info)
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  })

  const session_tag: ToolDefinition = tool({
    description: SESSION_TAG_DESCRIPTION,
    args: {
      session_id: tool.schema.string().describe("Session ID to tag"),
      tags: tool.schema.array(tool.schema.string()).describe("Tags to add, remove, or replace"),
      action: tool.schema.enum(["add", "remove", "replace"]).describe("Tag operation: add (append), remove (delete), or replace (overwrite)"),
    },
    execute: async (args: SessionTagArgs, _context) => {
      try {
        if (!(await resolvedDeps.sessionExists(args.session_id))) {
          return `Session not found: ${args.session_id}`
        }

        const result = await resolvedDeps.setSessionTags(args.session_id, args.tags, args.action)

        if (!result.success) {
          return `Failed to update tags for session ${args.session_id}. SDK-based sessions may not support tag operations.`
        }

        const actionPast = args.action === "add" ? "Added" : args.action === "remove" ? "Removed" : "Replaced"
        return `${actionPast} tags on session ${args.session_id}: ${result.tags.join(", ") || "(none)"}`
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  })

  const session_branch: ToolDefinition = tool({
    description: SESSION_BRANCH_DESCRIPTION,
    args: {
      session_id: tool.schema.string().describe("Parent session ID to branch from"),
      title: tool.schema.string().optional().describe("Title for the new branch session"),
      tags: tool.schema.array(tool.schema.string()).optional().describe("Initial tags for the new branch"),
    },
    execute: async (args: SessionBranchArgs, _context) => {
      try {
        const parentMeta = await resolvedDeps.getSessionMetadata(args.session_id)

        if (!parentMeta) {
          return `Parent session not found: ${args.session_id}`
        }

        const result = await ctx.client.session.create({
          body: {
            parentID: args.session_id,
            title: args.title ?? `Branch of ${parentMeta.title ?? args.session_id}`,
            tags: args.tags,
          } as Record<string, unknown>,
          query: { directory: parentMeta.directory },
        })

        if (result.error) {
          return `Error creating branch: ${result.error}`
        }
        return `Created branch session: ${result.data.id}`
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  })

  const session_model_info: ToolDefinition = tool({
    description: SESSION_MODEL_INFO_DESCRIPTION,
    args: {},
    execute: async () => {
      const { getMainSessionID } = await import("../../features/claude-code-session-state/state")
      const { getSessionModel } = await import("../../shared/session-model-state")
      const { getModelResolutionInfoWithOverrides } = await import("../../cli/doctor/checks/model-resolution")
      const { loadOmoConfig } = await import("../../cli/doctor/checks/model-resolution-config")

      const mainSessionID = getMainSessionID()
      const storedSessionModel = mainSessionID ? getSessionModel(mainSessionID) : undefined

      const config = await loadOmoConfig()
      const staticInfo = getModelResolutionInfoWithOverrides(config, undefined)

      function formatModel(model: { providerID: string; modelID: string } | null | undefined): string {
        if (!model) return "(not set)"
        return `${model.providerID}/${model.modelID}`
      }

      const lines: string[] = []
      lines.push("=== SESSION MODEL STATE ===")
      lines.push(`  mainSessionID : ${mainSessionID ?? "(not set)"}`)
      lines.push(`  storedModel   : ${formatModel(storedSessionModel)}`)
      lines.push("")

      lines.push("=== PER-AGENT MODELS (static config, no TUI override) ===")
      for (const agent of staticInfo.agents) {
        lines.push(`  ${agent.name.padEnd(20)} → ${agent.effectiveModel}`)
      }
      lines.push("")

      lines.push("=== PER-CATEGORY MODELS (static config, no TUI override) ===")
      for (const category of staticInfo.categories) {
        lines.push(`  ${category.name.padEnd(20)} → ${category.effectiveModel}`)
      }
      lines.push("")

      if (storedSessionModel) {
        const liveInfo = getModelResolutionInfoWithOverrides(config, storedSessionModel)
        lines.push("=== WITH TUI MODEL OVERRIDE (live session model applied to ALL) ===")
        lines.push(`  TUI model: ${formatModel(storedSessionModel)}`)
        lines.push("")
        lines.push("  Agents:")
        for (const agent of liveInfo.agents) {
          const staticModel = staticInfo.agents.find((a) => a.name === agent.name)?.effectiveModel ?? "(unknown)"
          const changed = staticModel !== agent.effectiveModel ? " ← OVERRIDE APPLIED" : ""
          lines.push(`    ${agent.name.padEnd(20)} → ${agent.effectiveModel}${changed}`)
        }
        lines.push("")
        lines.push("  Categories:")
        for (const cat of liveInfo.categories) {
          const staticModel = staticInfo.categories.find((c) => c.name === cat.name)?.effectiveModel ?? "(unknown)"
          const changed = staticModel !== cat.effectiveModel ? " ← OVERRIDE APPLIED" : ""
          lines.push(`    ${cat.name.padEnd(20)} → ${cat.effectiveModel}${changed}`)
        }
      } else {
        lines.push("=== WITH TUI MODEL OVERRIDE ===")
        lines.push("  (no TUI model stored — no override will be applied)")
        lines.push("")
        lines.push("  To store a TUI model: select a model in the TUI picker and send a message.")
        lines.push("  Then run this tool again to see the override effect.")
      }

      lines.push("")
      lines.push("=== SUBAGENT MODEL (what task tool passes to subagents) ===")
      if (storedSessionModel) {
        const modelStr = `${storedSessionModel.providerID}/${storedSessionModel.modelID}`
        lines.push(`  systemDefaultModel : ${modelStr}`)
        lines.push("  → Passed to resolveSubagentExecution → resolveModelForDelegateTask")
        lines.push("  → If model is in availableModels: used directly")
        lines.push("  → If NOT in availableModels: delegate-core skips userModel and uses fallback")
      } else {
        lines.push("  systemDefaultModel : (not set)")
        lines.push("  → Subagents use category fallback model, NOT TUI-selected model!")
      }

      return lines.join("\n")
    },
  })

  return { session_list, session_read, session_search, session_info, session_tag, session_branch, session_model_info }
}
