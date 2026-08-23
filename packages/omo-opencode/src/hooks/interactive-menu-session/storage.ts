import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { INTERACTIVE_MENU_STORAGE_DIR } from "./constants"

export type MenuWindowStatus = "open" | "closed" | "answered"

export interface InteractiveMenuSessionState {
  sessionId: string
  trackedPanes: string[]
  lastActivity: number
  // Persistent menu window state (survives tool call end)
  windowName?: string
  status?: MenuWindowStatus
  prompt?: string
  options?: string[]
  answer?: string | null
}

function ensureDir(): void {
  try {
    mkdirSync(INTERACTIVE_MENU_STORAGE_DIR, { recursive: true })
  } catch { /* already exists */ }
}

export function loadInteractiveMenuSessionState(sessionId: string): InteractiveMenuSessionState | null {
  ensureDir()
  const path = `${INTERACTIVE_MENU_STORAGE_DIR}/${sessionId}.json`
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as InteractiveMenuSessionState
  } catch {
    return null
  }
}

export function saveInteractiveMenuSessionState(sessionId: string, state: InteractiveMenuSessionState): void {
  ensureDir()
  const path = `${INTERACTIVE_MENU_STORAGE_DIR}/${sessionId}.json`
  writeFileSync(path, JSON.stringify(state, null, 2), "utf-8")
}

export function clearInteractiveMenuSessionState(sessionId: string): void {
  const path = `${INTERACTIVE_MENU_STORAGE_DIR}/${sessionId}.json`
  try {
    const { unlinkSync } = require("fs")
    unlinkSync(path)
  } catch { /* best effort */ }
}
