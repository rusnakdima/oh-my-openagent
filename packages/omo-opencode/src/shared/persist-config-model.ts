import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { updateOmoConfig } from "@oh-my-opencode/omo-config-core";

import { getOpenCodeConfigDir } from "./opencode-config-dir";
import { log } from "./logger";
import type { SessionModel } from "./session-model-state";

/**
 * Persist the global model pick into the user-level OpenCode/MiMoCode config files
 * so future sessions (and components that read config.model) see the selection.
 *
 * Uses the omo-config-core comment-preserving writer (timestamped backup, atomic
 * rename). Only files that already exist are updated — we never create or reset
 * a config file the user does not have. Failures are logged and non-fatal.
 */
function resolveOpenCodeConfigFile(): string | null {
  const configDir = getOpenCodeConfigDir({ binary: "opencode" });
  for (const name of ["opencode.jsonc", "opencode.json"] as const) {
    const candidate = join(configDir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveMimocodeConfigFile(): string | null {
  const configDir = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  for (const name of ["mimocode.jsonc", "mimocode.json"] as const) {
    const candidate = join(configDir, "mimocode", name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function writeGlobalModelToConfigs(model: SessionModel): void {
  const value = `${model.providerID}/${model.modelID}`;
  for (
    const targetPath of [
      resolveOpenCodeConfigFile(),
      resolveMimocodeConfigFile(),
    ]
  ) {
    if (!targetPath) continue;
    try {
      updateOmoConfig({
        scope: "user",
        targetPath,
        edits: [{ path: ["model"], value }],
      });
      log("[persist-config-model] wrote global model", { targetPath, value });
    } catch (error) {
      log("[persist-config-model] write failed", { targetPath, error });
    }
  }
}
