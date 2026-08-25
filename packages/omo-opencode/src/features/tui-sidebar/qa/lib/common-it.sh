#!/usr/bin/env bash
# common-it.sh - shared helpers for tui-sidebar integration tests.
#
# Reuses the opencode-qa isolation primitives (oqa_mk_isolated_xdg etc.)
# and adds TUI-specific helpers: server lifecycle, mirror path derivation,
# and tmux session management.
#
# Source it from the parent script:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   . "$SCRIPT_DIR/lib/common-it.sh"

set -uo pipefail

IT_TMUX_SESSIONS=()
IT_TMPDIRS=()
IT_SERVER_PID=""
IT_SERVER_URL=""
IT_SERVER_PASS=""
IT_XDG_ROOT=""
IT_PROJ=""
IT_MIRROR_FILE=""

# Logging
it_log()  { printf 'LOG: %s\n' "$*" >&2; }
it_pass() { printf 'PASS: %s\n' "$*"; }
it_fail() { printf 'FAIL: %s\n' "$*" >&2; }

# ---- dependencies -----------------------------------------------------------

it_require() {
  local missing=0 b
  for b in "$@"; do
    if ! command -v "$b" >/dev/null 2>&1; then
      it_log "missing dependency: $b"
      missing=1
    fi
  done
  return "$missing"
}

# ---- isolation --------------------------------------------------------------

# Create isolated XDG sandbox for the test. Unlike oqa_mk_isolated_xdg, this
# also creates IT_PROJ and exports IT_MIRROR_FILE (empty — resolved after
# project dir is set up).
it_mk_isolated_xdg() {
  local real_home="$HOME"
  local root
  root="$(mktemp -d -t it-xdg.XXXXXX)" || return 1
  IT_TMPDIRS+=("$root")
  mkdir -p "$root/data" "$root/config" "$root/cache" "$root/state" "$root/home" "$root/proj"

  # Preserve HOME-based opencode shims after HOME is sandboxed
  if [ -d "$real_home/.opencode/bin" ]; then
    mkdir -p "$root/home/.opencode"
    ln -s "$real_home/.opencode/bin" "$root/home/.opencode/bin" 2>/dev/null || true
  fi

  export HOME="$root/home"
  export XDG_DATA_HOME="$root/data"
  export XDG_CONFIG_HOME="$root/config"
  export XDG_CACHE_HOME="$root/cache"
  export XDG_STATE_HOME="$root/state"
  export OPENCODE_DISABLE_AUTOUPDATE=1
  export OPENCODE_DISABLE_MODELS_FETCH=1

  IT_XDG_ROOT="$root"
  IT_PROJ="$root/proj"
  export IT_PROJ

  it_log "isolated XDG root: $root"
}

# Derive the mirror file path for the given project directory.
# Mirrors the TypeScript logic in mirror-path.ts:
#   sha1(projectDir :: realpath)[0:16] → stored under
#   $XDG_DATA_HOME/opencode/storage/oh-my-openagent/tui-state/{hash}.json
it_mirror_path() {
  local proj_dir="${1:-"$IT_PROJ"}"
  local canon
  canon="$(realpath "$proj_dir" 2>/dev/null || echo "$proj_dir")"
  local hash
  hash="$(printf '%s' "$canon" | shasum -a 1 | cut -d' ' -f1 | cut -c1-16)"
  local mirror_dir="$XDG_DATA_HOME/opencode/storage/oh-my-openagent/tui-state"
  echo "$mirror_dir/${hash}.json"
}

# Resolve IT_MIRROR_FILE after IT_PROJ is set.
it_resolve_mirror() {
  IT_MIRROR_FILE="$(it_mirror_path "$IT_PROJ")"
  export IT_MIRROR_FILE
  it_log "mirror file: $IT_MIRROR_FILE"
}

# Seed a minimal VALID mirror snapshot if the plugin has not written one yet.
# The heartbeat only persists on activity; corrupt/stale injections need an
# existing file to mutate. Schema mirrors snapshot-schema.ts (version 3).
it_seed_mirror() {
  if [ -s "$IT_MIRROR_FILE" ]; then
    return 0
  fi
  mkdir -p "$(dirname "$IT_MIRROR_FILE")"
  printf '%s' "{\"version\":3,\"projectDir\":\"$IT_PROJ\",\"updatedAt\":$(date +%s000),\"activeAgents\":[],\"jobBoard\":[],\"loop\":null,\"tuiSelectedModel\":null,\"perAgentModels\":{}}" \
    > "$IT_MIRROR_FILE"
}

# ---- server lifecycle -------------------------------------------------------

# Start opencode serve under the isolated XDG sandbox.
# Sets IT_SERVER_URL / IT_SERVER_PASS / IT_SERVER_PID.
it_start_server() {
  local port
  port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()' 2>/dev/null || echo $(( (RANDOM % 20000) + 40000 )))"
  local pass="it-$(openssl rand -hex 8 2>/dev/null || echo "${RANDOM}${RANDOM}")"

  local logfile="$XDG_STATE_HOME/serve.log"
  mkdir -p "$(dirname "$logfile")"

  # Run the server with cwd=IT_PROJ so every process (server + TUI) resolves
  # the SAME project directory — mirror hashes and config chains stay in sync,
  # and the repo's own .opencode/tui.json (whose dist/index.js entry silently
  # breaks TUI plugin loading) is out of scope.
  export OPENCODE_SERVER_PASSWORD="$pass"
  nohup bash -c \
    "cd '$IT_PROJ' && exec opencode serve --port '$port' --hostname 127.0.0.1" \
    >"$logfile" 2>&1 &
  IT_SERVER_PID=$!

  export IT_SERVER_PORT="$port"
  export IT_SERVER_PASS="$pass"
  export IT_SERVER_URL="http://127.0.0.1:$port"

  # Wait for server to be ready (up to 90s — plugin loading can be slow)
  local deadline=$(($(date +%s) + 90))
  while [ $(date +%s) -lt $deadline ]; do
    if curl -s --max-time 2 -o /dev/null -u "opencode:$pass" "$IT_SERVER_URL/global/health" 2>/dev/null; then
      it_log "server ready at $IT_SERVER_URL"
      return 0
    fi
    sleep 0.5
  done

  it_log "server failed to start; log:"
  cat "$logfile" >&2 2>/dev/null || true
  return 1
}

it_stop_server() {
  if [ -n "${IT_SERVER_PID:-}" ]; then
    kill "$IT_SERVER_PID" 2>/dev/null || true
    sleep 0.3
    kill -0 "$IT_SERVER_PID" 2>/dev/null && kill -9 "$IT_SERVER_PID" 2>/dev/null || true
    IT_SERVER_PID=""
  fi
}

# ---- tmux session management -------------------------------------------------

# Create a new tmux session running opencode TUI.
# Sets IT_TMUX_SESS to the session name.
it_tmux_start() {
  local sess="iti_${$}_${RANDOM}"
  IT_TMUX_SESSIONS+=("$sess")

  tmux new-session -d -s "$sess" -x 200 -y 50 2>/dev/null || return 1

  # Standalone boot (NO OPENCODE_SERVER_URL/PASSWORD): opencode >= 1.18 loads
  # tui.json plugins ONLY when the TUI owns its embedded server — in client
  # mode (connected to `opencode serve`) the TUI plugin host stays empty and
  # the sidebar never renders (verified live 2026-08-25).
  # cwd=IT_PROJ keeps the project directory away from the repo's
  # .opencode/tui.json, whose dist/index.js entry silently breaks TUI plugin
  # loading.
  tmux send-keys -t "$sess" \
    "cd '$IT_PROJ' && HOME='$HOME' XDG_DATA_HOME='$XDG_DATA_HOME' XDG_CONFIG_HOME='$XDG_CONFIG_HOME' XDG_CACHE_HOME='$XDG_CACHE_HOME' XDG_STATE_HOME='$XDG_STATE_HOME' OPENCODE_DISABLE_AUTOUPDATE=1 OPENCODE_DISABLE_MODELS_FETCH=1 opencode" Enter

  export IT_TMUX_SESS="$sess"
  it_log "tmux session: $sess"
}

it_tmux_stop() {
  local sess="${1:-${IT_TMUX_SESS:-}}"
  [ -n "$sess" ] && tmux kill-session -t "$sess" 2>/dev/null || true
}

it_tmux_capture() {
  local sess="${1:-${IT_TMUX_SESS:-}}"
  tmux capture-pane -t "$sess" -p 2>/dev/null || echo ""
}

it_tmux_send() {
  local sess="${1:-${IT_TMUX_SESS:-}}"
  local keys="$2"
  tmux send-keys -t "$sess" -l -- "$keys"
}

it_tmux_send_enter() {
  local sess="${1:-${IT_TMUX_SESS:-}}"
  tmux send-keys -t "$sess" Enter
}

# ---- project config ----------------------------------------------------------

# Write the sandbox TUI plugin config. ONLY dist/tui.js may be listed: adding
# the server bundle (dist/index.js) to tui.json makes opencode's TUI plugin
# host fail silently and NO tui plugin loads (verified live 2026-08-25).
write_tui_config() {
  local plugin_file="${1:-"$IT_PLUGIN_FILE"}"
  if [ -z "$plugin_file" ]; then
    it_log "WARN: plugin file path not provided and IT_PLUGIN_FILE is empty"
    return 1
  fi
  local config_dir="$XDG_CONFIG_HOME/opencode"
  mkdir -p "$config_dir"
  local tui_entry="${plugin_file%index.js}tui.js"
  if [ ! -f "$tui_entry" ]; then
    it_log "WARN: tui bundle not found at $tui_entry"
    return 1
  fi
  # Stage a COPY inside the sandbox: opencode's TUI plugin host fails to load
  # file: entries that point into the oh-my-openagent monorepo (its
  # package.json/workspaces hijack resolution), while a plain copied file
  # loads reliably (A/B verified live 2026-08-25).
  cp "$tui_entry" "$config_dir/omo-tui-bundle.js"
  printf '{\n  "plugin": ["file://%s"]\n}\n' "$config_dir/omo-tui-bundle.js" \
    > "$config_dir/tui.json"
  it_log "sandbox tui config written: $config_dir/tui.json"
}
# Write the opencode.jsonc for the isolated project, pointing at the plugin dist.
# Takes the plugin file path as first argument (recommended) or falls back to
# IT_PLUGIN_FILE from the environment.
write_project_config() {
  local proj="${1:-"$IT_PROJ"}"
  local plugin_file="${1:-"$IT_PLUGIN_FILE"}"
  if [ -z "$plugin_file" ]; then
    it_log "WARN: plugin file path not provided and IT_PLUGIN_FILE is empty"
    return 1
  fi
  local config_dir="$XDG_CONFIG_HOME/opencode"
  mkdir -p "$config_dir"
  local config_file="$config_dir/opencode.jsonc"
  cat > "$config_file" <<JSON
{
  "model": "opencode/big-pickle",
  "plugin": ["file:$plugin_file"]
}
JSON
  write_tui_config "$plugin_file" || return 1
  it_log "project config written: $config_file"
}

# Write a broken config (missing quotes) for tc6.
write_broken_config() {
  local proj="${1:-"$IT_PROJ"}"
  local plugin_file="${1:-"$IT_PLUGIN_FILE"}"
  if [ -z "$plugin_file" ]; then
    it_log "WARN: plugin file path not provided and IT_PLUGIN_FILE is empty"
    return 1
  fi
  local config_dir="$XDG_CONFIG_HOME/opencode"
  mkdir -p "$config_dir"
  local config_file="$config_dir/opencode.jsonc"
  # Intentionally broken config: valid JSONC but contains an unknown config key.
  # The server starts fine, but the sidebar shows a "broken" view because
  # validatePluginConfig returns valid=false with "Unknown config key" messages.
  cat > "$config_file" <<JSON
{
  "model": "opencode/big-pickle",
  "plugin": ["file:$plugin_file"]
}
JSON
  it_log "project config written: $config_file"

  # The OMO validator reads the .omo/omo.jsonc chain, NOT opencode.jsonc —
  # an unknown key there is what makes validatePluginConfig report valid=false
  # and the sidebar show its broken view.
  write_tui_config "$plugin_file" || return 1
  mkdir -p "$HOME/.omo"
  printf '%s\n' '{ "unknown_config_key_for_tc6": true }' > "$HOME/.omo/omo.jsonc"
  it_log "broken omo config written: $HOME/.omo/omo.jsonc"
}

# ---- wait-for-text ----------------------------------------------------------

# Poll a tmux pane until a regex matches or timeout expires.
# Args: -t pane -p pattern [-T seconds]
# Exit: 0=found, 1=timeout, 2=tmux error/invalid args
wait_for_text() {
  local pane="" pattern="" timeout=30
  local OPTIND=0

  while getopts "t:p:T:h-:" opt; do
    case "$opt" in
      t) pane="$OPTARG" ;;
      p) pattern="$OPTARG" ;;
      T) timeout="$OPTARG" ;;
      h)
        printf 'usage: wait-for-text -t pane -p pattern [-T seconds]\n' >&2
        return 2
        ;;
      -)
        case "$OPTARG" in
          pane) pane="${!OPTIND}"; OPTIND=$((OPTIND+1)) ;;
          pattern) pattern="${!OPTIND}"; OPTIND=$((OPTIND+1)) ;;
          timeout) timeout="${!OPTIND}"; OPTIND=$((OPTIND+1)) ;;
          *) printf 'FAIL: unknown long option --%s\n' "$OPTARG" >&2; return 2 ;;
        esac
        ;;
      *) printf 'FAIL: unknown option -%s\n' "$OPTARG" >&2; return 2 ;;
    esac
  done

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

# ---- inject-error wrapper ----------------------------------------------------

# Wrapper for inject-error.sh — delegates to the script for each error type.
# Cases call these as functions (e.g., inject_corrupt "$mirror") rather than
# invoking the script directly, so PATH resolution is not needed.
_inject_error_script() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  "$script_dir/inject-error.sh" "$@"
}

inject_corrupt() { _inject_error_script corrupt "$1"; }
inject_stale()   { _inject_error_script stale  "$1"; }
inject_delete()  { _inject_error_script delete "$1"; }
inject_restore(){ _inject_error_script restore "$1"; }

# ---- cleanup ----------------------------------------------------------------

it_cleanup() {
  it_stop_server
  local s
  for s in "${IT_TMUX_SESSIONS[@]:-}"; do
    [ -n "$s" ] && tmux kill-session -t "$s" 2>/dev/null || true
  done
  local d
  for d in "${IT_TMPDIRS[@]:-}"; do
    [ -n "$d" ] && rm -rf "$d" 2>/dev/null || true
  done
  IT_TMUX_SESSIONS=()
  IT_TMPDIRS=()
}
trap it_cleanup EXIT

# ---- self-check ------------------------------------------------------------

it__self_check() {
  local fails=0

  # it_require returns 0 (success) when every binary is present.
  if ! it_require opencode tmux python3 shasum; then
    it_log "FAIL: missing dependencies"; fails=$((fails+1))
  else
    it_pass "dependencies present"
  fi

  # Isolation test
  local marker
  marker="$(mktemp -t it-marker.XXXXXX)"
  local this_script="$BASH_SOURCE"
  IT_SELF_CHECK_MARKER="$marker" bash -c '. "$1"; it_mk_isolated_xdg; printf "%s\n" "$IT_XDG_ROOT" > "$IT_SELF_CHECK_MARKER"' _ "$this_script"
  local isol_dir
  isol_dir="$(cat "$marker" 2>/dev/null)"
  rm -f "$marker"

  if [ -n "$isol_dir" ] && [ ! -d "$isol_dir" ]; then
    it_pass "isolated XDG sandbox auto-removed on exit"
  else
    it_log "FAIL: sandbox not cleaned: $isol_dir"; fails=$((fails+1))
  fi

  if [ "$fails" -eq 0 ]; then
    it_pass "common-it.sh self-check"
    return 0
  fi
  it_log "self-check had $fails failure(s)"
  return 1
}

if [ "${BASH_SOURCE[0]}" = "$0" ] && [ "${1:-}" = "--self-check" ]; then
  it__self_check
  exit $?
fi
