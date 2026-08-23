import {
  extractRuntimeFallbackAutoRetrySignal as extractBuiltInSignal,
  type RuntimeFallbackAutoRetrySignal as AutoRetrySignal,
} from "@oh-my-opencode/model-core";

export { extractBuiltInSignal as extractAutoRetrySignal };
export type { AutoRetrySignal };

function appendStringCandidate(candidates: string[], value: unknown): void {
  if (typeof value === "string") candidates.push(value);
}

function extractMessageFromInfo(
  info: Record<string, unknown> | undefined,
): string | undefined {
  if (!info) return undefined;
  const candidates: string[] = [];
  appendStringCandidate(candidates, info.status);
  appendStringCandidate(candidates, info.summary);
  appendStringCandidate(candidates, info.message);
  appendStringCandidate(candidates, info.details);
  return candidates.join("\n");
}

/**
 * Layer user-provided regex patterns on top of the built-in auto-retry signal detector.
 * Checks built-in patterns first; if no signal found and user patterns exist,
 * tries matching against the error message text.
 */
export function extractAutoRetrySignalWithUserPatterns(
  info: Record<string, unknown> | undefined,
  userPatterns: string[],
): AutoRetrySignal | undefined {
  const builtIn = extractBuiltInSignal(info);
  if (builtIn) return builtIn;
  if (!userPatterns.length) return undefined;

  const message = extractMessageFromInfo(info);
  if (!message) return undefined;

  for (const pattern of userPatterns) {
    try {
      if (new RegExp(pattern, "i").test(message)) {
        return { signal: message };
      }
    } catch {
      // invalid regex — skip
    }
  }
  return undefined;
}
