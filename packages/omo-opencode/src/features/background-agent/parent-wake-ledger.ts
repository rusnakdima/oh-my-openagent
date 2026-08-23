import { appendFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"

/**
 * Append-only ledger of parent-wake state transitions written to
 * ~/.omo/agent/parent-wake-log.jsonl
 */
export type ParentWakeLedgerEntry = {
  timestamp: string
  sessionID: string
  transition:
    | "pending"
    | "flushed"
    | "dispatched"
    | "cleared"
    | "requeued"
    | "requeued-empty-turn"
    | "timer-cancelled"
  taskID?: string
  reason?: string
  agent?: string
  model?: string
  shouldReply?: boolean
}

const LEDGER_FILENAME = "parent-wake-log.jsonl"

function getLedgerPath(directory: string): string {
  return join(directory, LEDGER_FILENAME)
}

function ensureLedgerDir(directory: string): void {
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true })
  }
}

export class ParentWakeLedger {
  constructor(private readonly _directory: string) {}

  private get path(): string {
    return getLedgerPath(this._directory)
  }

  append(entry: ParentWakeLedgerEntry): void {
    try {
      ensureLedgerDir(this._directory)
      const line = JSON.stringify(entry) + "\n"
      appendFileSync(this.path, line)
    } catch {
      // Fire-and-forget: ledger writes must never crash the hot path
    }
  }

  logPending(sessionID: string, taskID?: string, agent?: string, model?: string, shouldReply?: boolean): void {
    this.append({ timestamp: new Date().toISOString(), sessionID, transition: "pending", taskID, agent, model, shouldReply })
  }

  logFlushed(sessionID: string, taskID?: string): void {
    this.append({ timestamp: new Date().toISOString(), sessionID, transition: "flushed", taskID })
  }

  logDispatched(sessionID: string, taskID?: string): void {
    this.append({ timestamp: new Date().toISOString(), sessionID, transition: "dispatched", taskID })
  }

  logCleared(sessionID: string, taskID?: string): void {
    this.append({ timestamp: new Date().toISOString(), sessionID, transition: "cleared", taskID })
  }

  logRequeued(sessionID: string, reason: string, taskID?: string): void {
    this.append({ timestamp: new Date().toISOString(), sessionID, transition: "requeued", reason, taskID })
  }

  logRequeuedEmptyTurn(sessionID: string, taskID?: string): void {
    this.append({ timestamp: new Date().toISOString(), sessionID, transition: "requeued-empty-turn", taskID })
  }

  logTimerCancelled(sessionID: string, taskID?: string): void {
    this.append({ timestamp: new Date().toISOString(), sessionID, transition: "timer-cancelled", taskID })
  }
}
