/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, it, jest, mock } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { TuiPluginApi, TuiPluginMeta, TuiSlotPlugin } from "@opencode-ai/plugin/tui"

import tuiModule, { handleTuiPollError, materialize } from "./tui"

type SolidNode = {
  readonly tag: string
  readonly props: Record<string, unknown>
  readonly children: unknown[]
}

type SidebarApiForTest = {
  readonly state: {
    readonly path: {
      readonly directory: string
    }
  }
  readonly theme: {
    readonly current: Record<string, unknown>
  }
  readonly slots: {
    readonly register: (registration: TuiSlotPlugin) => string
  }
  readonly renderer: {
    readonly requestRender: () => void
  }
  readonly lifecycle: {
    readonly signal: AbortSignal
    readonly onDispose: (dispose: () => void) => () => void
  }
}

describe("TUI sidebar polling", () => {
  let tempDir = ""

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "omo-tui-test-"))
  })

  afterEach(() => {
    mock.restore()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it("#given the TUI plugin starts #when it registers the sidebar slot #then an initial render is requested immediately", async () => {
    // given
    const calls: string[] = []
    const disposers: (() => void)[] = []
    let registration: TuiSlotPlugin | undefined

    mock.module("@opentui/solid", () => ({
      createElement: (tag: string): SolidNode => ({ tag, props: {}, children: [] }),
      insert: (parent: SolidNode, child: unknown): void => {
        parent.children.push(child)
      },
      setProp: (node: SolidNode, name: string, value: unknown): void => {
        node.props[name] = value
      },
    }))

    const api = {
      state: { path: { directory: tempDir } },
      theme: { current: {} },
      slots: {
        register: (nextRegistration: TuiSlotPlugin): string => {
          calls.push("register")
          registration = nextRegistration
          return "omo-sidebar-slot"
        },
      },
      renderer: {
        requestRender: (): void => {
          calls.push("render")
        },
      },
      lifecycle: {
        signal: new AbortController().signal,
        onDispose: (dispose: () => void): (() => void) => {
          disposers.push(dispose)
          return () => undefined
        },
      },
      // Required by setupTuiVoice at tui-voice/index.ts:55
      keymap: {
        getHostMetadata: (): { platform: string } => ({ platform: "linux" }),
        registerLayer: (): (() => void) => () => undefined => () => undefined,
      },
    } satisfies SidebarApiForTest

    // when
    await tuiModule.tui(api as unknown as TuiPluginApi, undefined, {} as TuiPluginMeta)

    // then
    expect(calls).toEqual(["register", "render"])
    expect(registration).toBeDefined()
    if (!registration) {
      throw new Error("sidebar slot was not registered")
    }
    expect(registration.order).toBe(900)
    expect(Object.keys(registration.slots)).toEqual(["sidebar_content"])
    expect(registration.slots.sidebar_content).toBeFunction()
    for (const dispose of disposers) dispose()
  })

  it("#given an unexpected Error during polling #when the poll error handler runs #then the error is logged", () => {
    // given
    const pollError = new TypeError("view derivation failed")
    const reportedErrors: Error[] = []

    // when
    handleTuiPollError(pollError, (error) => {
      reportedErrors.push(error)
    })

    // then
    expect(reportedErrors).toEqual([pollError])
  })

  it("#given a non-Error throw during polling #when the poll error handler runs #then the value is rethrown", () => {
    // given
    const thrownValue = "bad poll state"

    expect(() => handleTuiPollError(thrownValue)).toThrow(thrownValue)
  })
})

describe("materialize", () => {
  it("#given an empty node array #when materialize #then creates root box with no children", () => {
    // Use a mock that captures all calls for inspection
    const created: SolidNode[] = []
    const inserted: unknown[] = []
    const propCalls: Array<{ node: SolidNode; name: string; value: unknown }> = []
    const solid = {
      createElement: (tag: string): SolidNode => {
        const node = { tag, props: {}, children: [] }
        created.push(node)
        return node
      },
      insert: (parent: SolidNode, child: unknown): void => {
        inserted.push({ parent: parent.tag, child: typeof child === "object" && child !== null ? (child as SolidNode).tag ?? child : child })
        parent.children.push(child as SolidNode)
      },
      setProp: (node: SolidNode, name: string, value: unknown): void => {
        propCalls.push({ node, name, value })
        node.props[name] = value
      },
    }

    const root = materialize([], solid as never)

    // Root should be a box
    expect(root.tag).toBe("box")
    // Props should have been called with flexDirection=column for the root
    expect(propCalls.some((c) => c.name === "flexDirection" && c.value === "column")).toBe(true)
    expect(root.children).toHaveLength(0)
  })

  it("#given a single box node with a text child #when materialize #then creates box with text child", () => {
    const solid = {
      // Each createElement call MUST return a fresh children array — no shared state
      createElement: (tag: string): SolidNode => ({ tag, props: {}, children: [] }),
      insert: (parent: SolidNode, child: unknown): void => {
        parent.children.push(child as SolidNode)
      },
      setProp: (node: SolidNode, name: string, value: unknown): void => {
        node.props[name] = value
      },
    }

    const textNode = { kind: "text" as const, props: {}, text: "hello" }
    const nodes = [{ kind: "box" as const, props: { label: "sidebar" }, children: [textNode] }]
    const root = materialize(nodes, solid as never)

    // Root is the container box created by materialize (flexDirection=column)
    expect(root.tag).toBe("box")
    expect(root.props.flexDirection).toBe("column")
    // The child of root is the materialized box node (which has label="sidebar")
    expect(root.children).toHaveLength(1)
    const [childBox] = root.children as [SolidNode]
    expect(childBox.props.label).toBe("sidebar")
    // The grandchild is the text node
    expect(childBox.children).toHaveLength(1)
    const [textChild] = childBox.children as [SolidNode]
    expect(textChild.tag).toBe("text")
    // Text content is stored as children[0] (the string inserted by materializeNode for text kind)
    expect(textChild.children[0]).toBe("hello")
  })
})
