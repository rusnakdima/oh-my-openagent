import type { CommandDefinition } from "../claude-code-command-loader";
import { isAgentRegistered } from "../claude-code-session-state";
import type { BuiltinCommandName, BuiltinCommands } from "./types";
import { GOAL_TEMPLATE } from "./templates/goal";
import { STOP_CONTINUATION_TEMPLATE } from "./templates/stop-continuation";
import {
  REFACTOR_TEAM_MODE_ADDENDUM,
  REFACTOR_TEMPLATE,
} from "./templates/refactor";
import { START_WORK_TEMPLATE } from "./templates/start-work";
import { HANDOFF_TEMPLATE } from "./templates/handoff";
import {
  REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM,
  REMOVE_AI_SLOPS_TEMPLATE,
} from "./templates/remove-ai-slops";
import { HYPERPLAN_TEMPLATE } from "./templates/hyperplan";
import { WIKI_INIT_TEMPLATE } from "./templates/wiki-init";
import { WIKI_INGEST_TEMPLATE } from "./templates/wiki-ingest";
import { WIKI_QUERY_TEMPLATE } from "./templates/wiki-query";
import { WIKI_LINT_TEMPLATE } from "./templates/wiki-lint";
import { WIKI_UPDATE_TEMPLATE } from "./templates/wiki-update";
import { VOICE_TEMPLATE } from "./templates/voice";
import { BTW_TEMPLATE } from "./templates/btw";
import { MODEL_TEMPLATE } from "./templates/model-select";
import { LIST_AGENTS_TEMPLATE } from "./templates/list-agents";

interface LoadBuiltinCommandsOptions {
  useRegisteredAgents?: boolean;
  teamModeEnabled?: boolean;
}

function resolveStartWorkAgent(
  options?: LoadBuiltinCommandsOptions,
): "atlas" | "sisyphus" {
  if (options?.useRegisteredAgents) {
    return isAgentRegistered("atlas") ? "atlas" : "sisyphus";
  }

  return "atlas";
}

function withTeamModeAddendum(
  baseTemplate: string,
  addendum: string,
  teamModeEnabled: boolean,
): string {
  return teamModeEnabled ? `${baseTemplate}\n${addendum}` : baseTemplate;
}

function createBuiltinCommandDefinitions(
  options?: LoadBuiltinCommandsOptions,
): Record<BuiltinCommandName, Omit<CommandDefinition, "name">> {
  const teamModeEnabled = options?.teamModeEnabled ?? false;
  const refactorContent = withTeamModeAddendum(
    REFACTOR_TEMPLATE,
    REFACTOR_TEAM_MODE_ADDENDUM,
    teamModeEnabled,
  );
  const removeAiSlopsContent = withTeamModeAddendum(
    REMOVE_AI_SLOPS_TEMPLATE,
    REMOVE_AI_SLOPS_TEAM_MODE_ADDENDUM,
    teamModeEnabled,
  );

  return {
    goal: {
      description:
        "(builtin) Set, show, pause, resume, or clear the active thread goal",
      template: `<command-instruction>
${GOAL_TEMPLATE}
</command-instruction>

<user-task>
$ARGUMENTS
</user-task>`,
      argumentHint: "<objective> | pause | resume | clear",
    },
    refactor: {
      description:
        "(builtin) Intelligent refactoring command with LSP, AST-grep, architecture analysis, codemap, and TDD verification.",
      template: `<command-instruction>
${refactorContent}
</command-instruction>`,
      argumentHint:
        "<refactoring-target> [--scope=<file|module|project>] [--strategy=<safe|aggressive>]",
    },
    "start-work": {
      description: "(builtin) Start Atlas work session from Prometheus plan",
      agent: resolveStartWorkAgent(options),
      template: `<command-instruction>
${START_WORK_TEMPLATE}
</command-instruction>

<session-context>
Session ID: $SESSION_ID
Timestamp: $TIMESTAMP
</session-context>

<user-request>
$ARGUMENTS
</user-request>`,
      argumentHint: "[plan-name] [--worktree <path>] [--make-pr] [--ship]",
    },
    "stop-continuation": {
      description:
        "(builtin) Stop all continuation mechanisms (ralph loop, todo continuation, boulder) for this session",
      template: `<command-instruction>
${STOP_CONTINUATION_TEMPLATE}
</command-instruction>`,
    },
    "remove-ai-slops": {
      description:
        "(builtin) Remove AI-generated code smells from branch changes and critically review the results",
      template: `<command-instruction>
${removeAiSlopsContent}
</command-instruction>

<user-request>
$ARGUMENTS
</user-request>`,
    },
    handoff: {
      description:
        "(builtin) Create a detailed context summary for continuing work in a new session",
      template: `<command-instruction>
${HANDOFF_TEMPLATE}
</command-instruction>

<session-context>
Session ID: $SESSION_ID
Timestamp: $TIMESTAMP
</session-context>

<user-request>
$ARGUMENTS
</user-request>`,
      argumentHint: "[goal]",
    },
    hyperplan: {
      description:
        "(builtin) Adversarial multi-agent planning via team-mode (5 hostile category members cross-critique, lead synthesizes)",
      template: `<command-instruction>
${HYPERPLAN_TEMPLATE}
</command-instruction>`,
      argumentHint: "[planning-request]",
    },
    "wiki-init": {
      description:
        "(builtin) Bootstrap a new LLM-maintained wiki for knowledge accumulation",
      template: `<command-instruction>
${WIKI_INIT_TEMPLATE}
</command-instruction>`,
    },
    "wiki-ingest": {
      description:
        "(builtin) Add a source (paper, URL, file, transcript) to the wiki",
      template: `<command-instruction>
${WIKI_INGEST_TEMPLATE}
</command-instruction>

<user-source>
$ARGUMENTS
</user-source>`,
      argumentHint: "<file-path|URL|paste-text>",
    },
    "wiki-query": {
      description: "(builtin) Ask a question against the wiki knowledge base",
      template: `<command-instruction>
${WIKI_QUERY_TEMPLATE}
</command-instruction>

<user-question>
$ARGUMENTS
</user-question>`,
      argumentHint: "<question>",
    },
    "wiki-lint": {
      description:
        "(builtin) Health audit: find contradictions, broken links, orphans, and coverage gaps",
      template: `<command-instruction>
${WIKI_LINT_TEMPLATE}
</command-instruction>`,
    },
    "wiki-update": {
      description:
        "(builtin) Revise existing wiki pages when knowledge changes",
      template: `<command-instruction>
${WIKI_UPDATE_TEMPLATE}
</command-instruction>

<update-details>
$ARGUMENTS
</update-details>`,
      argumentHint: "<what-changed>",
    },
    openspec: {
      description:
        "(builtin) OpenSpec session management: propose, verify, apply, archive, status, or list specs",
      template: `<command-instruction>
 You have access to the OpenSpec system for structured task specification.

 Available subcommands:
   propose <name> [description] — Create a new spec proposal
   verify <name>               — Verify a spec's integrity
   apply <name>                — Mark pending tasks in-progress
   archive <name>              — Archive a completed spec
   status                     — Show all spec statuses
   list                        — List all known specs
   help                        — Show this help

 When a spec is active, its context (spec.md, plan.md, tasks) is automatically
 injected into your context via the openspec-session hook.

 You can also use OpenSpec tools directly:
   openspec_propose   — Create a new spec
   openspec_verify    — Verify spec integrity
   openspec_apply     — Mark pending tasks in-progress
   openspec_archive   — Archive a spec
   openspec_status    — Show spec status
   openspec_list      — List all specs
 </command-instruction>

 <user-request>
 $ARGUMENTS
 </user-request>`,
      argumentHint:
        "propose <name> | verify <name> | apply <name> | archive <name> | status | list | help",
    },
    voice: {
      description:
        "(builtin) Capture microphone audio and transcribe it to text via the voice tool",
      template: `<command-instruction>
${VOICE_TEMPLATE}
</command-instruction>`,
    },
    btw: {
      description:
        "(builtin) Ask a side question that is excluded from future context",
      template: `<command-instruction>
${BTW_TEMPLATE}
</command-instruction>

<user-request>
$ARGUMENTS
</user-request>`,
      argumentHint: "<question>",
    },
    "setmodel": {
      description:
        "(builtin) Set the TUI model for all agents or a specific agent via interactive tmux menu",
      template: MODEL_TEMPLATE,
      argumentHint: "[agent-name]",
    },
    "list-agents": {
      description:
        "(builtin) Show all agents and their current models — pick one to configure",
      template: LIST_AGENTS_TEMPLATE,
      argumentHint: "",
    },
  };
}

export function loadBuiltinCommands(
  disabledCommands?: BuiltinCommandName[],
  options?: LoadBuiltinCommandsOptions,
): BuiltinCommands {
  const builtinCommandDefinitions = createBuiltinCommandDefinitions(options);
  const disabled = new Set(disabledCommands ?? []);
  const commands: BuiltinCommands = {};

  for (const [name, definition] of Object.entries(builtinCommandDefinitions)) {
    if (!disabled.has(name as BuiltinCommandName)) {
      const { argumentHint: _argumentHint, ...openCodeCompatible } = definition;
      commands[name] = { ...openCodeCompatible, name } as CommandDefinition;
    }
  }

  return commands;
}
