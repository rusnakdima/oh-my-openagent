import type { Renderable } from "@opentui/core"

export type { Renderable }

/**
 * Returns a SolidJS-compatible render function for the voice indicator.
 * Renders a pulsing mic icon when recording is active.
 */
export function createVoiceIndicator(
  solid: {
    readonly createElement: (tag: string) => unknown
    readonly insert: (parent: unknown, child: unknown) => unknown
    readonly setProp: (node: unknown, name: string, value: unknown) => unknown
  },
  recording: boolean,
): Renderable {
  if (!recording) {
    // Return an empty box (renders nothing visible)
    const box = solid.createElement("box") as unknown as Renderable
    return box
  }

  // Create: <box style="color: #ff6b6b; weight: bold;">{text}</box>
  const box = solid.createElement("box") as unknown as {
    style?: string
    children?: unknown[]
  }

  solid.setProp(box, "style", "color: #ff6b6b; weight: bold;")
  solid.setProp(box, "children", ["🎤 recording..."])

  return box as unknown as Renderable
}
