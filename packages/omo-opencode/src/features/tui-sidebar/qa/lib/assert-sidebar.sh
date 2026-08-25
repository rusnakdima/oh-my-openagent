#!/usr/bin/env bash
# assert-sidebar.sh — assert sidebar content from tmux pane capture.
#
# These functions capture the tmux pane and run regex/fgrep assertions.
# They print PASS/FAIL with context on failure.
#
# Usage:
#   . "$SCRIPT_DIR/lib/assert-sidebar.sh"
#   assert_contains "$TMUX_PANE" "description" "pattern"
#   assert_not_contains "$TMUX_PANE" "description" "pattern"

# Capture the tmux pane into a local variable (avoids repeated capture).
# Args: pane session-id (or full pane id)
# Returns: the captured text in the global ASC_PANE variable
asc_capture() {
  local pane="$1"
  ASC_PANE="$(tmux capture-pane -t "$pane" -p 2>/dev/null || echo "")"
  export ASC_PANE
}

# Assert that the captured pane contains a match for the pattern (grep -E -q = extended regex).
# Args: pane description pattern
# Returns: 0 if found, 1 if not found
assert_contains() {
  local pane="$1" label="$2" pattern="$3"
  local cap
  cap="$(tmux capture-pane -t "$pane" -p 2>/dev/null)" || cap=""
  if printf '%s' "$cap" | grep -E -q "$pattern"; then
    printf 'PASS: %s\n' "$label"
    return 0
  else
    printf 'FAIL: %s — expected to find: %s\n' "$label" "$pattern" >&2
    printf 'Pane (last 12 lines):\n' >&2
    printf '%s\n' "$cap" | tail -12 >&2
    return 1
  fi
}

# Assert that the captured pane does NOT contain a match.
# Args: pane description pattern
assert_not_contains() {
  local pane="$1" label="$2" pattern="$3"
  local cap
  cap="$(tmux capture-pane -t "$pane" -p 2>/dev/null)" || cap=""
  if printf '%s' "$cap" | grep -E -q "$pattern"; then
    printf 'FAIL: %s — unexpected presence of: %s\n' "$label" "$pattern" >&2
    printf 'Pane (last 12 lines):\n' >&2
    printf '%s\n' "$cap" | tail -12 >&2
    return 1
  else
    printf 'PASS: %s\n' "$label"
    return 0
  fi
}

# Assert that the sidebar shows the idle view (model roster).
# Checks for "Models" section header and roster rows.
# Args: pane session-id
assert_idle_roster() {
  local pane="$1"
  local fails=0
  assert_contains "$pane" "idle roster: Models section" "Models" || fails=$((fails+1))
  return $fails
}

# Assert that the sidebar shows an active view (agents/jobs/loop).
# Args: pane session-id
assert_active_view() {
  local pane="$1"
  local fails=0
  assert_contains "$pane" "active view: Agents section" "Agents" || fails=$((fails+1))
  return $fails
}

# Assert that the sidebar shows a broken view (config error).
# Args: pane session-id
assert_broken_view() {
  local pane="$1"
  local fails=0
  assert_contains "$pane" "broken view: config invalid banner" "config invalid" || fails=$((fails+1))
  return $fails
}

# Assert that the sidebar shows no error banners (broken/config-invalid).
# Args: pane session-id
assert_no_broken_banner() {
  local pane="$1"
  local fails=0
  assert_not_contains "$pane" "no config-invalid banner" "config invalid" || fails=$((fails+1))
  return $fails
}

# Assert that a configured model appears in the roster.
# Args: pane session-id model-name
assert_model_in_roster() {
  local pane="$1" model="$2"
  assert_contains "$pane" "model in roster: $model" "$model"
}

# Assert that a job title appears in the Jobs section.
# Args: pane session-id job-title-fragment
assert_job_in_board() {
  local pane="$1" title="$2"
  assert_contains "$pane" "job in board: $title" "$title"
}

# Assert that an agent name appears in the Agents section.
# Args: pane session-id agent-name
assert_agent_in_list() {
  local pane="$1" agent="$2"
  assert_contains "$pane" "agent in list: $agent" "$agent"
}

# Assert that the ULW loop section is visible.
# Args: pane session-id
assert_loop_section() {
  local pane="$1"
  assert_contains "$pane" "ULW loop section" "ULW"
}

# Assert that the Set Global Model button is visible.
# Args: pane session-id
assert_set_global_button() {
  local pane="$1"
  assert_contains "$pane" "Set Global Model button" "Set Global Model"
}

# Wait for the sidebar to stabilize (no rapid re-renders).
# Args: pane timeout-seconds
# Returns: 0 if pane content is stable, 1 if timeout
wait_for_stable_sidebar() {
  local pane="$1" timeout="${2:-10}"
  local deadline cap1 cap2
  deadline=$(( $(date +%s) + timeout ))
  while [ $(date +%s) -lt $deadline ]; do
    cap1="$(tmux capture-pane -t "$pane" -p 2>/dev/null)" || cap1=""
    sleep 1
    cap2="$(tmux capture-pane -t "$pane" -p 2>/dev/null)" || cap2=""
    if [ "$cap1" = "$cap2" ]; then
      return 0
    fi
  done
  return 1
}

# Capture and print the sidebar section for debugging.
# Args: pane label
asc_dump() {
  local pane="$1" label="${2:-pane}"
  local cap
  cap="$(tmux capture-pane -t "$pane" -p 2>/dev/null)" || cap="(empty)"
  printf -- '--- %s ---\n%s\n--- end ---\n' "$label" "$cap" >&2
}
