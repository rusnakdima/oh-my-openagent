#!/usr/bin/env bash
# tc5-mirror-deleted.sh — TC5: Mirror file deleted → graceful degradation.
#
# Expected: sidebar continues showing idle roster (from local config fallback),
# no crash, no error banner.

set -uo pipefail

tc5_FAILS=0

tc5_log() { printf '  [tc5] %s\n' "$*" >&2; }

case_main() {
  it_log "tc5: Mirror file deleted → graceful degradation"

  it_mk_isolated_xdg || { tc5_log "isolated xdg failed"; return 1; }
  write_project_config "$IT_PROJ" || { tc5_log "config write failed"; return 1; }

  it_start_server || { tc5_log "server start failed"; return 1; }
  it_tmux_start || { tc5_log "tmux start failed"; return 1; }

  local pane="$IT_TMUX_SESS"

  it_resolve_mirror

  # Wait for sidebar to appear — TUI shows "Agents" (active) or "Models" (idle)
  if ! wait_for_text -t "$pane" -p "Agents|tab agents|Models" -T 60; then
    tc5_log "timeout waiting for initial sidebar"
    asc_dump "$pane" "tc5-initial"
    tc5_FAILS=$((tc5_FAILS+1))
    return $tc5_FAILS
  fi
  tc5_log "sidebar appeared, mirror at $IT_MIRROR_FILE"

  sleep 2

  # Delete mirror file
  inject_delete "$IT_MIRROR_FILE" || {
    tc5_log "inject-error delete failed"
    tc5_FAILS=$((tc5_FAILS+1))
    return $tc5_FAILS
  }
  tc5_log "mirror deleted"

  # Wait for poll loop to notice the missing file
  sleep 3

  # Assert: sidebar still shows roster (degraded gracefully)
  if ! wait_for_text -t "$pane" -p "Agents|tab agents|Models" -T 5; then
    tc5_log "sidebar lost Models section after mirror deletion"
    asc_dump "$pane" "tc5-after-delete"
    tc5_FAILS=$((tc5_FAILS+1))
  else
    tc5_log "sidebar still showing Models section after deletion"
  fi

  # Assert: no config-invalid banner
  assert_no_broken_banner "$pane" || tc5_FAILS=$((tc5_FAILS+1))

  # Restore mirror before cleanup
  inject_restore "$IT_MIRROR_FILE" 2>/dev/null || true

  if [ "$tc5_FAILS" -eq 0 ]; then
    tc5_log "tc5 passed"
  else
    asc_dump "$pane" "tc5-final"
  fi

  return $tc5_FAILS
}
