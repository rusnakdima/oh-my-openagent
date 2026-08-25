#!/usr/bin/env bash
# tc3-mirror-corrupt.sh — TC3: Mirror file corrupted → graceful degradation.
#
# Expected: sidebar continues showing idle roster (or last valid state),
# no crash, no error banner, or error banner clears within STALE_MS.

set -uo pipefail

tc3_FAILS=0

tc3_log() { printf '  [tc3] %s\n' "$*" >&2; }

case_main() {
  it_log "tc3: Mirror file corrupted → graceful degradation"

  it_mk_isolated_xdg || { tc3_log "isolated xdg failed"; return 1; }
  write_project_config "$IT_PLUGIN_FILE" || { tc3_log "config write failed"; return 1; }

  it_start_server || { tc3_log "server start failed"; return 1; }
  it_tmux_start || { tc3_log "tmux start failed"; return 1; }

  local pane="$IT_TMUX_SESS"

  # Resolve mirror path
  it_resolve_mirror

  # Wait for sidebar to appear — TUI shows "Agents" (active) or "Models" (idle)
  if ! wait_for_text -t "$pane" -p "Agents|tab agents|Models" -T 60; then
    tc3_log "timeout waiting for initial sidebar"
    asc_dump "$pane" "tc3-initial"
    tc3_FAILS=$((tc3_FAILS+1))
    return $tc3_FAILS
  fi
  tc3_log "sidebar appeared, mirror at $IT_MIRROR_FILE"

  # Give the mirror a moment to stabilize — heartbeat fires every 2s (HEARTBEAT_MS)
  # so we need >2s to guarantee at least one heartbeat flush has run
  sleep 4

  # Inject corrupt mirror
  it_seed_mirror
  inject_corrupt "$IT_MIRROR_FILE" || {
    tc3_log "inject-error corrupt failed"
    tc3_FAILS=$((tc3_FAILS+1))
    return $tc3_FAILS
  }
  tc3_log "mirror corrupted"

  # Wait for poll loop to pick up the corruption (poll interval = 1s)
  # The readMirror() will return null on parse error, degrading to idle
  sleep 3

  # Assert: sidebar still shows roster (degraded gracefully)
  if ! wait_for_text -t "$pane" -p "Agents|tab agents|Models" -T 5; then
    tc3_log "sidebar lost Models section after mirror corruption"
    asc_dump "$pane" "tc3-after-corrupt"
    tc3_FAILS=$((tc3_FAILS+1))
  else
    tc3_log "sidebar still showing Models section after corruption"
  fi

  # Assert: no config-invalid banner (or it cleared within STALE_MS)
  # We allow a brief appearance but it should stabilize to idle
  sleep 2
  if ! assert_no_broken_banner "$pane"; then
    tc3_log "config-invalid banner present after corruption (may be transient)"
    # Don't fail on transient banners — only fail if still broken after grace period
    sleep 3
    if ! assert_no_broken_banner "$pane"; then
      tc3_FAILS=$((tc3_FAILS+1))
    fi
  fi

  # Restore mirror before cleanup
  inject_restore "$IT_MIRROR_FILE" 2>/dev/null || true

  if [ "$tc3_FAILS" -eq 0 ]; then
    tc3_log "tc3 passed"
  else
    asc_dump "$pane" "tc3-final"
  fi

  return $tc3_FAILS
}
