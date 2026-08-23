import type { ToolDefinition } from "@opencode-ai/plugin";

function matchesPattern(toolName: string, pattern: string): boolean {
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return toolName.startsWith(prefix);
  }
  return toolName === pattern;
}

export function filterDisabledTools(
  tools: Record<string, ToolDefinition>,
  disabledTools: readonly string[] | undefined,
): Record<string, ToolDefinition> {
  if (!disabledTools || disabledTools.length === 0) {
    return tools;
  }

  const filtered: Record<string, ToolDefinition> = {};
  for (const [toolName, toolDefinition] of Object.entries(tools)) {
    const isDisabled = disabledTools.some((pattern) =>
      matchesPattern(toolName, pattern)
    );
    if (!isDisabled) {
      filtered[toolName] = toolDefinition;
    }
  }
  return filtered;
}
