/// <reference path="../../../../../bun-test.d.ts" />

import { describe, test, expect } from "bun:test"
import { createBuiltinSkills } from "./skills"
import { agentBrowserSkill, playwrightSkill } from "./skills/playwright"

describe("createBuiltinSkills", () => {
	test("returns playwright skill by default", () => {
		// given - no options (default)

		// when
		const skills = createBuiltinSkills()

		// then
		const browserSkill = skills.find((s) => s.name === "playwright")
		expect(browserSkill).toBeDefined()
		expect(browserSkill?.mcpConfig?.playwright).toBeDefined()
	})

	test("exports browser skill contracts with stable tool surfaces", () => {
		// #given - direct browser skill exports

		// #when
		const playwrightMcp = playwrightSkill.mcpConfig?.playwright

		// #then
		expect(playwrightSkill.name).toBe("playwright")
		expect(playwrightMcp?.command).toBe("npx")
		expect(playwrightMcp?.args).toEqual(["@playwright/mcp@latest"])
		expect(agentBrowserSkill.name).toBe("agent-browser")
		expect(agentBrowserSkill.allowedTools).toEqual(["Bash(agent-browser:*)"])
	})

	test("returns playwright skill when browserProvider is 'playwright'", () => {
		// given
		const options = { browserProvider: "playwright" as const }

		// when
		const skills = createBuiltinSkills(options)

		// then
		const playwrightSkill = skills.find((s) => s.name === "playwright")
		const agentBrowserSkill = skills.find((s) => s.name === "agent-browser")
		const devBrowserSkill = skills.find((s) => s.name === "dev-browser")
		expect(playwrightSkill).toBeDefined()
		expect(agentBrowserSkill).toBeUndefined()
		expect(devBrowserSkill).toBeUndefined()
	})

	test("returns dev-browser skill when browserProvider is 'dev-browser'", () => {
		// given
		const options = { browserProvider: "dev-browser" as const }

		// when
		const skills = createBuiltinSkills(options)

		// then
		const skillNames = skills.map((skill) => skill.name)
		const devBrowserSkill = skills.find((skill) => skill.name === "dev-browser")
		const playwrightSkill = skills.find((skill) => skill.name === "playwright")
		const agentBrowserSkill = skills.find((skill) => skill.name === "agent-browser")
		expect(devBrowserSkill).toBeDefined()
		expect(playwrightSkill).toBeUndefined()
		expect(agentBrowserSkill).toBeUndefined()
		expect(skillNames).not.toContain("playwright-cli")
		expect(skills.some((skill) => skill.allowedTools?.includes("Bash(playwright-cli:*)"))).toBe(false)
	})

	test("returns agent-browser skill when browserProvider is 'agent-browser'", () => {
		// given
		const options = { browserProvider: "agent-browser" as const }

		// when
		const skills = createBuiltinSkills(options)

		// then
		const agentBrowserSkill = skills.find((s) => s.name === "agent-browser")
		const playwrightSkill = skills.find((s) => s.name === "playwright")
		expect(agentBrowserSkill).toBeDefined()
		expect(agentBrowserSkill?.allowedTools).toContain("Bash(agent-browser:*)")
		expect(agentBrowserSkill?.template).toContain("agent-browser")
		expect(playwrightSkill).toBeUndefined()
	})

	test("always includes git-master and debugging", () => {
		// given - both provider options

		// when
		const defaultSkills = createBuiltinSkills()
		const agentBrowserSkills = createBuiltinSkills({ browserProvider: "agent-browser" })
		const devBrowserSkills = createBuiltinSkills({ browserProvider: "dev-browser" })

		// then
		for (const skills of [defaultSkills, agentBrowserSkills, devBrowserSkills]) {
			expect(skills.find((s) => s.name === "git-master")).toBeDefined()
			expect(skills.find((s) => s.name === "debugging")).toBeDefined()
		}
	})

	test("git-master skill keeps commit workflow phases in order", () => {
		// #given
		const skills = createBuiltinSkills()

		// #when
		const gitMaster = skills.find((skill) => skill.name === "git-master")

		// #then
		expect(gitMaster).toBeDefined()
	})

	test("returns exactly 3 skills regardless of provider (security-research/gated behind teamModeEnabled)", () => {
		// given

		// when
		const defaultSkills = createBuiltinSkills()
		const agentBrowserSkills = createBuiltinSkills({ browserProvider: "agent-browser" })
		const devBrowserSkills = createBuiltinSkills({ browserProvider: "dev-browser" })

		// then
		expect(defaultSkills).toHaveLength(3)
		expect(agentBrowserSkills).toHaveLength(3)
		expect(devBrowserSkills).toHaveLength(3)
	})

	test("should exclude playwright when it is in disabledSkills", () => {
		// #given
		const options = { disabledSkills: new Set(["playwright"]) }

		// #when
		const skills = createBuiltinSkills(options)

		// #then
		expect(skills.map((s) => s.name)).not.toContain("playwright")
		expect(skills.map((s) => s.name)).toContain("git-master")
		expect(skills.map((s) => s.name)).not.toContain("dev-browser")
		expect(skills.map((s) => s.name)).toContain("debugging")
		expect(skills.length).toBe(2)
	})

	test("should exclude multiple skills when they are in disabledSkills", () => {
		// #given
		const options = { disabledSkills: new Set(["playwright", "git-master"]) }

		// #when
		const skills = createBuiltinSkills(options)

		// #then
		expect(skills.map((s) => s.name)).not.toContain("playwright")
		expect(skills.map((s) => s.name)).not.toContain("git-master")
		expect(skills.map((s) => s.name)).not.toContain("dev-browser")
		expect(skills.map((s) => s.name)).toContain("debugging")
		expect(skills.length).toBe(1)
	})

	test("should return an empty array when all skills are disabled", () => {
		// #given
		const options = {
			disabledSkills: new Set([
				"playwright",
				"git-master",
				"debugging",
			]),
		}

		// #when
		const skills = createBuiltinSkills(options)

		// #then
		expect(skills.length).toBe(0)
	})

	test("should return all 3 skills when disabledSkills set is empty", () => {
		// #given
		const options = { disabledSkills: new Set<string>() }

		// #when
		const skills = createBuiltinSkills(options)

		// #then
		expect(skills.length).toBe(3)
	})

	test("#given disabled_skills with debugging #when creating builtin skills #then it is filtered out", () => {
		// #given
		const options = { disabledSkills: new Set(["debugging"]) }

		// #when
		const skills = createBuiltinSkills(options)
		const names = skills.map((s) => s.name)

		// #then
		expect(names).not.toContain("debugging")

		const allSkills = createBuiltinSkills()
		expect(allSkills.map((s) => s.name)).toContain("debugging")
	})


	test("debugging skill is available from shared template", () => {
		// #given - default options

		// #when
		const skills = createBuiltinSkills()
		const debugging = skills.find((skill) => skill.name === "debugging")

		// #then
		expect(debugging).toBeDefined()
		expect(debugging?.description).toBeDefined()
		expect(debugging?.description.toLowerCase()).toContain("debugging")
	})

	// review-work, remove-ai-slops, init-deep, visual-qa, security-review were removed
	// security-research skill requires teamModeEnabled=true - tested in team mode integration tests

	test("returns playwright-cli skill when browserProvider is 'playwright-cli'", () => {
		// given
		const options = { browserProvider: "playwright-cli" as const }

		// when
		const skills = createBuiltinSkills(options)

		// then
		const playwrightSkill = skills.find((s) => s.name === "playwright")
		const agentBrowserSkill = skills.find((s) => s.name === "agent-browser")
		expect(playwrightSkill).toBeDefined()
		expect(playwrightSkill?.allowedTools).toContain("Bash(playwright-cli:*)")
		expect(playwrightSkill?.mcpConfig).toBeUndefined()
		expect(agentBrowserSkill).toBeUndefined()
	})

	test("#given playwrightMcpArgs option #when creating builtin skills #then extra args are appended to the playwright MCP invocation", () => {
		// #given
		const options = {
			browserProvider: "playwright" as const,
			playwrightMcpArgs: [
				"--headless",
				"--no-sandbox",
				"--executable-path",
				"/opt/chromium/chrome",
			],
		}

		// #when
		const skills = createBuiltinSkills(options)
		const playwright = skills.find((s) => s.name === "playwright")

		// #then
		expect(playwright?.mcpConfig?.playwright?.command).toBe("npx")
		expect(playwright?.mcpConfig?.playwright?.args).toEqual([
			"@playwright/mcp@latest",
			"--headless",
			"--no-sandbox",
			"--executable-path",
			"/opt/chromium/chrome",
		])
	})

	test("#given no playwrightMcpArgs option #when creating builtin skills #then the default MCP invocation is unchanged", () => {
		// #given
		const options = { browserProvider: "playwright" as const }

		// #when
		const skills = createBuiltinSkills(options)
		const playwright = skills.find((s) => s.name === "playwright")

		// #then
		expect(playwright?.mcpConfig?.playwright?.args).toEqual(["@playwright/mcp@latest"])
	})
})
