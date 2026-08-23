import { spawn } from "bun";
import {
  type InteractiveMenuSessionState,
  loadInteractiveMenuSessionState,
  type MenuWindowStatus,
  saveInteractiveMenuSessionState,
} from "./storage";
import { OMO_MENU_PANE_PREFIX } from "./constants";

export function getOrCreateMenuState(
  sessionId: string,
): InteractiveMenuSessionState {
  const existing = loadInteractiveMenuSessionState(sessionId);
  if (existing) return existing;
  const state: InteractiveMenuSessionState = {
    sessionId,
    trackedPanes: [],
    lastActivity: Date.now(),
  };
  saveInteractiveMenuSessionState(sessionId, state);
  return state;
}

export function killAllTrackedMenuPanes(sessionId: string): void {
  const state = loadInteractiveMenuSessionState(sessionId);
  if (!state) return;
  for (const pane of state.trackedPanes) {
    if (pane.startsWith(OMO_MENU_PANE_PREFIX)) {
      try {
        spawn({
          cmd: [
            "/bin/bash",
            "-c",
            `tmux kill-window -t '${pane}' 2>/dev/null || true`,
          ],
          stdout: "pipe",
          stderr: "pipe",
        });
      } catch { /* best effort */ }
    }
  }
}

// --- Shared tmux utilities ---

export async function runTmuxCommand(
  cmd: string,
  timeoutMs = 5000,
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn({
      cmd: ["/bin/bash", "-c", cmd],
      stdout: "pipe",
      stderr: "pipe",
    });
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch { /* ignore */ }
      resolve({ success: false, output: "" });
    }, timeoutMs);
    proc.exited.then((exitCode: number) => {
      clearTimeout(timer);
      new Response(proc.stdout).text().then((stdout: string) => {
        resolve({ success: exitCode === 0, output: stdout.trim() });
      });
    }).catch(() => {
      clearTimeout(timer);
      resolve({ success: false, output: "" });
    });
  });
}

export function buildMenuDisplay(prompt: string, options?: string[]): string {
  let displayText = prompt;
  if (options && options.length > 0) {
    displayText += "\n\n";
    for (let i = 0; i < options.length; i++) {
      displayText += `${i + 1}. ${options[i]}\n`;
    }
  }
  return displayText;
}

// --- Window recreation helpers ---

export async function recreateMenuWindow(sessionId: string): Promise<boolean> {
  const state = loadInteractiveMenuSessionState(sessionId);
  if (!state || !state.windowName || !state.prompt) return false;

  const windowName = state.windowName;
  const escapedDisplay = buildMenuDisplay(state.prompt, state.options).replace(
    /'/g,
    "'\\''",
  );

  // Kill any stale window with the same name first
  await runTmuxCommand(
    `tmux kill-window -t '${windowName}' 2>/dev/null || true`,
  );

  // Create a new visible window
  const createResult = await runTmuxCommand(
    `tmux new-window -d -n '${windowName}' -P -F '#{window_id}' 2>&1`,
  );
  if (!createResult.success || createResult.output.includes("no server")) {
    return false;
  }

  // Send the menu content
  const shellCmd = `echo ''; echo '${escapedDisplay}'; echo ''; echo '> '`;
  await runTmuxCommand(`tmux send-keys -t '${windowName}' '${shellCmd}' C-m`);

  // Update state to "open"
  state.status = "open";
  state.lastActivity = Date.now();
  saveInteractiveMenuSessionState(sessionId, state);

  return true;
}

export function updateMenuWindowStatus(
  sessionId: string,
  status: MenuWindowStatus,
  answer?: string | null,
): void {
  const state = loadInteractiveMenuSessionState(sessionId);
  if (!state) return;
  state.status = status;
  if (answer !== undefined) state.answer = answer;
  state.lastActivity = Date.now();
  saveInteractiveMenuSessionState(sessionId, state);
}

export function checkWindowExists(windowName: string): Promise<boolean> {
  return runTmuxCommand(
    `tmux list-windows -F '#{window_name}' 2>/dev/null | grep -q '^${windowName}$' && echo 'EXISTS' || echo 'NOT_FOUND'`,
  ).then((r) => r.output.includes("EXISTS"));
}
