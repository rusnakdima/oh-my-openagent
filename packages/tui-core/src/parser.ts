/**
 * TUI Parser — Parses terminal output to identify UI elements
 *
 * Detects:
 * - Buttons (bracketed text, highlighted items)
 * - Menus (list of options)
 * - Input fields (prompts like "> ")
 * - Panels (boxed regions)
 * - Text content
 */

import type { TuiLayout, TuiLine, TuiElement } from "./types"

// ANSI escape sequence patterns
const ANSI_ESCAPE = /\x1b\[[0-9;]*[a-zA-Z]/g
const ANSI_RESET = "\x1b[0m"
const ANSI_BOLD = "\x1b[1m"
const ANSI_UNDERLINE = "\x1b[4m"
const ANSI_INVERSE = "\x1b[7m"
const ANSI_BRIGHT = "\x1b[9m"

// Common color codes
const ANSI_FG_BLACK = "\x1b[30m"
const ANSI_FG_RED = "\x1b[31m"
const ANSI_FG_GREEN = "\x1b[32m"
const ANSI_FG_YELLOW = "\x1b[33m"
const ANSI_FG_BLUE = "\x1b[34m"
const ANSI_FG_MAGENTA = "\x1b[35m"
const ANSI_FG_CYAN = "\x1b[36m"
const ANSI_FG_WHITE = "\x1b[37m"
const ANSI_BG_BLUE = "\x1b[44m"
const ANSI_BG_CYAN = "\x1b[46m"
const ANSI_BG_DEFAULT = "\x1b[49m"

// Button patterns
const BUTTON_PATTERNS = [
	/^\s*\[([^\]]+)\]\s*$/, // [Button Text]
	/^\s*<?(-+)>?\s*$/, // <----> or ----
	/^\s*[│├└─├┤┬┼┴─]+[│├└─├┤┬┼┴─\s]+[│├└─├┤┬┼┴─]+$/, // Box drawing characters
]

// Menu patterns
const MENU_PATTERN = /^\s*[•·○●✓✗◉◌]\s+(.+)$/

// Input prompt patterns
const INPUT_PATTERN = /^(.+?)\s*>\s*$/ // text > or text > space
const INPUT_PATTERN_RAW = /^>\s*/

// Panel/box patterns (using box-drawing characters)
const BOX_TOP = /^[│├┌┐┬└┘┴├┤┼─]+[─│├┌┐┬└┘┴├┤┼\s]+[─│├┌┐┬└┘┴├┤┼]+$/
const BOX_SINGLE = /^[┌─┐│┐└─└│├─┼┤└─┘│]$/
const BOX_DOUBLE = /^[╔═╗║╝╚║╠═╬╣║╚═╝║]$/

// Highlighted text patterns (inverted or bold)
const HIGHLIGHT_PATTERN = /\x1b\[[0-9;]*1m|\x1b\[[0-9;]*7m|\x1b\[[0-9;]*4m/g

/**
 * Strip ANSI escape sequences from a string
 */
export function stripAnsi(text: string): string {
	return text.replace(ANSI_ESCAPE, "")
}

/**
 * Check if a line has ANSI formatting
 */
function hasAnsi(text: string): boolean {
	return ANSI_ESCAPE.test(text)
}

/**
 * Check if a line is highlighted (bold, inverse, underline)
 */
function isHighlighted(text: string): boolean {
	return (
		text.includes(ANSI_BOLD) || text.includes(ANSI_INVERSE) || text.includes(ANSI_UNDERLINE) || text.includes(ANSI_BRIGHT)
	)
}

/**
 * Check if a line contains a button
 */
function detectButton(line: string): string | null {
	// Strip ANSI and box-drawing characters, normalize whitespace
	const clean = stripAnsi(line)
		.replace(/[│├┌┐┬└┘┴─├┤┼╔║╗╝╚╠═╬╣]+/g, " ") // Remove box characters
		.replace(/\s+/g, " ") // Normalize whitespace
		.trim()

	for (const pattern of BUTTON_PATTERNS) {
		const match = clean.match(pattern)
		if (match) {
			return match[1] ?? "[button]"
		}
	}

	// Also try a simpler pattern: text in brackets anywhere on the line
	const bracketMatch = clean.match(/\[([^\]]+)\]/)
	if (bracketMatch) {
		return bracketMatch[1]
	}

	return null
}

/**
 * Check if a line is a menu item
 */
function detectMenuItem(line: string): string | null {
	const match = line.match(MENU_PATTERN)
	return match ? match[1] : null
}

/**
 * Check if a line is an input prompt
 */
function detectInputPrompt(line: string): boolean {
	return INPUT_PATTERN.test(line) || INPUT_PATTERN_RAW.test(line)
}

/**
 * Check if a line is a panel border
 */
function detectPanelBorder(line: string): boolean {
	const clean = stripAnsi(line).trim()
	return BOX_TOP.test(clean) || BOX_SINGLE.test(clean) || BOX_DOUBLE.test(clean)
}

/**
 * Detect element type for a line
 */
function detectElementType(line: string, context: { prevLine?: string; nextLine?: string; index: number }): TuiElement["type"] {
	const clean = stripAnsi(line).trim()

	if (detectButton(line)) return "button"
	if (detectMenuItem(line)) return "menu"
	if (detectInputPrompt(line)) return "input"
	if (detectPanelBorder(line)) return "panel"

	// Check context
	if (context.prevLine && detectPanelBorder(context.prevLine)) {
		return "panel"
	}

	return "text"
}

/**
 * Parse raw terminal output into a structured layout
 */
export function parseLayout(rawOutput: string, width: number, height: number): TuiLayout {
	const lines = rawOutput.split("\n")

	const layoutLines: TuiLine[] = lines.map((content, index) => ({
		index,
		content,
		hasAnsi: hasAnsi(content),
	}))

	const elements: TuiElement[] = []

	// Track panel regions
	let inPanel = false
	let panelStartY = 0
	let panelStartX = 0

	for (let y = 0; y < lines.length; y++) {
		const line = lines[y]
		const cleanLine = stripAnsi(line)

		// Detect panel start
		if (detectPanelBorder(line)) {
			if (!inPanel) {
				inPanel = true
				panelStartY = y
				panelStartX = cleanLine.search(/[^-\s]/)
			}

			// Panel end (bottom border)
			if (y > panelStartY && detectPanelBorder(line)) {
				elements.push({
					type: "panel",
					text: "",
					x: panelStartX >= 0 ? panelStartX : 0,
					y: panelStartY,
					width: width,
					height: y - panelStartY + 1,
					isFocused: false,
					isHighlighted: false,
				})
				inPanel = false
			}
		}

		// Detect buttons
		const buttonText = detectButton(line)
		if (buttonText) {
			const x = cleanLine.indexOf(buttonText)
			elements.push({
				type: "button",
				text: buttonText,
				x: x >= 0 ? x : 0,
				y,
				width: buttonText.length,
				height: 1,
				isFocused: isHighlighted(line),
				isHighlighted: isHighlighted(line),
			})
		}

		// Detect menu items
		const menuText = detectMenuItem(line)
		if (menuText) {
			elements.push({
				type: "menu",
				text: menuText,
				x: 0,
				y,
				width: menuText.length,
				height: 1,
				isFocused: isHighlighted(line),
				isHighlighted: isHighlighted(line),
			})
		}

		// Detect input prompts
		if (detectInputPrompt(line)) {
			const match = line.match(INPUT_PATTERN)
			const label = match ? match[1] : ""
			elements.push({
				type: "input",
				text: label,
				x: 0,
				y,
				width: width,
				height: 1,
				isFocused: true,
				isHighlighted: false,
			})
		}
	}

	return {
		width,
		height,
		lines: layoutLines,
		elements,
	}
}

/**
 * Format layout as readable string for debugging
 */
export function formatLayout(layout: TuiLayout): string {
	const lines: string[] = []

	lines.push(`┌─ Layout: ${layout.width}x${layout.height} ─┐`)
	lines.push("")

	// Group elements by type
	const buttons = layout.elements.filter((e) => e.type === "button")
	const menus = layout.elements.filter((e) => e.type === "menu")
	const inputs = layout.elements.filter((e) => e.type === "input")
	const panels = layout.elements.filter((e) => e.type === "panel")

	if (panels.length > 0) {
		lines.push("Panels:")
		for (const p of panels) {
			lines.push(`  - Panel at (${p.x}, ${p.y}) size ${p.width}x${p.height}`)
		}
		lines.push("")
	}

	if (buttons.length > 0) {
		lines.push("Buttons:")
		for (const b of buttons) {
			const focus = b.isFocused ? " [FOCUSED]" : ""
			const highlight = b.isHighlighted ? " [HIGHLIGHTED]" : ""
			lines.push(`  - "${b.text}" at (${b.x}, ${b.y})${focus}${highlight}`)
		}
		lines.push("")
	}

	if (menus.length > 0) {
		lines.push("Menu items:")
		for (const m of menus) {
			const focus = m.isFocused ? " [FOCUSED]" : ""
			lines.push(`  - "${m.text}" at (${m.x}, ${m.y})${focus}`)
		}
		lines.push("")
	}

	if (inputs.length > 0) {
		lines.push("Input fields:")
		for (const i of inputs) {
			lines.push(`  - "${i.text}" at (${i.x}, ${i.y}) [ACTIVE]`)
		}
		lines.push("")
	}

	lines.push("└─────────────────────────────────────┘")

	return lines.join("\n")
}

/**
 * Search for element by partial text match
 */
export function findElementByTextMatch(elements: TuiElement[], text: string): TuiElement | null {
	const normalized = text.toLowerCase().trim()
	return elements.find((e) => e.text.toLowerCase().includes(normalized)) ?? null
}

/**
 * Get all buttons
 */
export function getButtons(elements: TuiElement[]): TuiElement[] {
	return elements.filter((e) => e.type === "button")
}

/**
 * Get focused element
 */
export function getFocusedElement(elements: TuiElement[]): TuiElement | null {
	return elements.find((e) => e.isFocused) ?? null
}
