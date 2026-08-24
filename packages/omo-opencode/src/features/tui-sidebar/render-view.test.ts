import { describe, expect, it } from "bun:test";

import { computeView } from "./compute-view";
import { buildViewNodes, describeView } from "./render-view";
import type { ComputeViewSections } from "./compute-view";
import type { SidebarView } from "./state-types";

const theme = {
  accent: "accent",
  borderSubtle: "border",
  error: "error",
  info: "info",
  success: "success",
  text: "text",
  textMuted: "muted",
  warning: "warning",
};

const activeSections: ComputeViewSections = {
  config: {
    kind: "invalid",
    messages: ["agents.sisyphus.model: expected string"],
  },
  roster: { kind: "empty" },
  agents: { kind: "list", agents: [{ name: "fixer", status: "busy" }] },
  jobs: {
    kind: "list",
    jobs: [{
      title: "explore repo",
      status: "running",
      toolCalls: 3,
      lastTool: "grep",
    }],
  },
  loop: {
    kind: "live",
    goalsDone: 0,
    goalsTotal: 1,
    pass: 1,
    fail: 1,
    pending: 0,
    blocked: 0,
    activeGoal: "g1",
  },
};

describe("tui sidebar renderView", () => {
  it("#given active view #when building nodes #then it renders ULW agents jobs and invalid banner in order", () => {
    // given
    const view = computeView(activeSections);

    // when
    const description = describeView(view);
    const nodes = buildViewNodes(view, theme);

    // then
    expect(description).toContain("config invalid");
    expect(description.indexOf("ULW")).toBeLessThan(
      description.indexOf("Agents"),
    );
    expect(description.indexOf("Agents")).toBeLessThan(
      description.indexOf("Jobs"),
    );
    expect(description).toContain("0/1");
    expect(description).toContain("pass 1");
    expect(description).toContain("fail 1");
    expect(description).toContain("fixer");
    expect(description).toContain("explore repo");
    expect(nodes[0]?.kind).toBe("box");
  });

  it("#given a redacted active goal #when describing #then it reports the active goal as private", () => {
    // given
    const view = computeView({
      ...activeSections,
      loop: { ...activeSections.loop, activeGoal: null },
    });

    // when
    const description = describeView(view);

    // then
    expect(description).toContain("active private");
    expect(description).not.toContain("active none");
  });

  it("#given broken view #when describing #then it includes config invalid and run doctor", () => {
    // given
    const view = computeView({
      config: {
        kind: "invalid",
        messages: ["agents.sisyphus.model: expected string"],
      },
      roster: { kind: "empty" },
      agents: { kind: "none" },
      jobs: { kind: "none" },
      loop: { kind: "none" },
    });

    // when
    const description = describeView(view);

    // then
    expect(view.kind).toBe("broken");
    expect(description).toContain("config invalid");
    expect(description).toContain("run doctor");
    expect(description).toContain("agents.sisyphus.model");
  });

  it("#given idle roster #when rendering #then it lists configured model rows with mode suffix", () => {
    // given
    const view: SidebarView = {
      kind: "idle",
      roster: {
        kind: "rows",
        rows: [{
          label: "sisyphus",
          mode: "primary",
          model: "gpt-5.5",
          effectiveModel: "openai/gpt-5.5",
          hasOverride: false,
          isGlobal: false,
        }],
      },
      modal: { kind: "closed" },
    };

    // when
    const description = describeView(view);
    const nodes = buildViewNodes(view, theme);

    // then
    expect(description).toContain("sisyphus");
    expect(description).toContain("gpt-5.5");
    expect(description).toContain("(primary)");
    expect(description).toContain("sisyphus (primary) — gpt-5.5");
    expect(nodes[0]?.kind).toBe("box");
  });

  it("#given idle roster with subagent mode #when rendering #then mode suffix appears", () => {
    // given
    const view: SidebarView = {
      kind: "idle",
      roster: {
        kind: "rows",
        rows: [{
          label: "explore",
          mode: "subagent",
          model: "gpt-5-nano",
          effectiveModel: "openai/gpt-5-nano",
          hasOverride: false,
          isGlobal: true,
        }],
      },
      modal: { kind: "closed" },
    };

    // when
    const description = describeView(view);

    // then
    expect(description).toContain("explore (subagent) — gpt-5-nano");
  });

  it("#given roster row with no model #when rendering #then mode suffix still appears", () => {
    // given
    const view: SidebarView = {
      kind: "idle",
      roster: {
        kind: "rows",
        rows: [{
          label: "librarian",
          mode: "subagent",
          model: "—",
          effectiveModel: "—",
          hasOverride: false,
          isGlobal: false,
        }],
      },
      modal: { kind: "closed" },
    };

    // when
    const description = describeView(view);

    // then
    expect(description).toContain("librarian (subagent)");
    expect(description).not.toContain("—");
  });
});
