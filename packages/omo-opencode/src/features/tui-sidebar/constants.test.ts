import { describe, expect, it } from "bun:test"

import {
  HEARTBEAT_MS,
  LOOP_FRESH_MS,
  LABEL_MAX,
  MAX_AGENTS,
  MAX_JOBS,
  MIRROR_DIR_NAME,
  MIRROR_SCHEMA_VERSION,
  POLL_INTERVAL_MS,
  STALE_MS,
  WRITE_DEBOUNCE_MS,
} from "./constants"

describe("constants", () => {
  it("MIRROR_DIR_NAME is 'tui-state'", () => {
    expect(MIRROR_DIR_NAME).toBe("tui-state")
  })

  it("MIRROR_SCHEMA_VERSION is 3", () => {
    expect(MIRROR_SCHEMA_VERSION).toBe(3)
  })

  it("STALE_MS is 6000 (mirror snapshot too old to trust)", () => {
    expect(STALE_MS).toBe(6_000)
  })

  it("LOOP_FRESH_MS is 120000 (loop goals.json mtime threshold)", () => {
    expect(LOOP_FRESH_MS).toBe(120_000)
  })

  it("POLL_INTERVAL_MS is 1000 (TUI-side poll cadence)", () => {
    expect(POLL_INTERVAL_MS).toBe(1_000)
  })

  it("HEARTBEAT_MS is 2000 (plugin-side mirror flush cadence)", () => {
    expect(HEARTBEAT_MS).toBe(2_000)
  })

  it("WRITE_DEBOUNCE_MS is 250 (debounce on event-triggered flushes)", () => {
    expect(WRITE_DEBOUNCE_MS).toBe(250)
  })

  it("MAX_AGENTS is 12 (cap on rendered agent rows)", () => {
    expect(MAX_AGENTS).toBe(12)
  })

  it("MAX_JOBS is 12 (cap on rendered job rows)", () => {
    expect(MAX_JOBS).toBe(12)
  })

  it("LABEL_MAX is 24 (truncation point for labels)", () => {
    expect(LABEL_MAX).toBe(24)
  })
})
