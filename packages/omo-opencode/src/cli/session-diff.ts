import { readSessionMessages, readSessionTodos, getSessionInfo } from "../tools/session-manager/storage"
import type { TodoItem } from "../tools/session-manager/types"
import color from "picocolors"

interface SessionDiffResult {
  sessionA: string
  sessionB: string
  messageCount: { a: number; b: number; diff: number }
  todoChanges: {
    added: string[]
    completed: string[]
    cancelled: string[]
    removed: string[]
  }
  agentsUsed: { a: string[]; b: string[]; common: string[]; uniqueToA: string[]; uniqueToB: string[] }
  timeRange: {
    aStart?: string
    aEnd?: string
    bStart?: string
    bEnd?: string
  }
}

export async function runSessionDiff(
  sessionA: string,
  sessionB: string,
  options: { json?: boolean } = {},
): Promise<number> {
  try {
    const [messagesA, messagesB, todosA, todosB, infoA, infoB] = await Promise.all([
      readSessionMessages(sessionA),
      readSessionMessages(sessionB),
      readSessionTodos(sessionA),
      readSessionTodos(sessionB),
      getSessionInfo(sessionA),
      getSessionInfo(sessionB),
    ])

    const firstA = messagesA[0]
    const lastA = messagesA[messagesA.length - 1]
    const firstB = messagesB[0]
    const lastB = messagesB[messagesB.length - 1]

    const result: SessionDiffResult = {
      sessionA,
      sessionB,
      messageCount: {
        a: messagesA.length,
        b: messagesB.length,
        diff: messagesB.length - messagesA.length,
      },
      todoChanges: diffTodos(todosA, todosB),
      agentsUsed: diffAgents(infoA, infoB),
      timeRange: {
        aStart: firstA?.time ? new Date(firstA.time.created).toISOString() : undefined,
        aEnd: lastA?.time ? new Date(lastA.time.created).toISOString() : undefined,
        bStart: firstB?.time ? new Date(firstB.time.created).toISOString() : undefined,
        bEnd: lastB?.time ? new Date(lastB.time.created).toISOString() : undefined,
      },
    }

    if (options.json) {
      console.log(JSON.stringify(result, null, 2))
      return 0
    }

    formatDiff(result)
    return 0
  } catch (err) {
    if (options.json) {
      console.log(JSON.stringify({ error: String(err) }, null, 2))
    } else {
      console.error(color.red(`Error: ${err}`))
    }
    return 1
  }
}

function diffTodos(todosA: TodoItem[], todosB: TodoItem[]): SessionDiffResult["todoChanges"] {
  const mapA = new Map(todosA.map((t) => [t.id, t]))
  const mapB = new Map(todosB.map((t) => [t.id, t]))

  const added: string[] = []
  const removed: string[] = []
  const completed: string[] = []
  const cancelled: string[] = []

  for (const [id, todoB] of mapB) {
    if (!mapA.has(id)) {
      added.push(todoB.content.slice(0, 60))
    }
  }

  for (const [id, todoA] of mapA) {
    if (!mapB.has(id)) {
      removed.push(todoA.content.slice(0, 60))
    } else {
      const todoB = mapB.get(id)!
      if (todoA.status !== todoB.status) {
        if (todoB.status === "completed" && todoA.status === "in_progress") {
          completed.push(todoA.content.slice(0, 60))
        }
        if (todoB.status === "cancelled" && todoA.status === "in_progress") {
          cancelled.push(todoA.content.slice(0, 60))
        }
      }
    }
  }

  return { added, completed, cancelled, removed }
}

function diffAgents(
  infoA: Awaited<ReturnType<typeof getSessionInfo>>,
  infoB: Awaited<ReturnType<typeof getSessionInfo>>,
): SessionDiffResult["agentsUsed"] {
  const agentsA = infoA?.agents_used ?? []
  const agentsB = infoB?.agents_used ?? []
  const setA = new Set(agentsA)
  const setB = new Set(agentsB)

  const common = [...setA].filter((a) => setB.has(a))
  const uniqueToA = [...setA].filter((a) => !setB.has(a))
  const uniqueToB = [...setB].filter((a) => !setA.has(a))

  return { a: agentsA, b: agentsB, common, uniqueToA, uniqueToB }
}

function formatDiff(diff: SessionDiffResult): void {
  console.log(color.bold(color.cyan("=== Session Diff ===")))
  console.log()
  console.log(color.bold("Sessions:"))
  console.log(`  ${diff.sessionA}  vs  ${diff.sessionB}`)
  console.log()

  console.log(color.bold("Messages:"))
  console.log(`  ${diff.sessionA}: ${color.yellow(diff.messageCount.a.toString())} messages`)
  console.log(`  ${diff.sessionB}: ${color.yellow(diff.messageCount.b.toString())} messages`)
  console.log(`  Diff: ${diff.messageCount.diff >= 0 ? "+" : ""}${color.yellow(diff.messageCount.diff.toString())}`)
  console.log()

  if (diff.todoChanges.added.length > 0 || diff.todoChanges.completed.length > 0 || diff.todoChanges.cancelled.length > 0 || diff.todoChanges.removed.length > 0) {
    console.log(color.bold("Todos:"))
    if (diff.todoChanges.added.length > 0) {
      console.log(`  ${color.green("+ Added:")} ${diff.todoChanges.added.length}`)
      diff.todoChanges.added.forEach((t) => console.log(`    ${color.green("+")} ${t}`))
    }
    if (diff.todoChanges.completed.length > 0) {
      console.log(`  ${color.cyan("✓ Completed:")} ${diff.todoChanges.completed.length}`)
      diff.todoChanges.completed.forEach((t) => console.log(`    ${color.cyan("✓")} ${t}`))
    }
    if (diff.todoChanges.cancelled.length > 0) {
      console.log(`  ${color.red("× Cancelled:")} ${diff.todoChanges.cancelled.length}`)
      diff.todoChanges.cancelled.forEach((t) => console.log(`    ${color.red("×")} ${t}`))
    }
    if (diff.todoChanges.removed.length > 0) {
      console.log(`  ${color.red("- Removed:")} ${diff.todoChanges.removed.length}`)
      diff.todoChanges.removed.forEach((t) => console.log(`    ${color.red("-")} ${t}`))
    }
    console.log()
  }

  if (diff.agentsUsed.common.length > 0 || diff.agentsUsed.uniqueToA.length > 0 || diff.agentsUsed.uniqueToB.length > 0) {
    console.log(color.bold("Agents:"))
    console.log(`  ${color.green("Common:")} ${diff.agentsUsed.common.join(", ") || "(none)"}`)
    if (diff.agentsUsed.uniqueToA.length > 0) {
      console.log(`  ${color.yellow(`${diff.sessionA} only:`)} ${diff.agentsUsed.uniqueToA.join(", ")}`)
    }
    if (diff.agentsUsed.uniqueToB.length > 0) {
      console.log(`  ${color.yellow(`${diff.sessionB} only:`)} ${diff.agentsUsed.uniqueToB.join(", ")}`)
    }
    console.log()
  }

  if (diff.timeRange.aStart || diff.timeRange.bStart) {
    console.log(color.bold("Time Range:"))
    if (diff.timeRange.aStart) {
      console.log(`  ${diff.sessionA}: ${diff.timeRange.aStart}${diff.timeRange.aEnd ? ` → ${diff.timeRange.aEnd}` : ""}`)
    }
    if (diff.timeRange.bStart) {
      console.log(`  ${diff.sessionB}: ${diff.timeRange.bStart}${diff.timeRange.bEnd ? ` → ${diff.timeRange.bEnd}` : ""}`)
    }
  }
}
