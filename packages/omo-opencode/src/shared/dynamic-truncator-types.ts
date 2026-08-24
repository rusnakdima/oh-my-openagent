import type { PluginInput } from "@opencode-ai/plugin";

export type ContextWindowUsage = {
  usedTokens: number;
  remainingTokens: number;
  usagePercentage: number;
  /** Largest tool output seen in this session (bytes); 0 if no tool has run */
  largestOutput: number;
};

export type ContextWindowUsageClient = Pick<PluginInput["client"], "session">;

export interface TruncationResult {
  result: string;
  truncated: boolean;
  removedCount?: number;
}

export interface TruncationOptions {
  targetMaxTokens?: number;
  preserveHeaderLines?: number;
  contextWindowLimit?: number;
}
