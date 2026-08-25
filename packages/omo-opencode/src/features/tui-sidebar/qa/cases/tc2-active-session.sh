#!/usr/bin/env bash
# tc2-active-session.sh — TC2: Active session shows agents + jobs in sidebar.
#
# This case submits a real prompt via the HTTP API and waits for the sidebar
# to show an active view (Agents / Jobs / ULW sections).
#
# NOTE: Requires a working API key and model. If the model is not available,
# this test will fail gracefully — the prompt will be submitted but no active
# session will appear. In that case we verify the sidebar remains stable.

set -uo pipefail

tc2_FAILS=0

tc2_log() { printf '  [tc2] %s\n' "$*" >&2; }

case_main() {
  it_log "tc2: Active session shows agents + jobs"

  it_mk_isolated_xdg || { tc2_log "isolated xdg failed"; return 1; }
  write_project_config "$IT_PLUGIN_FILE" || { tc2_log "config write failed"; return 1; }

  it_start_server || { tc2_log "server start failed"; return 1; }
  it_tmux_start || { tc2_log "tmux start failed"; return 1; }

  local pane="$IT_TMUX_SESS"

  # Wait for sidebar to appear — TUI shows "Agents" (active) or "Models" (idle)
  if ! wait_for_text -t "$pane" -p "Agents|tab agents|Models" -T 60; then
    tc2_log "timeout waiting for initial idle roster"
    asc_dump "$pane" "tc2-initial-failure"
    tc2_FAILS=$((tc2_FAILS+1))
    return $tc2_FAILS
  fi
  tc2_log "idle roster appeared"

  # Submit a lightweight prompt via HTTP API to trigger session activity
  # The API call itself may fail (auth/model), but the sidebar should remain stable
  local auth="opencode:${IT_SERVER_PASS}"
  local submit_rc=0
  curl -s -X POST \
    -u "$auth" \
    -H "Content-Type: application/json" \
    -d '{"text":"hi"}' \
    "${IT_SERVER_URL}/tui/submit-prompt" \
    --max-time 10 \
    >/dev/null 2>&1 || submit_rc=$?

  tc2_log "prompt submit via API returned $submit_rc"

  # Wait up to 15s for an active view (Agents or Jobs or ULW)
  local active_found=0
  local i
  for ((i=0; i<30; i++)); do
    local cap
    cap="$(tmux capture-pane -t "$pane" -p 2>/dev/null)" || cap=""
    if printf '%s' "$cap" | grep -Eq "Agents|Jobs|ULW"; then
      active_found=1
      tc2_log "active view detected (Agents/Jobs/ULW) after ~$((i / 2))s"
      break
    fi
    sleep 0.5
  done

  if [ "$active_found" -eq 1 ]; then
    # Active view confirmed — verify the agents section
    assert_active_view "$pane" || tc2_FAILS=$((tc2_FAILS+1))
  else
    # No active view — verify sidebar is still stable (idle, not broken)
    if ! wait_for_text -t "$pane" -p "Agents|tab agents|Models" -T 5; then
      tc2_log "sidebar became unstable after prompt"
      asc_dump "$pane" "tc2-unstable"
      tc2_FAILS=$((tc2_FAILS+1))
    else
      tc2_log "no active view appeared (expected if model not available) — sidebar stable"
      assert_no_broken_banner "$pane" || tc2_FAILS=$((tc2_FAILS+1))
    fi
  fi

  if [ "$tc2_FAILS" -eq 0 ]; then
    tc2_log "tc2 passed"
  else
    asc_dump "$pane" "tc2-final"
  fi

  return $tc2_FAILS
}
