import type { CommandDefinition } from "../claude-code-command-loader"

export type BuiltinCommandName =
  | "goal"
  | "refactor"
  | "start-work"
  | "stop-continuation"
  | "handoff"
  | "remove-ai-slops"
  | "hyperplan"
  | "wiki-init"
  | "wiki-ingest"
  | "wiki-query"
  | "wiki-lint"
  | "wiki-update"

export interface BuiltinCommandConfig {
  disabled_commands?: BuiltinCommandName[]
}

export type BuiltinCommands = Record<string, CommandDefinition>
