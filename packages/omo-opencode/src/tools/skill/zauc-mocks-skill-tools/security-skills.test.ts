/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test";
import { builtinToLoadedSkill } from "../../../features/opencode-skill-loader/merger/builtin-skill-converter";
import { securityResearchSkill } from "../../../features/builtin-skills/skills/index";
import { createSkillTool, mockContext } from "./test-support";

describe("skill tool - bundled security skills", () => {
  // security-review was deliberately removed as a builtin (commit ffd656646,
  // "keep security review runtime-only" follow-up); only security-research remains.
  it("loads security-research when the plugin skill context pre-seeds it", async () => {
    const tool = createSkillTool({
      directory: "/test",
      skills: [builtinToLoadedSkill(securityResearchSkill)],
    });

    const researchResult = await tool.execute(
      { name: "security-research" },
      mockContext,
    );

    expect(researchResult).toContain(
      "Security Research - Team Mode Vulnerability Audit",
    );
  });
});
