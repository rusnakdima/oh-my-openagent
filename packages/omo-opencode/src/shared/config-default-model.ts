import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseJsonc } from "@oh-my-opencode/utils";
import { getOpenCodeConfigDir } from "./opencode-config-dir";
import type { SessionModel } from "./session-model-state";

let cached: SessionModel | null | undefined;

/**
 * The user's configured boot default model (top-level "model" in
 * opencode.jsonc/json). OpenCode starts every fresh session and mode on this
 * value until the user picks another one, so a chat.message input.model equal
 * to it is a RESTORE — never a user pick. Read once per process; resettable
 * for tests.
 */
export function getOpencodeConfigDefaultModel(): SessionModel | null {
  if (cached === undefined) cached = readConfigDefaultModel();
  return cached;
}

function readConfigDefaultModel(): SessionModel | null {
  const configDir = getOpenCodeConfigDir({ binary: "opencode" });
  for (const name of ["opencode.jsonc", "opencode.json"] as const) {
    const candidate = join(configDir, name);
    if (!existsSync(candidate)) continue;
    try {
      const content = readFileSync(candidate, "utf-8");
      const config = parseJsonc<Record<string, unknown>>(content);
      const model = config?.["model"];
      if (typeof model !== "string") return null;
      const parts = model.split("/");
      if (parts.length < 2) return null;
      const modelID = parts.pop()!;
      return { providerID: parts.join("/"), modelID };
    } catch {
      return null;
    }
  }
  return null;
}

/** Test-only: drop the cached boot default so the next call re-reads config. */
export function _resetConfigDefaultModelCacheForTesting(): void {
  cached = undefined;
}
