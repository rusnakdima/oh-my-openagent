import type { PluginInput } from "@opencode-ai/plugin"
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import {
	takeSnapshot,
	sendKeys,
	clickOnElement,
	findElementByText,
	findElementsByType,
	formatLayout,
	type TuiElement,
	type TuiLayout,
} from "@oh-my-opencode/tui-core"

type TuiArgs = {
	session: string
	window?: string
	pane?: number
}

async function getSnapshot(args: TuiArgs) {
	const result = await takeSnapshot(args.session, {
		windowName: args.window,
		paneIndex: args.pane ?? 0,
	})
	if (!result) {
		return JSON.stringify({ error: "Failed to capture screen" })
	}
	return result
}

/**
 * tui_snapshot — Capture the current TUI screen state
 *
 * Returns structured layout with panels, buttons, menus, and inputs identified.
 */
export function createTuiSnapshotTool(_ctx: PluginInput): ToolDefinition {
	return tool({
		description:
			"Capture the current TUI (terminal user interface) screen state. " +
			"Returns the raw output and parsed layout with identified elements like buttons, menus, and inputs. " +
			"Use this to see what's currently displayed in the OpenCode TUI and identify clickable elements.",
		args: {
			session: tool.schema
				.string()
				.describe("The tmux session name to capture (e.g., 'omo-tui-1')"),
			window: tool.schema.string().optional().describe("Window name (defaults to session name)"),
			pane: tool.schema.number().optional().default(0).describe("Pane index (default: 0)"),
			format: tool.schema
				.enum(["json", "readable"])
				.optional()
				.default("readable")
				.describe("Output format: 'json' for raw data, 'readable' for human-friendly"),
		},
		execute: async (args) => {
			const snapshot = await getSnapshot({ session: args.session, window: args.window, pane: args.pane })

			if (typeof snapshot === "string") {
				return snapshot
			}

			if (args.format === "json") {
				return JSON.stringify(snapshot, null, 2)
			}

			// Return readable format
			if (snapshot.parsedLayout) {
				return formatLayout(snapshot.parsedLayout)
			}

			return snapshot.rawOutput || "(empty)"
		},
	})
}

/**
 * tui_click — Click at coordinates or on a specific element
 *
 * Can click by:
 * - x,y coordinates directly
 * - Element text (finds the element and clicks in its center)
 */
export function createTuiClickTool(_ctx: PluginInput): ToolDefinition {
	return tool({
		description:
			"Simulate a mouse click in the TUI. " +
			"Can click at specific x,y coordinates or find an element by text and click its center. " +
			"Use after tui_snapshot to identify what to click.",
		args: {
			session: tool.schema.string().describe("The tmux session name"),
			target: tool.schema
				.union([
					tool.schema.object({
						x: tool.schema.number().describe("X coordinate"),
						y: tool.schema.number().describe("Y coordinate"),
					}),
					tool.schema.object({
						text: tool.schema.string().describe("Text of the element to click"),
					}),
				])
				.describe("Click target: either x,y coordinates or text to find"),
			window: tool.schema.string().optional().describe("Window name (defaults to session name)"),
			pane: tool.schema.number().optional().default(0).describe("Pane index (default: 0)"),
		},
		execute: async (args) => {
			const target = args.target as { x?: number; y?: number; text?: string }
			let element: TuiElement | null = null

			if (target.text) {
				// First get the snapshot to find the element
				const snapshot = await getSnapshot({ session: args.session, window: args.window, pane: args.pane })
				if (typeof snapshot === "string") {
					return snapshot
				}

				if (!snapshot.parsedLayout) {
					return JSON.stringify({ error: "No layout parsed - cannot find element by text" })
				}

				element = findElementByText(snapshot.parsedLayout, target.text)
				if (!element) {
					return JSON.stringify({ error: `Element with text "${target.text}" not found` })
				}
			}

			const success = element
				? await clickOnElement(args.session, element, { windowName: args.window, paneIndex: args.pane ?? 0 })
				: await (async () => {
						if (target.x === undefined || target.y === undefined) {
							return false
						}
						// Import sendMouseClick dynamically to use it here
						const { sendMouseClick } = await import("@oh-my-opencode/tui-core")
						return sendMouseClick(args.session, {
							x: target.x,
							y: target.y,
							windowName: args.window,
							paneIndex: args.pane ?? 0,
						})
					})()

			return JSON.stringify({ success, clicked: element ? `element "${element.text}"` : `(${target.x}, ${target.y})` })
		},
	})
}

/**
 * tui_keys — Send keyboard input to the TUI
 */
export function createTuiKeysTool(_ctx: PluginInput): ToolDefinition {
	return tool({
		description:
			"Send keyboard keys to the TUI. " +
			"Common keys: 'Enter', 'Escape', 'Tab', 'Backspace', 'Space', 'Up', 'Down', 'Left', 'Right'. " +
			"Modifiers: C- (Ctrl), M- (Alt), S- (Shift). E.g., 'C-c' for Ctrl+C, 'M-x' for Alt+X.",
		args: {
			session: tool.schema.string().describe("The tmux session name"),
			keys: tool.schema.string().describe("The key or key combination to send"),
			window: tool.schema.string().optional().describe("Window name (defaults to session name)"),
			pane: tool.schema.number().optional().default(0).describe("Pane index (default: 0)"),
		},
		execute: async (args) => {
			const success = await sendKeys(args.session, args.keys, {
				windowName: args.window,
				paneIndex: args.pane ?? 0,
			})

			return JSON.stringify({ success, sent: args.keys })
		},
	})
}

/**
 * tui_type — Type text into the TUI
 */
export function createTuiTypeTool(_ctx: PluginInput): ToolDefinition {
	return tool({
		description: "Type text into the TUI. Each character is sent individually followed by no key.",
		args: {
			session: tool.schema.string().describe("The tmux session name"),
			text: tool.schema.string().describe("The text to type"),
			window: tool.schema.string().optional().describe("Window name (defaults to session name)"),
			pane: tool.schema.number().optional().default(0).describe("Pane index (default: 0)"),
		},
		execute: async (args) => {
			let success = true
			for (const char of args.text) {
				const result = await sendKeys(args.session, char, {
					windowName: args.window,
					paneIndex: args.pane ?? 0,
				})
				if (!result) success = false
			}

			return JSON.stringify({ success, typed: args.text.length + " characters" })
		},
	})
}

/**
 * tui_find — Find elements in the TUI layout
 */
export function createTuiFindTool(_ctx: PluginInput): ToolDefinition {
	return tool({
		description:
			"Find UI elements in the current TUI layout. " +
			"Use tui_snapshot first to capture the screen, then use this to search for specific elements.",
		args: {
			session: tool.schema.string().describe("The tmux session name"),
			type: tool.schema
				.enum(["button", "menu", "input", "panel", "text", "all"])
				.optional()
				.default("all")
				.describe("Type of elements to find"),
			text: tool.schema.string().optional().describe("Filter by text (partial match)"),
			window: tool.schema.string().optional().describe("Window name (defaults to session name)"),
			pane: tool.schema.number().optional().default(0).describe("Pane index (default: 0)"),
		},
		execute: async (args) => {
			const snapshot = await getSnapshot({ session: args.session, window: args.window, pane: args.pane })
			if (typeof snapshot === "string") {
				return snapshot
			}

			if (!snapshot.parsedLayout) {
				return JSON.stringify({ elements: [], message: "No layout parsed" })
			}

			let elements: TuiElement[] = snapshot.parsedLayout.elements

			// Filter by type
			if (args.type && args.type !== "all") {
				elements = elements.filter((e) => e.type === args.type)
			}

			// Filter by text
			if (args.text) {
				const searchText = args.text.toLowerCase()
				elements = elements.filter((e) => e.text.toLowerCase().includes(searchText))
			}

			return JSON.stringify({
				count: elements.length,
				elements: elements.map((e) => ({
					type: e.type,
					text: e.text,
					x: e.x,
					y: e.y,
					width: e.width,
					height: e.height,
					focused: e.isFocused,
					highlighted: e.isHighlighted,
				})),
			})
		},
	})
}

export function createTuiTools(ctx: PluginInput): Record<string, ToolDefinition> {
	return {
		tui_snapshot: createTuiSnapshotTool(ctx),
		tui_click: createTuiClickTool(ctx),
		tui_keys: createTuiKeysTool(ctx),
		tui_type: createTuiTypeTool(ctx),
		tui_find: createTuiFindTool(ctx),
	}
}
