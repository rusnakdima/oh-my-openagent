/// <reference path="../../../../../../bun-test.d.ts" />

import { describe, expect, test } from "bun:test"
import { openchromeAsideSkill } from "./openchrome-aside-skill"

function orderedIndexes(source: string, markers: readonly string[]): readonly number[] {
  return markers.map((marker) => source.indexOf(marker))
}

describe("openchromeAsideSkill", () => {
  test("#given the tiered browser skill #when inspected #then it keeps the canonical playwright name and browser trigger", () => {
    // #then
    expect(openchromeAsideSkill.name).toBe("playwright")
    expect(openchromeAsideSkill.description).toContain("MUST USE")
    expect(openchromeAsideSkill.description.toLowerCase()).toContain("browser")
  })

  test("#given graceful-fallback requirement #when inspecting tooling #then allowedTools is omitted and no MCP is pre-configured", () => {
    // #then - allowedTools omitted so the agent keeps Bash + Read + skill_mcp
    expect(openchromeAsideSkill.allowedTools).toBeUndefined()
    // No mcpConfig - the tiered skill delegates via Bash + LLM, not via an MCP server
    expect(openchromeAsideSkill.mcpConfig).toBeUndefined()
  })

  test("#given the ask-first routing #when reading the template #then aside precedes openchrome precedes Playwright MCP fallback", () => {
    // #given
    const template = openchromeAsideSkill.template
    const markers = [
      "Tier 1: Aside LLM Reasoning",
      "Tier 2: Openchrome",
      "Tier 3: Playwright MCP",
      "## Decision Flow",
    ] as const

    // #when
    const markerIndexes = orderedIndexes(template, markers)

    // #then - every tier present, strictly ordered aside -> openchrome -> playwright -> install
    expect(markerIndexes.every((index) => index >= 0)).toBe(true)
    expect(markerIndexes).toEqual([...markerIndexes].sort((left, right) => left - right))
  })

  test("#given detection + install guidance #when reading the template #then openchrome version check, install hint, and playwright MCP fallback are present", () => {
    // #given
    const template = openchromeAsideSkill.template

    // #then
    expect(template).toContain("openchrome --version")
    expect(template).toContain("@playwright/mcp@latest")
    expect(template).toContain("Graceful degradation")
    expect(template).toContain("https://github.com/openchatsuite/openchrome")
  })
})
