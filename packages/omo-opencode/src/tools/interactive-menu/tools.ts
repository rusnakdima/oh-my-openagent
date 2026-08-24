import { spawn } from "bun";
import { tool } from "@opencode-ai/plugin/tool";
import type { ToolContext, ToolDefinition } from "@opencode-ai/plugin";
import {
  DEFAULT_MENU_TIMEOUT_MS,
  INTERACTIVE_MENU_DESCRIPTION,
  POLL_INTERVAL_MS,
} from "./constants";
import {
  buildMenuDisplay,
  checkWindowExists,
  getOrCreateMenuState,
  recreateMenuWindow,
  runTmuxCommand,
  updateMenuWindowStatus,
} from "../../hooks/interactive-menu-session/state-manager";

function extractInputFromPane(paneContent: string | null): string | null {
  if (!paneContent) return null;
  // Look for the prompt line with user input after ">"
  const lines = paneContent.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("> ")) {
      const input = trimmed.slice(2).trim();
      if (input.length > 0) return input;
    }
  }
  return null;
}

type MenuArgs = {
  prompt: string;
  options?: string[];
  timeout_ms?: number;
};

async function ensureMenuWindow(
  sessionId: string,
  prompt: string,
  options?: string[],
): Promise<string> {
  // Get or create persistent state
  const state = getOrCreateMenuState(sessionId);
  let windowName = state.windowName;

  // If window name exists, check if window is still alive
  if (windowName) {
    const exists = await checkWindowExists(windowName);
    if (exists) {
      // Window still there — just update activity timestamp
      state.lastActivity = Date.now();
      state.prompt = prompt;
      state.options = options;
      return windowName;
    }
    // Window was closed by user — fall through to recreate
    state.status = "closed";
  }

  // Create a new window
  windowName = `omo-menu-${Date.now()}`;
  const escapedDisplay = buildMenuDisplay(prompt, options).replace(
    /'/g,
    "'\\''",
  );

  const createResult = await runTmuxCommand(
    `tmux new-window -d -n '${windowName}' -P -F '#{window_id}' 2>&1`,
    5000,
  );
  if (!createResult.success || createResult.output.includes("no server")) {
    return JSON.stringify({
      error: "Failed to create tmux window — is tmux running?",
      details: createResult.output,
    }) as string;
  }

  // Send the menu content
  const shellCmd = `echo ''; echo '${escapedDisplay}'; echo ''; echo '> '`;
  await runTmuxCommand(
    `tmux send-keys -t '${windowName}' '${shellCmd}' C-m`,
    2000,
  );

  // Wait for window to render
  await new Promise((r) => setTimeout(r, 300));

  // Verify window is live
  const paneInfo = await runTmuxCommand(
    `tmux list-windows -F '#{window_name}' 2>/dev/null | grep '^${windowName}$' || echo 'NOT_FOUND'`,
    2000,
  );
  if (!paneInfo.output.includes(windowName)) {
    return JSON.stringify({
      error: "Menu window failed to initialize",
    }) as string;
  }

  // Persist state so the hook can manage it
  state.windowName = windowName;
  state.prompt = prompt;
  state.options = options;
  state.status = "open";
  state.lastActivity = Date.now();

  return windowName;
}

export async function executeInteractiveMenu(
  args: MenuArgs,
  sessionId?: string,
): Promise<string> {
  const timeout = args.timeout_ms ?? DEFAULT_MENU_TIMEOUT_MS;
  const sid = sessionId ?? "unknown";

  // Ensure the window exists (recreates if user closed it)
  const windowResult = await ensureMenuWindow(sid, args.prompt, args.options);
  if (typeof windowResult === "string" && windowResult.startsWith("{")) {
    // Error object returned
    return windowResult;
  }
  const windowName = windowResult;

  const killWindow = async () => {
    try {
      await runTmuxCommand(
        `tmux kill-window -t '${windowName}' 2>/dev/null || true`,
        2000,
      );
    } catch { /* best effort */ }
  };

  try {
    // Poll for user input with timeout
    const deadline = Date.now() + timeout;
    let attempts = 0;
    const maxAttempts = Math.floor(timeout / POLL_INTERVAL_MS);

    while (Date.now() < deadline && attempts < maxAttempts) {
      // Check if window still exists — user may have closed it mid-poll
      const exists = await checkWindowExists(windowName);
      if (!exists) {
        // Window was closed — try to recreate it and keep polling
        const recreated = await recreateMenuWindow(sid);
        if (!recreated) {
          // Can't recreate — window is gone
          updateMenuWindowStatus(sid, "closed");
          return JSON.stringify({ cancelled: true, reason: "window_closed" });
        }
        // Window recreated — give user time to switch to it
        await new Promise((r) => setTimeout(r, 500));
        attempts++;
        continue;
      }

      const captureResult = await runTmuxCommand(
        `tmux capture-pane -t '${windowName}.0' -p 2>/dev/null || true`,
        2000,
      );
      if (captureResult.success && captureResult.output) {
        const input = extractInputFromPane(captureResult.output);
        if (input !== null) {
          // User typed something
          updateMenuWindowStatus(sid, "answered", input);
          await killWindow();
          return JSON.stringify({ value: input });
        }
      }
      attempts++;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    // Timeout
    updateMenuWindowStatus(sid, "closed");
    await killWindow();
    return JSON.stringify({ cancelled: true, reason: "timeout" });
  } catch (err) {
    updateMenuWindowStatus(sid, "closed");
    await killWindow();
    return JSON.stringify({
      error: "Menu execution failed",
      details: String(err),
    });
  }
}

export const interactive_menu: ToolDefinition = tool({
  description: INTERACTIVE_MENU_DESCRIPTION,
  args: {
    prompt: tool.schema.string().describe(
      "The question/prompt to display to the user",
    ),
    options: tool.schema.array(tool.schema.string()).optional().describe(
      "Optional list of choices to display",
    ),
    timeout_ms: tool.schema.number().optional().describe(
      `Timeout in milliseconds (default: ${DEFAULT_MENU_TIMEOUT_MS})`,
    ),
  },
  execute: async (args, context: ToolContext) => {
    return executeInteractiveMenu(args, context.sessionID);
  },
});
