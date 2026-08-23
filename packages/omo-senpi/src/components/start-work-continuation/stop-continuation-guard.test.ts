import { expect } from "bun:test"
import { describe, test } from "bun:test"
import type { SenpiExtensionAPI } from "../../extension/types"
import {
  createStopContinuationGuard,
  getOrCreateStopContinuationGuard,
  peekStopContinuationGuard,
} from "./stop-continuation-guard"

describe("createStopContinuationGuard", () => {
  test("#given a fresh guard #when managing session lifecycle #then isStopped reflects stop/clear calls", () => {
    const guard = createStopContinuationGuard()
    const sessionId = "senpi:session-abc"

    expect(guard.isStopped(sessionId)).toBe(false)
    guard.stop(sessionId)
    expect(guard.isStopped(sessionId)).toBe(true)
    guard.clear(sessionId)
    expect(guard.isStopped(sessionId)).toBe(false)
  })

  test("#given multiple sessions #when stopping one #then the other is unaffected", () => {
    const guard = createStopContinuationGuard()
    const s1 = "senpi:session-1"
    const s2 = "senpi:session-2"

    guard.stop(s1)
    expect(guard.isStopped(s1)).toBe(true)
    expect(guard.isStopped(s2)).toBe(false)
    guard.clear(s1)
    expect(guard.isStopped(s1)).toBe(false)
    expect(guard.isStopped(s2)).toBe(false)
  })

  test("#given stop called twice #then isStopped remains true (idempotent)", () => {
    const guard = createStopContinuationGuard()
    const sessionId = "senpi:session-dup"
    guard.stop(sessionId)
    guard.stop(sessionId)
    expect(guard.isStopped(sessionId)).toBe(true)
  })
})

describe("getOrCreateStopContinuationGuard (WeakMap per pi)", () => {
  test("#given two fake pi instances #when creating guards #then each pi gets its own guard", () => {
    // Two separate fake extension API objects — each should get its own guard
    const fakePi1: SenpiExtensionAPI = {} as SenpiExtensionAPI
    const fakePi2: SenpiExtensionAPI = {} as SenpiExtensionAPI

    const guard1 = getOrCreateStopContinuationGuard(fakePi1)
    const guard2 = getOrCreateStopContinuationGuard(fakePi2)

    expect(guard1).not.toBe(guard2)

    // Each guard is independent
    guard1.stop("session-1")
    guard2.stop("session-2")
    expect(guard1.isStopped("session-1")).toBe(true)
    expect(guard1.isStopped("session-2")).toBe(false)
    expect(guard2.isStopped("session-2")).toBe(true)
    expect(guard2.isStopped("session-1")).toBe(false)
  })

  test("#given the same pi #when called twice #then the same guard is returned", () => {
    const fakePi: SenpiExtensionAPI = {} as SenpiExtensionAPI
    const g1 = getOrCreateStopContinuationGuard(fakePi)
    const g2 = getOrCreateStopContinuationGuard(fakePi)
    expect(g1).toBe(g2)
  })
})

describe("peekStopContinuationGuard", () => {
  test("#given a pi with no guard #when peeking #then undefined is returned", () => {
    const fakePi: SenpiExtensionAPI = {} as SenpiExtensionAPI
    expect(peekStopContinuationGuard(fakePi)).toBeUndefined()
  })

  test("#given a pi with a guard created #when peeking #then the guard is returned", () => {
    const fakePi: SenpiExtensionAPI = {} as SenpiExtensionAPI
    const created = getOrCreateStopContinuationGuard(fakePi)
    expect(peekStopContinuationGuard(fakePi)).toBe(created)
  })
})
