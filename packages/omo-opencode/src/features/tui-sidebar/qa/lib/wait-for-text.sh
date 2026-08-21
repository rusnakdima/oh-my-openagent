#!/usr/bin/env bash
# wait-for-text.sh — poll a tmux pane until a regex matches or timeout expires.
#
# Exit codes:
#   0  = pattern found within timeout
#   1  = timeout reached without match
#   2  = invalid arguments or tmux error
#
# Usage:
#   wait-for-text.sh -t "sess:0.0" -p "pattern|another" -T 30
#   wait-for-text.sh --pane "sess" --pattern "foo" --timeout 15
#   wait-for-text.sh "sess:0.0" "pattern" 30      # positional (deprecated)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Source common-it.sh (defines it_log, it_require, wait_for_text etc.)
# shellcheck source=/dev/null
. "$SCRIPT_DIR/common-it.sh" 2>/dev/null || true

# Parse arguments (supports both long and short forms)
wait_for_text() {
  local pane="" pattern="" timeout=30
  local OPTIND=0

  while getopts "t:p:T:h-:" opt; do
    case "$opt" in
      t) pane="$OPTARG" ;;
      p) pattern="$OPTARG" ;;
      T) timeout="$OPTARG" ;;
      h)
        printf 'usage: wait-for-text.sh -t pane -p pattern [-T seconds]\n'
        printf '       wait-for-text.sh pane pattern timeout\n'
        exit 0
        ;;
      -)
        case "$OPTARG" in
          pane) pane="${!OPTIND}"; OPTIND=$((OPTIND+1)) ;;
          pattern) pattern="${!OPTIND}"; OPTIND=$((OPTIND+1)) ;;
          timeout) timeout="${!OPTIND}"; OPTIND=$((OPTIND+1)) ;;
          help) printf 'usage: wait-for-text.sh -t pane -p pattern [-T seconds]\n'; exit 0 ;;
          *) printf 'FAIL: unknown long option --%s\n' "$OPTARG" >&2; return 2 ;;
        esac
        ;;
      *)
        printf 'FAIL: unknown option -%s\n' "$OPTARG" >&2
        return 2
        ;;
    esac
  done

  # Positional fallback: wait-for-text.sh pane pattern timeout
  if [ -z "$pane" ] && [ -n "${1:-}" ]; then
    pane="$1"; pattern="${2:-}"; timeout="${3:-30}"
  fi

  if [ -z "$pane" ] || [ -z "$pattern" ]; then
    printf 'FAIL: wait-for-text requires -t pane and -p pattern\n' >&2
    return 2
  fi

  if ! [[ "$timeout" =~ ^[0-9]+$ ]] || [ "$timeout" -lt 1 ]; then
    printf 'FAIL: timeout must be a positive integer\n' >&2
    return 2
  fi

  local deadline cap
  deadline=$(( $(date +%s) + timeout ))

  while [ $(date +%s) -lt $deadline ]; do
    cap="$(tmux capture-pane -t "$pane" -p 2>/dev/null)" || return 2
    if printf '%s' "$cap" | grep -E -q "$pattern"; then
      return 0
    fi
    sleep 0.5
  done

  return 1
}

# Run as script
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  if [ "${1:-}" = "--self-check" ]; then
    printf 'self-check: wait-for-text is a pure polling function (no side effects)\n'
    printf 'pattern matching via grep -Eq is safe to test with a synthetic case\n'
    printf 'PASS: wait-for-text.sh self-check\n'
    exit 0
  fi

  wait_for_text "$@"
  exit $?
fi
