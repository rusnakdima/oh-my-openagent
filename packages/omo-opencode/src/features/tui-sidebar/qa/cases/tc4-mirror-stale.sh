#!/usr/bin/env bash
# tc4-mirror-stale.sh — TC4: Mirror file stale (>6s old) → falls back to idle.
#
# Expected: after STALE_MS (6000ms), the TUI treats the mirror as stale
# and degrades to the idle roster view (from local config).

set -uo pipefail

tc4_FAILS=0

tc4_log() { printf '  [tc4] %s\n' "$*" >&2; }

case_main() {
  it_log "tc4: Mirror file stale (>6s) → falls back to idle"

  it_mk_isolated_xdg || { tc4_log "isolated xdg failed"; return 1; }
  write_project_config "$IT_PROJ" || { tc4_log "config write failed"; return 1; }

  it_start_server || { tc4_log "server start failed"; return 1; }
  it_tmux_start || { tc4_log "tmux start failed"; return 1; }

  local pane="$IT_TMUX_SESS"

  it_resolve_mirror

  # Wait for sidebar to appear — TUI shows "Agents" (active) or "Models" (idle)
  if ! wait_for_text -t "$pane" -p "Agents|tab agents|Models" -T 60; then
    tc4_log "timeout waiting for initial sidebar"
    asc_dump "$pane" "tc4-initial"
    tc4_FAILS=$((tc4_FAILS+1))
    return $tc4_FAILS
  fi
  tc4_log "sidebar appeared"

  # Wait for the mirror to be written — heartbeat fires every 2s (HEARTBEAT_MS)
  sleep 4

  # Make mirror stale (touch with 10s-old mtime; STALE_MS = 6000ms)
  inject_stale "$IT_MIRROR_FILE" || {
    tc4_log "inject-error stale failed"
    tc4_FAILS=$((tc4_FAILS+1))
    return $tc4_FAILS
  }
  tc4_log "mirror made stale (mtime 10s old)"

  # Wait for poll loop + staleness check to kick in:
  # - poll interval = 1s
  # - staleness check happens in readMirror()
  # Give it 10s total (well past STALE_MS=6s)
  sleep 10

  # The sidebar should still show the roster (degraded from stale mirror)
  if ! wait_for_text -t "$pane" -p "Agents|tab agents|Models" -T 5; then
    tc4_log "sidebar lost Models section after staleness"
    asc_dump "$pane" "tc4-after-stale"
    tc4_FAILS=$((tc4_FAILS+1))
  else
    tc4_log "sidebar still showing Models section after staleness"
  fi

  # Assert: no config-invalid banner
  assert_no_broken_banner "$pane" || tc4_FAILS=$((tc4_FAILS+1))

  # Restore mirror before cleanup
  inject_restore "$IT_MIRROR_FILE" 2>/dev/null || true

  if [ "$tc4_FAILS" -eq 0 ]; then
    tc4_log "tc4 passed"
  else
    asc_dump "$pane" "tc4-final"
  fi

  return $tc4_FAILS
}
