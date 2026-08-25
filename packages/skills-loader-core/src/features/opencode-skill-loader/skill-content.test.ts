/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { debuggingSkill, playwrightSkill } from "../builtin-skills/skills/index";
import {
  clearSkillCache,
  resolveMultipleSkills,
  resolveSkillContent,
} from "./skill-content";

function createNestedSkill(
  baseDir: string,
  namespace: string,
  name: string,
  content: string,
): void {
  const dir = join(baseDir, "skills", namespace, name);
  mkdirSync(dir, { recursive: true });
  const yaml =
    `---\nname: ${name}\ndescription: ${namespace}/${name} skill\n---\n${content}`;
  writeFileSync(join(dir, "SKILL.md"), yaml);
}

let originalEnv: Record<string, string | undefined>;
let testConfigDir: string;

beforeEach(() => {
  clearSkillCache();
  originalEnv = {
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    OPENCODE_CONFIG_DIR: process.env.OPENCODE_CONFIG_DIR,
  };
  const unique = `skill-content-test-${Date.now()}-${
    Math.random().toString(16).slice(2)
  }`;
  testConfigDir = join(tmpdir(), unique);
  process.env.CLAUDE_CONFIG_DIR = testConfigDir;
  process.env.OPENCODE_CONFIG_DIR = testConfigDir;
});

afterEach(() => {
  clearSkillCache();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value !== undefined) {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
});

describe("resolveSkillContent", () => {
  it("should return template for existing skill", () => {
    // given: builtin skills with 'frontend' skill
    // when: resolving content for 'frontend'
    const result = resolveSkillContent("playwright");

    // then: returns the playwright source template
    expect(result === playwrightSkill.template).toBe(true);
  });

  it("should return template for 'playwright' skill", () => {
    // given: builtin skills with 'playwright' skill
    // when: resolving content for 'playwright'
    const result = resolveSkillContent("playwright");

    // then: returns the playwright source template
    expect(result === playwrightSkill.template).toBe(true);
  });

  it("should return null for non-existent skill", () => {
    // given: builtin skills without 'nonexistent' skill
    // when: resolving content for 'nonexistent'
    const result = resolveSkillContent("nonexistent");

    // then: returns null
    expect(result).toBeNull();
  });

  it("should return null for disabled skill", () => {
    // given: playwright skill disabled
    const options = { disabledSkills: new Set(["playwright"]) };

    // when: resolving content for disabled skill
    const result = resolveSkillContent("frontend", options);

    // then: returns null
    expect(result).toBeNull();
  });
});

describe("resolveMultipleSkills", () => {
  it("should resolve all existing skills", () => {
    // given: list of existing skill names
    const skillNames = ["debugging", "playwright"];

    // when: resolving multiple skills
    const result = resolveMultipleSkills(skillNames);

    // then: all skills resolve to their source templates in request order
    expect([...result.resolved.entries()]).toEqual([
      ["debugging", debuggingSkill.template],
      ["playwright", playwrightSkill.template],
    ]);
    expect(result.notFound).toEqual([]);
  });

  it("should handle partial success - some skills not found", () => {
    // given: list with existing and non-existing skills
    const skillNames = ["playwright", "nonexistent", "another-missing"];

    // when: resolving multiple skills
    const result = resolveMultipleSkills(skillNames);

    // then: resolves the correct source templates and preserves missing-name order
    expect([...result.resolved.entries()]).toEqual([[
      "playwright",
      playwrightSkill.template,
    ]]);
    expect(result.notFound).toEqual(["nonexistent", "another-missing"]);
  });

  it("should handle empty array", () => {
    // given: empty skill names list
    const skillNames: string[] = [];

    // when: resolving multiple skills
    const result = resolveMultipleSkills(skillNames);

    // then: returns empty resolved and notFound
    expect(result.resolved.size).toBe(0);
    expect(result.notFound).toEqual([]);
  });

  it("should handle all skills not found", () => {
    // given: list of non-existing skills
    const skillNames = ["skill-one", "skill-two", "skill-three"];

    // when: resolving multiple skills
    const result = resolveMultipleSkills(skillNames);

    // then: no skills resolved, all in notFound
    expect(result.resolved.size).toBe(0);
    expect(result.notFound).toEqual(["skill-one", "skill-two", "skill-three"]);
  });

  it("should treat disabled skills as not found", () => {
    // #given: playwright disabled, debugging not disabled
    const skillNames = ["playwright", "debugging"];
    const options = { disabledSkills: new Set(["playwright"]) };

    // #when: resolving multiple skills with disabled one
    const result = resolveMultipleSkills(skillNames, options);

    // #then: disabled skill is not found, the rest resolves to its source template
    expect([...result.resolved.entries()]).toEqual([[
      "debugging",
      debuggingSkill.template,
    ]]);
    expect(result.notFound).toEqual(["playwright"]);
  });

  it("should preserve skill order in resolved map", () => {
    // given: list of skill names in specific order
    const skillNames = ["playwright", "debugging"];

    // when: resolving multiple skills
    const result = resolveMultipleSkills(skillNames);

    // then: map preserves request order and routes each key to the correct source template
    expect([...result.resolved.entries()]).toEqual([
      ["playwright", playwrightSkill.template],
      ["debugging", debuggingSkill.template],
    ]);
  });
});
