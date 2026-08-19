import type { SessionMetadata } from "../tools/session-manager/types"
import { getMainSessions } from "../tools/session-manager/storage"
import { setSessionTags } from "../tools/session-manager/storage"
import { getSessionMetadataPath } from "../tools/session-manager/file-storage"

interface SessionListOptions {
  tag?: string
  limit?: number
}

interface SessionTagOptions {
  sessionId: string
  action: "add" | "remove" | "replace"
  tags: string[]
}

function formatSessionRow(session: SessionMetadata, tags: string[]): string {
  const tagStr = tags.length > 0 ? tags.join(", ") : "-"
  const date = new Date(session.time.updated).toISOString().split("T")[0]
  return `${session.id} | ${session.title ?? "(no title)"} | ${date} | ${tagStr}`
}

export async function runSessionList(options: SessionListOptions): Promise<number> {
  const { tag, limit = 20 } = options

  try {
    let sessions = await getMainSessions({})

    if (tag) {
      sessions = sessions.filter((s) => {
        const sessionTags = s.tags ?? []
        return sessionTags.includes(tag)
      })
    }

    sessions = sessions.slice(0, limit)

    if (sessions.length === 0) {
      console.log("No sessions found.")
      return 0
    }

    console.log("Session ID | Title | Last Updated | Tags")
    console.log("-".repeat(80))

    for (const session of sessions) {
      const tags = session.tags ?? []
      console.log(formatSessionRow(session, tags))
    }

    return 0
  } catch (error) {
    console.error(`Error listing sessions: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

export async function runSessionTag(options: SessionTagOptions): Promise<number> {
  const { sessionId, action, tags } = options

  try {
    // Check if session exists via file storage
    const metaPath = getSessionMetadataPath(sessionId)
    if (!metaPath) {
      console.error(`Session not found: ${sessionId}`)
      return 1
    }

    const result = await setSessionTags(sessionId, tags, action)

    if (!result.success) {
      console.error(`Failed to update tags for session ${sessionId}`)
      return 1
    }

    const actionPast = action === "add" ? "Added" : action === "remove" ? "Removed" : "Replaced"
    console.log(`${actionPast} tags on session ${sessionId}: ${result.tags.join(", ") || "(none)"}`)

    return 0
  } catch (error) {
    console.error(`Error tagging session: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}
