/**
 * TUI Explorer — Core tmux-based TUI interaction primitives
 *
 * Provides functions to:
 * - Launch tmux sessions running opencode or arbitrary commands
 * - Capture screen output (raw + parsed)
 * - Send keyboard input
 * - Send mouse click events at x,y coordinates
 * - Parse layout to identify clickable elements
 */

import { runTmuxCommand, type TmuxCommandResult } from "@oh-my-opencode/tmux-core"
import type {
	TuiSessionOptions,
	TuiSnapshot,
	TuiLayout,
	TuiElement,
	MouseClickOptions,
	KeyPressOptions,
	RunTuiCommandOptions,
} from "./types"
import { parseLayout } from "./parser"

const DEFAULT_TMUX_TIMEOUT = 5000

/**
 * Get the target string for tmux commands (session:window.pane)
 */
function getTarget(sessionName: string, windowName?: string, paneIndex = 0): string {
	const win = windowName ?? sessionName
	return `${win}.${paneIndex}`
}

/**
 * Run a tmux command with defaults
 */
async function runTuiCommand(args: string[], options: RunTuiCommandOptions = {}): Promise<TmuxCommandResult> {
	return runTmuxCommand("tmux", args, {
		timeoutMs: options.timeoutMs ?? DEFAULT_TMUX_TIMEOUT,
		retry: options.retry ?? 0,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Session Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new detached tmux session running opencode
 */
export async function launchOpenCodeSession(
	sessionName: string,
	options: { command?: string; workingDir?: string } = {},
): Promise<{ success: boolean; error?: string }> {
	const { command = "opencode", workingDir } = options

	// Kill existing session if present
	await runTuiCommand(["kill-session", "-t", sessionName])

	// Build the command with optional working directory
	const fullCommand = workingDir
		? `cd '${workingDir.replace(/'/g, "'\\''")}' && ${command}`
		: command

	// Create detached session with the command
	const result = await runTuiCommand([
		"new-session",
		"-d",
		"-s",
		sessionName,
		"-x",
		"800",
		"-y",
		"600",
		"--",
		"/bin/sh",
		"-c",
		fullCommand,
	])

	if (!result.success) {
		return { success: false, error: result.stderr || result.stdout }
	}

	// Enable mouse mode for click support
	await runTuiCommand(["set-option", "-t", sessionName, "mouse", "on"])

	// Wait for session to initialize
	await new Promise((r) => setTimeout(r, 500))

	return { success: true }
}

/**
 * Create a new window in an existing session
 */
export async function createTuiWindow(
	sessionName: string,
	windowName: string,
	command?: string,
): Promise<{ success: boolean; error?: string }> {
	const args = command
		? ["new-window", "-t", sessionName, "-n", windowName, "--", "/bin/sh", "-c", command]
		: ["new-window", "-t", sessionName, "-n", windowName]

	const result = await runTuiCommand(args)

	if (!result.success) {
		return { success: false, error: result.stderr }
	}

	return { success: true }
}

/**
 * Kill a tmux session
 */
export async function killTuiSession(sessionName: string): Promise<boolean> {
	const result = await runTuiCommand(["kill-session", "-t", sessionName])
	return result.success
}

/**
 * Check if a session exists
 */
export async function sessionExists(sessionName: string): Promise<boolean> {
	const result = await runTuiCommand(["has-session", "-t", sessionName])
	return result.success
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen Capture
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Capture the current screen content of a pane
 */
export async function captureScreen(
	sessionName: string,
	options: { windowName?: string; paneIndex?: number; stripAnsi?: boolean } = {},
): Promise<{ success: boolean; output?: string; error?: string }> {
	const { windowName, paneIndex = 0, stripAnsi = false } = options
	const target = getTarget(sessionName, windowName, paneIndex)

	// Capture pane content
	const result = await runTuiCommand([
		"capture-pane",
		"-t",
		target,
		"-p",
		...(stripAnsi ? ["|", "sed", "s/\\x1b\\[[0-9;]*[a-zA-Z]//g"] : []),
	])

	if (!result.success) {
		return { success: false, error: result.stderr }
	}

	return { success: true, output: result.stdout }
}

/**
 * Get pane dimensions
 */
export async function getPaneDimensions(
	sessionName: string,
	options: { windowName?: string; paneIndex?: number } = {},
): Promise<{ width: number; height: number } | null> {
	const { windowName, paneIndex = 0 } = options
	const target = getTarget(sessionName, windowName, paneIndex)

	const result = await runTuiCommand(["display-message", "-t", target, "-p", "#{pane_width} #{pane_height}"])

	if (!result.success) {
		return null
	}

	const [width, height] = result.stdout.split(" ").map(Number)
	return { width, height }
}

/**
 * Take a full snapshot with parsed layout
 */
export async function takeSnapshot(
	sessionName: string,
	options: { windowName?: string; paneIndex?: number } = {},
): Promise<TuiSnapshot | null> {
	const { windowName, paneIndex = 0 } = options

	const [captureResult, dimsResult] = await Promise.all([
		captureScreen(sessionName, { windowName, paneIndex }),
		getPaneDimensions(sessionName, { windowName, paneIndex }),
	])

	if (!captureResult.success || !dimsResult) {
		return null
	}

	const layout = parseLayout(captureResult.output ?? "", dimsResult.width, dimsResult.height)

	return {
		sessionName,
		windowName: windowName ?? sessionName,
		paneIndex,
		captureTime: Date.now(),
		rawOutput: captureResult.output ?? "",
		parsedLayout: layout,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Input Simulation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send keyboard keys to a pane
 */
export async function sendKeys(
	sessionName: string,
	keys: string | KeyPressOptions,
	options: { windowName?: string; paneIndex?: number } = {},
): Promise<boolean> {
	const { windowName, paneIndex = 0 } = options
	const target = getTarget(sessionName, windowName, paneIndex)

	let keyString: string
	let modifiers: string[] = []

	if (typeof keys === "string") {
		keyString = keys
	} else {
		keyString = keys.key
		modifiers = (keys.modifiers ?? []).map((m) => {
			switch (m) {
				case "ctrl":
					return "C"
				case "alt":
					return "M"
				case "shift":
					return "S"
				case "meta":
					return "A"
				default:
					return ""
			}
		})
	}

	const modifierPrefix = modifiers.length > 0 ? modifiers.join("-") + "-" : ""
	const fullKey = modifierPrefix + keyString

	const result = await runTuiCommand(["send-keys", "-t", target, fullKey])

	return result.success
}

/**
 * Send mouse click at x,y coordinates
 *
 * tmux sends mouse events as: C-MouseDragN1 x y
 * Left click: ButtonPress-1, ButtonRelease-1
 * Double click: DoubleClick-1
 */
export async function sendMouseClick(
	sessionName: string,
	options: MouseClickOptions & { windowName?: string; paneIndex?: number },
): Promise<boolean> {
	const { x, y, button = "left", type = "click", windowName, paneIndex = 0 } = options
	const target = getTarget(sessionName, windowName, paneIndex)

	// Build mouse event string
	const buttonCode = button === "left" ? "1" : button === "middle" ? "2" : "3"

	let eventType: string
	switch (type) {
		case "click":
			eventType = `ButtonPress-${buttonCode} ButtonRelease-${buttonCode}`
			break
		case "double-click":
			eventType = `DoubleClick-${buttonCode} ButtonRelease-${buttonCode}`
			break
		case "down":
			eventType = `ButtonPress-${buttonCode}`
			break
		case "up":
			eventType = `ButtonRelease-${buttonCode}`
			break
	}

	// tmux mouse events: C-MouseDragN1 x y
	const events = eventType.split(" ")
	let success = true

	for (const event of events) {
		const result = await runTuiCommand(["send-keys", "-t", target, "-l", `MouseDrag1 ${x} ${y}`])
		if (!result.success) {
			success = false
		}
	}

	return success
}

/**
 * Click on a specific element by its coordinates
 */
export async function clickOnElement(
	sessionName: string,
	element: TuiElement,
	options: { windowName?: string; paneIndex?: number } = {},
): Promise<boolean> {
	// Click in the center of the element
	const centerX = Math.floor(element.x + element.width / 2)
	const centerY = Math.floor(element.y + element.height / 2)

	return sendMouseClick(sessionName, { x: centerX, y: centerY, ...options })
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find an element by text (for programmatic clicking)
 */
export function findElementByText(layout: TuiLayout, text: string): TuiElement | null {
	const normalizedSearch = text.toLowerCase().trim()

	for (const element of layout.elements) {
		if (element.text.toLowerCase().includes(normalizedSearch)) {
			return element
		}
	}

	return null
}

/**
 * Find all elements matching a type
 */
export function findElementsByType(layout: TuiLayout, type: TuiElement["type"]): TuiElement[] {
	return layout.elements.filter((e) => e.type === type)
}

/**
 * Wait for the screen to change (poll until different from expected)
 */
export async function waitForScreenChange(
	sessionName: string,
	expectedOutput: string,
	options: {
		windowName?: string
		paneIndex?: number
		timeoutMs?: number
		pollIntervalMs?: number
	} = {},
): Promise<{ changed: boolean; currentOutput?: string }> {
	const { windowName, paneIndex = 0, timeoutMs = 30000, pollIntervalMs = 500 } = options

	const deadline = Date.now() + timeoutMs

	while (Date.now() < deadline) {
		const result = await captureScreen(sessionName, { windowName, paneIndex })

		if (result.success && result.output !== expectedOutput) {
			return { changed: true, currentOutput: result.output }
		}

		await new Promise((r) => setTimeout(r, pollIntervalMs))
	}

	const finalResult = await captureScreen(sessionName, { windowName, paneIndex })
	return { changed: finalResult.output !== expectedOutput, currentOutput: finalResult.output }
}
