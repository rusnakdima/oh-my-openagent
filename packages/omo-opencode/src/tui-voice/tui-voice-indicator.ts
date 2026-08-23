import type { Renderable } from "@opentui/core"

export type { Renderable }

export type IndicatorState = "idle" | "recording" | "processing"

/**
 * Returns a SolidJS-compatible render function for the voice indicator.
 * Renders a pulsing mic icon when recording is active and a spinner when
 * transcribing/processing.
 */
export function createVoiceIndicator(
  solid: {
    readonly createElement: (tag: string) => unknown
    readonly insert: (parent: unknown, child: unknown) => unknown
    readonly setProp: (node: unknown, name: string, value: unknown) => unknown
  },
  indicatorState: IndicatorState,
): Renderable {
  if (indicatorState === "idle") {
    // Return an empty box (renders nothing visible)
    const box = solid.createElement("box") as unknown as Renderable
    return box
  }

  const isProcessing = indicatorState === "processing"
  const label = isProcessing ? "transcribing..." : "recording..."
  const icon = isProcessing ? "⚡" : "🎤"
  const color = isProcessing ? "#eab308" : "#ef4444" // yellow for processing, red for recording

  const box = solid.createElement("box") as unknown as {
    style?: string
    children?: unknown[]
  }

  solid.setProp(box, "style", `color: ${color}; weight: bold;`)
  solid.setProp(box, "children", [`${icon} ${label}`])

  return box as unknown as Renderable
}
