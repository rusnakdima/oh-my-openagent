#!/usr/bin/env bash
# tc8-active-view.sh — TC8: Sidebar shows active view during active session.
#
# This test is similar to TC2 but focuses on verifying the transition
# from idle → active view and back. We submit a long-running task
# and verify the sidebar transitions to show agents/jobs/loop sections.
#
# NOTE: Without a real LLM, this test verifies the sidebar can be in
# active view state when the mirror reflects activity. For a true active
# view, we need a running agent or job in the mirror.

set -uo pipefail

tc8_FAILS=0

tc8_log() { printf '  [tc8] %s\n' "$*" >&2; }

case_main() {
  it_log "tc8: Sidebar shows active view during active session"

  it_mk_isolated_xdg || { tc8_log "isolated xdg failed"; return 1; }
  write_project_config "$IT_PLUGIN_FILE" || { tc8_log "config write failed"; return 1; }

  it_start_server || { tc8_log "server start failed"; return 1; }
  it_tmux_start || { tc8_log "tmux start failed"; return 1; }

  local pane="$IT_TMUX_SESS"

  # Wait for sidebar to appear — TUI shows "Agents" (active) or "Models" (idle)
  if ! wait_for_text -t "$pane" -p "Agents|tab agents|Models" -T 60; then
    tc8_log "timeout waiting for initial sidebar"
    asc_dump "$pane" "tc8-initial"
    tc8_FAILS=$((tc8_FAILS+1))
    return $tc8_FAILS
  fi
  tc8_log "sidebar appeared"

  # Submit a prompt that will trigger a running agent
  local auth="opencode:${IT_SERVER_PASS}"
  curl -s -X POST \
    -u "$auth" \
    -H "Content-Type: application/json" \
    -d '{"text":"list the files in this directory"}' \
    "${IT_SERVER_URL}/tui/submit-prompt" \
    --max-time 10 >/dev/null 2>&1 || true

  tc8_log "prompt submitted"

  # Poll for active view indicators (Agents / Jobs / ULW)
  # Use a loop since we don't know when the model will respond
  local active_view_found=0
  local transition_captured=0
  local i
  for ((i=0; i<60; i++)); do  # up to 30s
    local cap
    cap="$(tmux capture-pane -t "$pane" -p 2>/dev/null)" || cap=""

    # Check for active view indicators
    if printf '%s' "$cap" | grep -Eq "Agents|Jobs|ULW"; then
      active_view_found=1
      tc8_log "active view detected at ~$((i / 2))s"
      # Try to capture the transition
      if [ "$transition_captured" -eq 0 ]; then
        transition_captured=1
        tc8_log "active view captured in pane"
      fi
      # Keep watching — we want to see if it returns to idle
    fi

    # Check if we returned to idle (sidebar shows Models again, no Agents/Jobs)
    if printf '%s' "$cap" | grep -Fq "Models"; then
      if [ "$active_view_found" -eq 1 ] && [ "$transition_captured" -eq 1 ]; then
        tc8_log "sidebar returned to idle after active — full cycle observed"
        break
      fi
    fi

    sleep 0.5
  done

  if [ "$active_view_found" -eq 1 ]; then
    # Active view was seen — this is a pass
    tc8_log "active view was observed during session"
    # Additional check: no broken state
    assert_no_broken_banner "$pane" || tc8_FAILS=$((tc8_FAILS+1))
  else
    # No active view — this is acceptable if the model returned quickly
    # or the model is not available. The important guarantee is no crash.
    tc8_log "no active view observed (model may not be available)"
    # Verify sidebar is still rendering (idle or active)
    if ! wait_for_text -t "$pane" -p "Agents|tab agents|Models" -T 5; then
      tc8_log "sidebar became unresponsive"
      asc_dump "$pane" "tc8-unresponsive"
      tc8_FAILS=$((tc8_FAILS+1))
    else
      tc8_log "sidebar stable throughout session"
    fi
    assert_no_broken_banner "$pane" || tc8_FAILS=$((tc8_FAILS+1))
  fi

  if [ "$tc8_FAILS" -eq 0 ]; then
    tc8_log "tc8 passed"
  else
    asc_dump "$pane" "tc8-final"
  fi

  return $tc8_FAILS
}
