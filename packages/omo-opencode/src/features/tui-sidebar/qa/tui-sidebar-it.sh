#!/usr/bin/env bash
# tui-sidebar-it.sh — TUI sidebar integration test runner.
#
# Runs all test cases (or a named subset) for the oh-my-openagent TUI sidebar
# in a fully isolated XDG sandbox. Each case drives opencode serve via its
# HTTP TUI control API, manipulates the mirror file, and asserts sidebar
# state via tmux pane capture.
#
# Usage:
#   tui-sidebar-it.sh              # run all cases
#   tui-sidebar-it.sh tc1 tc3      # run specific cases
#   tui-sidebar-it.sh --self-check # dependency check + self-test
#   tui-sidebar-it.sh --list       # list available cases

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
CASES_DIR="$SCRIPT_DIR/cases"

. "$LIB_DIR/common-it.sh"
. "$LIB_DIR/assert-sidebar.sh"

# Resolve plugin dist path (built artifact)
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "")"
if [ -z "$REPO_ROOT" ]; then
  it_log "ERROR: not in a git repo — cannot resolve REPO_ROOT"
  exit 1
fi
PLUGIN_FILE="$REPO_ROOT/dist/index.js"
if [ ! -f "$PLUGIN_FILE" ]; then
  it_log "WARN: plugin dist not found at $PLUGIN_FILE — building..."
  (cd "$REPO_ROOT" && bun run build 2>&1 | tail -5) || true
fi

# Build the cases list
LIST_CASES=(
  tc1-idle-roster
  tc2-active-session
  tc3-mirror-corrupt
  tc4-mirror-stale
  tc5-mirror-deleted
  tc6-broken-config
  tc7-model-picker
  tc8-active-view
)

# ---- entry point -----------------------------------------------------------

list_cases() {
  printf 'Available test cases:\n'
  for c in "${LIST_CASES[@]}"; do
    printf '  %s\n' "$c"
  done
}

run_case() {
  local case_name="$1"
  # Resolve short name (tc1) to full name (tc1-idle-roster) via prefix match
  local full_name=""
  for cn in "${LIST_CASES[@]}"; do
    if [ "$cn" = "$case_name" ] || [ "${cn%%-*}" = "${case_name%%-*}" ]; then
      full_name="$cn"
      break
    fi
  done
  if [ -z "$full_name" ]; then
    it_fail "unknown case: $case_name"
    return 1
  fi
  local case_script="$CASES_DIR/${full_name}.sh"
  if [ ! -f "$case_script" ]; then
    it_fail "case not found: $full_name ($case_script)"
    return 1
  fi
  it_log "=== Running: $case_name ==="
  # Source the case script in a subshell so it inherits functions + globals.
  # IT_PLUGIN_FILE is set so common-it.sh's write_project_config() can use it.
  # SCRIPT_DIR/LIB_DIR/CASES_DIR don't survive subshells (unexported), so
  # re-derive from BASH_SOURCE[0] which is the main script path.
  (
    export IT_PLUGIN_FILE="$PLUGIN_FILE"
    export IT_CASE_FULL_NAME="$full_name"
    local sd
    sd="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" && export SCRIPT_DIR="$sd"
    # shellcheck source=/dev/null
    . "$SCRIPT_DIR/lib/common-it.sh"
    . "$SCRIPT_DIR/lib/assert-sidebar.sh"
    # shellcheck source=/dev/null
    . "$SCRIPT_DIR/cases/${IT_CASE_FULL_NAME}.sh"
    case_main
  )
  local rc=$?
  if [ $rc -eq 0 ]; then
    it_pass "$case_name"
  else
    it_fail "$case_name (exit $rc)"
  fi
  return $rc
}

run_all_cases() {
  local failed=0
  for case_name in "${LIST_CASES[@]}"; do
    run_case "$case_name" || failed=$((failed+1))
  done
  return $failed
}

main() {
  local mode="all"
  local cases=()

  # Parse arguments
  while [ $# -gt 0 ]; do
    case "$1" in
      --list)  list_cases; exit 0 ;;
      --self-check)
        echo "=== self-check ==="
        # Check dependencies
        it_require opencode tmux sqlite3 jq python3 shasum openssl || {
          echo "FAIL: missing dependencies"; exit 1
        }
        echo "PASS: dependencies present"
        # Run lib self-checks
        bash "$LIB_DIR/common-it.sh" --self-check || exit 1
        bash "$LIB_DIR/wait-for-text.sh" --self-check || exit 1
        echo "PASS: all self-checks"
        exit 0
        ;;
      --help|-h)
        echo "Usage: tui-sidebar-it.sh [case...]"
        echo "       tui-sidebar-it.sh --self-check"
        echo "       tui-sidebar-it.sh --list"
        list_cases
        exit 0
        ;;
      tc*)
        cases+=("$1"); mode="selected"
        ;;
      *)
        echo "Unknown argument: $1" >&2
        list_cases
        exit 1
        ;;
    esac
    shift
  done

  # Require tmux + opencode
  it_require opencode tmux || {
    echo "FAIL: missing required tools (opencode, tmux)" >&2
    exit 1
  }

  # Check plugin dist
  if [ ! -f "$PLUGIN_FILE" ]; then
    echo "FAIL: plugin dist not found at $PLUGIN_FILE (run 'bun run build' first)" >&2
    exit 1
  fi

  echo "=== TUI Sidebar Integration Tests ==="
  echo "Plugin: $PLUGIN_FILE"
  echo "Repo:   $REPO_ROOT"

  local failed=0
  if [ "$mode" = "all" ]; then
    run_all_cases || failed=$?
  else
    for c in "${cases[@]}"; do
      run_case "$c" || failed=$((failed+1))
    done
  fi

  echo ""
  if [ "$failed" -eq 0 ]; then
    echo "=== ALL PASSED ==="
    exit 0
  else
    echo "=== $failed CASE(S) FAILED ==="
    exit 1
  fi
}

main "$@"
