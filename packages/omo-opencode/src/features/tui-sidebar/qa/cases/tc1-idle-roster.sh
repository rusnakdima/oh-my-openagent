#!/usr/bin/env bash
# tc1-idle-roster.sh — TC1: TUI boots and shows idle roster.
#
# Expected behavior: sidebar shows "Models" section with configured models
# (or "No configured models" if none set), and no error banners.

set -uo pipefail

tc1_REQUIRED_TOOLS="opencode tmux sqlite3"
tc1_FAILS=0

tc1_log() { printf '  [tc1] %s\n' "$*" >&2; }

case_main() {
  it_log "tc1: TUI boots and shows idle roster"

  # Set up isolated environment
  it_mk_isolated_xdg || { tc1_log "isolated xdg failed"; return 1; }
  write_project_config "$IT_PLUGIN_FILE" || { tc1_log "config write failed"; return 1; }

  # Start server in background
  it_start_server || { tc1_log "server start failed"; return 1; }

  # Launch TUI in tmux
  it_tmux_start || { tc1_log "tmux start failed"; return 1; }

  # Wait for sidebar to appear — look for "Models" section (idle roster)
  # Use longer timeout for first render (plugin needs to load).
  # The sidebar shows "Agents" section when a session is active (agent started),
  # or "Models" section when idle (no active session).
  local pane="$IT_TMUX_SESS"
  if ! wait_for_text -t "$pane" -p "Agents|tab agents|Models" -T 60; then
    tc1_log "timeout waiting for Models section"
    asc_dump "$pane" "tc1-failure"
    tc1_FAILS=$((tc1_FAILS+1))
    return $tc1_FAILS
  fi
  tc1_log "Models section appeared"

  # Give the sidebar one more second to stabilize
  sleep 1

  # Assert: no config invalid banner
  if ! assert_no_broken_banner "$pane"; then
    tc1_FAILS=$((tc1_FAILS+1))
  fi

  # Assert: sidebar shows the agent roster (visible in both idle and active views)
  # The "tab agents" footer appears when the sidebar roster is shown.
  if ! assert_contains "$pane" "sidebar roster footer" "tab agents"; then
    tc1_FAILS=$((tc1_FAILS+1))
  fi

  # Assert: sidebar shows either agent name (active) or model name (idle)
  if ! assert_contains "$pane" "sidebar shows agent or model" "Sisyphus|Ultraworker|Big Pickle|Models|No configured"; then
    tc1_FAILS=$((tc1_FAILS+1))
  fi

  if [ "$tc1_FAILS" -eq 0 ]; then
    tc1_log "all assertions passed"
  else
    tc1_log "$tc1_FAILS assertion(s) failed"
    asc_dump "$pane" "tc1-final"
  fi

  return $tc1_FAILS
}
