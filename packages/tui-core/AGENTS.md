# tui-core -- TUI Interaction Primitives (Core)

## OVERVIEW

Harness-neutral tmux-based TUI interaction primitives: launching tmux sessions
running a command, capturing raw and parsed screen output, sending keyboard
input and mouse click events, and parsing terminal layout into clickable
elements. Package: `@oh-my-opencode/tui-core`.

## KEY FILES (4 source, all flat in `src/`)

| File         | Subpath export | Role                                                                                    |
| ------------ | -------------- | --------------------------------------------------------------------------------------- |
| `types.ts`   | `./types`      | `TuiSnapshot`, `TuiLayout`, `TuiElement`, `TuiLine`, session/click/key option types     |
| `explorer.ts`| `./explorer`   | Session lifecycle (`runTuiCommand`), screen capture, keyboard input, mouse clicks       |
| `parser.ts`  | `./parser`     | `parseLayout`: detects buttons, menus, input fields, panels, and text from ANSI output  |
| `index.ts`   | `.`            | Public re-exports                                                                       |

## CONSUMERS

- `omo-opencode/src/tools/tui/tools.ts` (primary): the omo `tui` tool.

## NOTES

- **tmux is the transport:** all interaction goes through `tmux`
  (`@oh-my-opencode/tmux-core`); there is no direct terminal control.
- **Element detection is heuristic**, driven by ANSI/box-drawing patterns;
  keep patterns in `parser.ts` only.
- Parent: [`packages/AGENTS.md`](../AGENTS.md).
