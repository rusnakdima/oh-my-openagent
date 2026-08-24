/// <reference path="../../../../../bun-test.d.ts" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { loadBuiltinCommands } from "./commands";
import { VOICE_TEMPLATE } from "./templates/voice";
import { HANDOFF_TEMPLATE } from "./templates/handoff";
import { REFACTOR_TEMPLATE } from "./templates/refactor";
import { REMOVE_AI_SLOPS_TEMPLATE } from "./templates/remove-ai-slops";
import { WIKI_INIT_TEMPLATE } from "./templates/wiki-init";
import { WIKI_INGEST_TEMPLATE } from "./templates/wiki-ingest";
import { WIKI_QUERY_TEMPLATE } from "./templates/wiki-query";
import { WIKI_LINT_TEMPLATE } from "./templates/wiki-lint";
import { WIKI_UPDATE_TEMPLATE } from "./templates/wiki-update";
import type { BuiltinCommandName } from "./types";
import {
  _resetForTesting,
  registerAgentName,
} from "../claude-code-session-state";

beforeEach(() => {
  _resetForTesting();
});

afterEach(() => {
  _resetForTesting();
});

describe("loadBuiltinCommands - basic registration", () => {
  test("should register goal command by default", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = [];

    //#when
    const commands = loadBuiltinCommands(disabledCommands);

    //#then
    expect(commands.goal).toBeDefined();
    expect(commands.goal.name).toBe("goal");
    expect(commands.goal.description).toContain("(builtin)");
  });

  test("should register refactor command by default", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = [];

    //#when
    const commands = loadBuiltinCommands(disabledCommands);

    //#then
    expect(commands.refactor).toBeDefined();
    expect(commands.refactor.name).toBe("refactor");
    expect(commands.refactor.description).toContain("(builtin)");
  });

  test("should register start-work command by default", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = [];

    //#when
    const commands = loadBuiltinCommands(disabledCommands);

    //#then
    expect(commands["start-work"]).toBeDefined();
    expect(commands["start-work"].name).toBe("start-work");
  });

  test("should register stop-continuation command by default", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = [];

    //#when
    const commands = loadBuiltinCommands(disabledCommands);

    //#then
    expect(commands["stop-continuation"]).toBeDefined();
    expect(commands["stop-continuation"].name).toBe("stop-continuation");
  });

  test("should exclude goal when disabled", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = ["goal"];

    //#when
    const commands = loadBuiltinCommands(disabledCommands);

    //#then
    expect(commands.goal).toBeUndefined();
  });

  test("should exclude refactor when disabled", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = ["refactor"];

    //#when
    const commands = loadBuiltinCommands(disabledCommands);

    //#then
    expect(commands.refactor).toBeUndefined();
  });

  test("should exclude stop-continuation when disabled", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = ["stop-continuation"];

    //#when
    const commands = loadBuiltinCommands(disabledCommands);

    //#then
    expect(commands["stop-continuation"]).toBeUndefined();
  });

  test("should pass agent name through from options", () => {
    //#given
    registerAgentName("atlas");

    //#when
    const commands = loadBuiltinCommands([], { useRegisteredAgents: true });

    //#then
    expect(commands["start-work"]).toBeDefined();
    expect(commands["start-work"].agent).toBe("atlas");
  });
});

describe("HANDOFF_TEMPLATE", () => {
  test("should be a non-empty string", () => {
    //#given - the template string

    //#when / #then
    expect(HANDOFF_TEMPLATE).toBeTruthy();
    expect(typeof HANDOFF_TEMPLATE).toBe("string");
  });

  test("should include session context placeholders", () => {
    //#given - the template string

    //#when / #then
    expect(HANDOFF_TEMPLATE).toContain("$SESSION_ID");
    expect(HANDOFF_TEMPLATE).toContain("$TIMESTAMP");
  });

  test("should instruct maximum 10 files", () => {
    //#given - the template string

    //#when / #then
    expect(HANDOFF_TEMPLATE).toContain("Maximum 10 files");
  });

  test("should instruct plain text format without markdown", () => {
    //#given - the template string

    //#when / #then
    expect(HANDOFF_TEMPLATE).toContain("Plain text with bullets");
    expect(HANDOFF_TEMPLATE).toContain("No markdown headers");
  });

  test("should include user instructions for new session", () => {
    //#given - the template string

    //#when / #then
    expect(HANDOFF_TEMPLATE).toContain("new session");
    expect(HANDOFF_TEMPLATE).toContain("opencode");
  });

  test("should not contain emojis", () => {
    //#given - the template string

    //#when / #then
    const emojiRegex =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(HANDOFF_TEMPLATE)).toBe(false);
  });
});

describe("REFACTOR_TEMPLATE", () => {
  test("should be a non-empty string", () => {
    //#given - the template string

    //#when / #then
    expect(REFACTOR_TEMPLATE).toBeTruthy();
    expect(typeof REFACTOR_TEMPLATE).toBe("string");
  });

  test("should mention LSP", () => {
    //#given - the template string

    //#when / #then
    expect(REFACTOR_TEMPLATE).toContain("LSP");
  });

  test("should mention AST-grep", () => {
    //#given - the template string

    //#when / #then
    expect(REFACTOR_TEMPLATE).toContain("ast-grep");
  });

  test("should mention architecture analysis", () => {
    //#given - the template string

    //#when / #then
    expect(REFACTOR_TEMPLATE).toContain("architecture");
  });

  test("should mention TDD verification", () => {
    //#given - the template string

    //#when / #then
    expect(REFACTOR_TEMPLATE).toContain("TDD");
  });

  test("should not contain emojis", () => {
    //#given - the template string

    //#when / #then
    const emojiRegex =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(REFACTOR_TEMPLATE)).toBe(false);
  });
});

describe("REMOVE_AI_SLOPS_TEMPLATE", () => {
  test("should be a non-empty string", () => {
    //#given - the template string

    //#when / #then
    expect(REMOVE_AI_SLOPS_TEMPLATE).toBeTruthy();
    expect(typeof REMOVE_AI_SLOPS_TEMPLATE).toBe("string");
    expect(REMOVE_AI_SLOPS_TEMPLATE).not.toContain("slop-squad");
    expect(REMOVE_AI_SLOPS_TEMPLATE).not.toContain("team_create");
    const emojiRegex =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(REMOVE_AI_SLOPS_TEMPLATE)).toBe(false);
  });
});

describe("loadBuiltinCommands - refactor command team mode", () => {
  test("should exclude team mode addendum when teamModeEnabled is false", () => {
    //#given - team mode disabled
    const commands = loadBuiltinCommands(undefined, { teamModeEnabled: false });

    //#when / #then
    expect(commands.refactor.template).not.toContain("refactor-squad");
    expect(commands.refactor.template).not.toContain("team_create");
    expect(commands.refactor.template).not.toContain("Team Mode Protocol");
    expect(commands["remove-ai-slops"].template).not.toContain("slop-squad");
  });

  test("should include team mode addendum when teamModeEnabled is true", () => {
    //#given - team mode enabled
    const commands = loadBuiltinCommands(undefined, { teamModeEnabled: true });

    //#when / #then
    expect(commands["remove-ai-slops"].template).toContain("slop-squad");
    expect(commands.refactor.template).toContain("refactor-squad");
  });

  test("should default to team mode disabled when option is omitted", () => {
    //#given - no options passed at all
    const commands = loadBuiltinCommands();

    //#when / #then
    expect(commands["remove-ai-slops"].template).not.toContain("slop-squad");
  });
});

describe("REFACTOR_TEMPLATE", () => {
  test("should not contain team mode content in the base template", () => {
    //#given - the base template string, which is used when team mode is disabled

    //#when / #then
    expect(REFACTOR_TEMPLATE).not.toContain("refactor-squad");
    expect(REFACTOR_TEMPLATE).not.toContain("team_create");
  });
});

describe("loadBuiltinCommands - team mode gating for refactor", () => {
  test("should exclude team mode addendum when teamModeEnabled is false", () => {
    //#given - team mode disabled
    const commands = loadBuiltinCommands(undefined, { teamModeEnabled: false });

    //#when / #then
    expect(commands.refactor.template).not.toContain("refactor-squad");
  });

  test("should include team mode addendum when teamModeEnabled is true", () => {
    //#given - team mode enabled
    const commands = loadBuiltinCommands(undefined, { teamModeEnabled: true });

    //#when / #then
    expect(commands.refactor.template).toContain("refactor-squad");
  });
});

describe("loadBuiltinCommands - wiki commands", () => {
  test("should register wiki-init in loaded commands", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = [];

    //#when
    const commands = loadBuiltinCommands(disabledCommands);

    //#then
    expect(commands["wiki-init"]).toBeDefined();
    expect(commands["wiki-init"].name).toBe("wiki-init");
    expect(commands["wiki-init"].template).toContain(WIKI_INIT_TEMPLATE);
    expect(commands["wiki-init"].description).toContain("(builtin)");
  });

  test("should register wiki-ingest in loaded commands", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = [];

    //#when
    const commands = loadBuiltinCommands(disabledCommands);

    //#then
    expect(commands["wiki-ingest"]).toBeDefined();
    expect(commands["wiki-ingest"].name).toBe("wiki-ingest");
    expect(commands["wiki-ingest"].template).toContain(WIKI_INGEST_TEMPLATE);
    expect(commands["wiki-ingest"].template).toContain("$ARGUMENTS");
  });

  test("should register wiki-query in loaded commands", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = [];

    //#when
    const commands = loadBuiltinCommands(disabledCommands);

    //#then
    expect(commands["wiki-query"]).toBeDefined();
    expect(commands["wiki-query"].name).toBe("wiki-query");
    expect(commands["wiki-query"].template).toContain(WIKI_QUERY_TEMPLATE);
    expect(commands["wiki-query"].template).toContain("$ARGUMENTS");
  });

  test("should register wiki-lint in loaded commands", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = [];

    //#when
    const commands = loadBuiltinCommands(disabledCommands);

    //#then
    expect(commands["wiki-lint"]).toBeDefined();
    expect(commands["wiki-lint"].name).toBe("wiki-lint");
    expect(commands["wiki-lint"].template).toContain(WIKI_LINT_TEMPLATE);
  });

  test("should register wiki-update in loaded commands", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = [];

    //#when
    const commands = loadBuiltinCommands(disabledCommands);

    //#then
    expect(commands["wiki-update"]).toBeDefined();
    expect(commands["wiki-update"].name).toBe("wiki-update");
    expect(commands["wiki-update"].template).toContain(WIKI_UPDATE_TEMPLATE);
    expect(commands["wiki-update"].template).toContain("$ARGUMENTS");
  });

  test("should exclude wiki-init when disabled", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = ["wiki-init"];

    //#when
    const commands = loadBuiltinCommands(disabledCommands);

    //#then
    expect(commands["wiki-init"]).toBeUndefined();
  });

  test("should exclude wiki-ingest when disabled", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = ["wiki-ingest"];

    //#when
    const commands = loadBuiltinCommands(disabledCommands);

    //#then
    expect(commands["wiki-ingest"]).toBeUndefined();
  });

  test("should exclude wiki-query when disabled", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = ["wiki-query"];

    //#when
    const commands = loadBuiltinCommands(disabledCommands);

    //#then
    expect(commands["wiki-query"]).toBeUndefined();
  });

  test("should exclude wiki-lint when disabled", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = ["wiki-lint"];

    //#when
    const commands = loadBuiltinCommands(disabledCommands);

    //#then
    expect(commands["wiki-lint"]).toBeUndefined();
  });

  test("should exclude wiki-update when disabled", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = ["wiki-update"];

    //#when
    const commands = loadBuiltinCommands(disabledCommands);

    //#then
    expect(commands["wiki-update"]).toBeUndefined();
  });
});

describe("WIKI_INIT_TEMPLATE", () => {
  test("should reference the canonical wiki root .omo/wiki/", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_INIT_TEMPLATE).toContain(".omo/wiki/");
  });

  test("should create the four canonical top-level files and pages directory", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_INIT_TEMPLATE).toContain("index.md");
    expect(WIKI_INIT_TEMPLATE).toContain("log.md");
    expect(WIKI_INIT_TEMPLATE).toContain("overview.md");
    expect(WIKI_INIT_TEMPLATE).toContain("SCHEMA.md");
    expect(WIKI_INIT_TEMPLATE).toContain("pages/");
  });

  test("should refuse to clobber an existing wiki without explicit user consent", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_INIT_TEMPLATE).toContain("already exists");
  });

  test("should declare the page front-matter contract", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_INIT_TEMPLATE).toContain("front-matter");
    expect(WIKI_INIT_TEMPLATE).toContain("sources");
    expect(WIKI_INIT_TEMPLATE).toContain("backlinks");
  });

  test("should not contain emojis", () => {
    //#given - the template string

    //#when / #then
    const emojiRegex =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(WIKI_INIT_TEMPLATE)).toBe(false);
  });
});

describe("WIKI_INGEST_TEMPLATE", () => {
  test("should require reading the source before writing anything", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_INGEST_TEMPLATE).toContain("Read");
    expect(WIKI_INGEST_TEMPLATE).toContain("source");
  });

  test("should ban writing claims that are not present in the source", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_INGEST_TEMPLATE).toContain("memory");
    expect(WIKI_INGEST_TEMPLATE).toContain("only what the source supports");
  });

  test("should require extracting takeaways before drafting the page", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_INGEST_TEMPLATE).toContain("Takeaways");
  });

  test("should require updating index.md and appending to log.md", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_INGEST_TEMPLATE).toContain("index.md");
    expect(WIKI_INGEST_TEMPLATE).toContain("log.md");
  });

  test("should require a backlink audit pass", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_INGEST_TEMPLATE).toContain("backlink");
  });

  test("should write pages under .omo/wiki/pages/", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_INGEST_TEMPLATE).toContain(".omo/wiki/pages/");
  });

  test("should not contain emojis", () => {
    //#given - the template string

    //#when / #then
    const emojiRegex =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(WIKI_INGEST_TEMPLATE)).toBe(false);
  });
});

describe("WIKI_QUERY_TEMPLATE", () => {
  test("should answer strictly from wiki contents and never from memory", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_QUERY_TEMPLATE).toContain("never");
    expect(WIKI_QUERY_TEMPLATE).toContain("memory");
  });

  test("should require reading index.md first", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_QUERY_TEMPLATE).toContain("index.md");
  });

  test("should require citing every claim by source", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_QUERY_TEMPLATE).toContain("cite");
  });

  test("should offer to save the answer as a new cited page", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_QUERY_TEMPLATE).toContain("save");
    expect(WIKI_QUERY_TEMPLATE).toContain("page");
  });

  test("should declare an explicit fallback when the wiki has no answer", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_QUERY_TEMPLATE).toContain("not in the wiki");
  });

  test("should not contain emojis", () => {
    //#given - the template string

    //#when / #then
    const emojiRegex =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(WIKI_QUERY_TEMPLATE)).toBe(false);
  });
});

describe("WIKI_LINT_TEMPLATE", () => {
  test("should detect contradictions across pages", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_LINT_TEMPLATE).toContain("contradiction");
  });

  test("should detect broken internal links", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_LINT_TEMPLATE).toContain("broken link");
  });

  test("should detect orphan pages with no inbound backlinks", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_LINT_TEMPLATE).toContain("orphan");
  });

  test("should detect coverage gaps", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_LINT_TEMPLATE).toContain("gap");
  });

  test("should write the report to pages/lint-report.md", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_LINT_TEMPLATE).toContain("pages/lint-report.md");
  });

  test("should not modify any other page", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_LINT_TEMPLATE).toContain("read-only");
  });

  test("should not contain emojis", () => {
    //#given - the template string

    //#when / #then
    const emojiRegex =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(WIKI_LINT_TEMPLATE)).toBe(false);
  });
});

describe("WIKI_UPDATE_TEMPLATE", () => {
  test("should show diffs of every modified page before writing", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_UPDATE_TEMPLATE).toContain("diff");
  });

  test("should require citing the new source for every changed claim", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_UPDATE_TEMPLATE).toContain("cite");
    expect(WIKI_UPDATE_TEMPLATE).toContain("source");
  });

  test("should sweep stale claims that no longer match the source", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_UPDATE_TEMPLATE).toContain("stale");
  });

  test("should append the update to log.md", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_UPDATE_TEMPLATE).toContain("log.md");
  });

  test("should bump the updated timestamp in front-matter", () => {
    //#given - the template string

    //#when / #then
    expect(WIKI_UPDATE_TEMPLATE).toContain("updated");
    expect(WIKI_UPDATE_TEMPLATE).toContain("front-matter");
  });

  test("should not contain emojis", () => {
    //#given - the template string

    //#when / #then
    const emojiRegex =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(WIKI_UPDATE_TEMPLATE)).toBe(false);
  });
});

describe("voice command", () => {
  test("should register voice command by default", () => {
    const commands = loadBuiltinCommands();
    expect(commands.voice).toBeDefined();
    expect(commands.voice.name).toBe("voice");
  });

  test("should have correct description", () => {
    const commands = loadBuiltinCommands();
    expect(commands.voice.description).toBe(
      "(builtin) Capture microphone audio and transcribe it to text via the voice tool",
    );
  });

  test("should include VOICE_TEMPLATE in template", () => {
    const commands = loadBuiltinCommands();
    expect(commands.voice.template).toContain(VOICE_TEMPLATE);
  });

  test("should mention voice tool and microphone in template", () => {
    const commands = loadBuiltinCommands();
    expect(commands.voice.template).toContain("voice");
    expect(commands.voice.template).toContain("microphone");
  });

  test("should exclude voice when disabled", () => {
    const commands = loadBuiltinCommands(["voice"]);
    expect(commands.voice).toBeUndefined();
  });
});

describe("VOICE_TEMPLATE", () => {
  test("should be a non-empty string", () => {
    expect(VOICE_TEMPLATE).toBeTruthy();
    expect(typeof VOICE_TEMPLATE).toBe("string");
  });

  test("should reference the voice tool", () => {
    expect(VOICE_TEMPLATE).toContain("`voice` tool");
  });

  test("should mention microphone and transcription", () => {
    expect(VOICE_TEMPLATE).toContain("microphone");
    expect(VOICE_TEMPLATE).toContain("transcribe");
  });

  test("should not contain emojis", () => {
    const emojiRegex =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(VOICE_TEMPLATE)).toBe(false);
  });
});
