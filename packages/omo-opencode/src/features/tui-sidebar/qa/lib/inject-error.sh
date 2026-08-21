#!/usr/bin/env bash
# inject-error.sh — inject mirror-file error conditions for TUI testing.
#
# Usage:
#   inject-error.sh corrupt <mirror-file>
#   inject-error.sh stale  <mirror-file>   # touch file with 10s-old mtime
#   inject-error.sh delete <mirror-file>
#   inject-error.sh restore <mirror-file>   # restore from backup (if available)
#
# Exit codes:
#   0  = operation succeeded
#   1  = mirror file not found (for corrupt/stale/delete)
#   2  = invalid arguments

set -uo pipefail

INJECT_MIRROR_BACKUP=""

inject_corrupt() {
  local mirror="$1"
  if [ ! -f "$mirror" ]; then
    printf 'FAIL: mirror file not found: %s\n' "$mirror" >&2
    return 1
  fi
  # Save backup before corrupting
  cp "$mirror" "${mirror}.backup" 2>/dev/null || true
  INJECT_MIRROR_BACKUP="${mirror}.backup"
  # Write clearly invalid JSON — mirror-io parseMirror() will reject this
  printf 'not valid json{\n' > "$mirror"
  printf 'LOG: mirror corrupted: %s\n' "$mirror" >&2
}

inject_stale() {
  local mirror="$1"
  if [ ! -f "$mirror" ]; then
    printf 'FAIL: mirror file not found: %s\n' "$mirror" >&2
    return 1
  fi
  # Save backup before modifying
  cp "$mirror" "${mirror}.backup" 2>/dev/null || true
  INJECT_MIRROR_BACKUP="${mirror}.backup"
  # Set mtime to 10 seconds ago (STALE_MS = 6000ms, so 10s is safely stale)
  local old_ts
  old_ts=$(( $(date +%s) - 10 ))
  touch -t "$(date -d "@$old_ts" '+%Y%m%d%H%M.%S')" "$mirror"
  printf 'LOG: mirror made stale (mtime 10s old): %s\n' "$mirror" >&2
}

inject_delete() {
  local mirror="$1"
  if [ -f "$mirror" ]; then
    # Save backup before deleting
    cp "$mirror" "${mirror}.backup" 2>/dev/null || true
    INJECT_MIRROR_BACKUP="${mirror}.backup"
    rm -f "$mirror"
    printf 'LOG: mirror deleted: %s\n' "$mirror" >&2
  else
    printf 'LOG: mirror already absent: %s\n' "$mirror" >&2
  fi
}

inject_restore() {
  local mirror="$1"
  if [ -f "${mirror}.backup" ]; then
    mv "${mirror}.backup" "$mirror"
    printf 'LOG: mirror restored from backup: %s\n' "$mirror" >&2
  else
    printf 'LOG: no backup found to restore: %s\n' "$mirror" >&2
  fi
}

usage() {
  printf 'usage: inject-error.sh corrupt|stale|delete|restore <mirror-file>\n' >&2
  exit 2
}

main() {
  local op="${1:-}"
  local mirror="${2:-}"

  if [ -z "$op" ] || [ -z "$mirror" ]; then
    usage
  fi

  case "$op" in
    corrupt) inject_corrupt "$mirror" ;;
    stale)  inject_stale  "$mirror" ;;
    delete) inject_delete "$mirror" ;;
    restore) inject_restore "$mirror" ;;
    *) usage ;;
  esac
}

main "$@"
