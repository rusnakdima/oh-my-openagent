---
name: drive-opencode-tui
description: "Drive OpenCode's TUI programmatically using tmux primitives. Use when testing TUI interactions, smoke-testing plugins, or verifying UI behavior. Primitives: launch, capture, click, type, wait-for-element. Triggers: drive opencode tui, test tui interaction, smoke test opencode, interact with opencode tui."
---

# drive-opencode-tui

Teach agents to programmatically drive OpenCode's TUI using tmux primitives,
enabling autonomous testing and verification.

## Core Primitives

### Session Lifecycle

```bash
# Launch OpenCode in isolated tmux session
tmux new-session -d -s <session_name> 'cd <project> && opencode'

# Kill session
tmux kill-session -t <session_name>
```

### Screen Capture

```bash
# Capture current pane content
tmux capture-pane -t <session> -p

# Capture with scrollback history
tmux capture-pane -t <session> -p -S -100

# Strip ANSI codes for parsing
tmux capture-pane -t <session> -p | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g'
```

### Input

```bash
# Type text
tmux send-keys -t <session> 'text to type' 

# Send Enter
tmux send-keys -t <session> Enter

# Send Ctrl+C
tmux send-keys -t <session> C-c

# Send Escape
tmux send-keys -t <session> Escape

# Send arrow keys
tmux send-keys -t <session> Down
tmux send-keys -t <session> Up
tmux send-keys -t <session> Left
tmux send-keys -t <session> Right

# Send Tab
tmux send-keys -t <session> Tab

# Mouse click at coordinates
tmux send-keys -t <session> "C-MouseDragN1 x y"
```

### Waiting

```bash
# Poll until pattern appears
for i in {1..20}; do
  if tmux capture-pane -t <session> -p | grep -q "PATTERN"; then
    echo "Found!"
    break
  fi
  sleep 1
done
```

## Standard Workflow

```
1. LAUNCH: tmux new-session → opencode
2. WAIT: Poll for boot marker (sessionID, agent name, version)
3. SNAPSHOT: tmux capture-pane → parse layout
4. ACT: tmux send-keys (type, Enter, Tab, Ctrl+C, etc.)
5. WAIT: Poll until expected state appears
6. VERIFY: Capture pane → check for expected content
7. CLEANUP: tmux kill-session
```

## Common Test Patterns

### Pattern 1: Smoke Test (Did it boot?)

```bash
tmux new-session -d -s omo-qa 'opencode'
for i in {1..30}; do
  cap=$(tmux capture-pane -t omo-qa -p)
  if echo "$cap" | grep -qE "ctrl\+p|agents|OpenCode|1\.18"; then
    echo "BOOTED"
    break
  fi
  sleep 1
done
tmux kill-session -t omo-qa
```

### Pattern 2: Send Slash Command

```bash
# Escape to clear any modal
tmux send-keys -t omo-qa Escape
sleep 0.5

# Type command
tmux send-keys -t omo-qa '/model'
sleep 0.5

# Submit
tmux send-keys -t omo-qa Enter
sleep 3

# Check for model picker (opens in separate tmux window)
if tmux list-windows -t omo-qa | grep -q "omo-menu"; then
  echo "Model picker opened!"
fi
```

### Pattern 3: Check Sidebar State

```bash
# Press Tab to switch to sidebar
tmux send-keys -t omo-qa Tab
sleep 1

# Capture sidebar content
sidebar=$(tmux capture-pane -t omo-qa -p)

# Check for agent roster
if echo "$sidebar" | grep -q "Sisyphus"; then
  echo "Roster visible"
fi
```

### Pattern 4: Interrupt Running Agent

```bash
tmux send-keys -t omo-qa C-c
sleep 2
tmux capture-pane -t omo-qa -p | grep -q "interrupt"
```

### Pattern 5: Interactive Menu Selection

```bash
# Model picker opens in separate window
menu_win=$(tmux list-windows -t omo-qa | grep omo-menu | cut -d: -f1)
if [ -n "$menu_win" ]; then
  # Type selection number
  tmux send-keys -t "omo-qa:$menu_win" '1'
  sleep 0.5
  tmux send-keys -t "omo-qa:$menu_win" Enter
fi
```

## XDG Isolation (IMPORTANT)

When testing OpenCode for QA, ALWAYS run in isolated XDG sandbox:

```bash
export XDG_DATA_HOME=$(mktemp -d)
export XDG_CONFIG_HOME=$(mktemp -d)
export XDG_STATE_HOME=$(mktemp -d)
export XDG_CACHE_HOME=$(mktemp -d)
export HOME=/home/dmitriy  # Keep HOME for config access

tmux new-session -d -s omo-qa 'opencode'
```

This prevents writing sessions to the real database at
`~/.local/share/opencode/`.

## Safety Rules

1. **Always kill tmux sessions** after test — orphaned sessions consume
   resources
2. **Use timeout polls** — never wait indefinitely for a state change
3. **Use isolated XDG** — never pollute real OpenCode database during QA
4. **Kill old sessions first** —
   `tmux kill-session -t <name> 2>/dev/null || true`

## Integration with oh-my-openagent

When testing oh-my-openagent plugin changes:

1. Build the plugin: `bun run build` in project root
2. OpenCode auto-loads from `dist/index.js` (file:// URL in
   `.opencode/opencode.json`)
3. Restart OpenCode to pick up changes
4. Run test pattern above
5. Check logs: `tail -f /tmp/oh-my-opencode.log`
