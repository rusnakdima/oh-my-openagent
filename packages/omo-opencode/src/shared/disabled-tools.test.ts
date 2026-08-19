import { describe, expect, it } from "bun:test"
import { filterDisabledTools } from "./disabled-tools"

const makeTool = (name: string) => ({ name, description: `Tool ${name}` } as const)
const TOOLS = {
  "comment-checker": makeTool("comment-checker"),
  "comment-checker-verbose": makeTool("comment-checker-verbose"),
  "grep": makeTool("grep"),
  "glob": makeTool("glob"),
  "lsp_install_decision": makeTool("lsp_install_decision"),
}

describe("filterDisabledTools", () => {
  it("returns all tools when disabledTools is empty", () => {
    const result = filterDisabledTools(TOOLS, [])
    expect(Object.keys(result)).toEqual(["comment-checker", "comment-checker-verbose", "grep", "glob", "lsp_install_decision"])
  })

  it("returns all tools when disabledTools is undefined", () => {
    const result = filterDisabledTools(TOOLS, undefined)
    expect(Object.keys(result)).toEqual(["comment-checker", "comment-checker-verbose", "grep", "glob", "lsp_install_decision"])
  })

  it("disables tools by exact name", () => {
    const result = filterDisabledTools(TOOLS, ["grep"])
    expect(Object.keys(result)).toEqual(["comment-checker", "comment-checker-verbose", "glob", "lsp_install_decision"])
  })

  it("disables tools by wildcard prefix", () => {
    const result = filterDisabledTools(TOOLS, ["comment-checker*"])
    expect(Object.keys(result)).toEqual(["grep", "glob", "lsp_install_decision"])
  })

  it("disables tools by wildcard and exact name together", () => {
    const result = filterDisabledTools(TOOLS, ["comment-checker*", "glob"])
    expect(Object.keys(result)).toEqual(["grep", "lsp_install_decision"])
  })

  it("handles wildcard at end only", () => {
    const result = filterDisabledTools(TOOLS, ["lsp_*"])
    expect(Object.keys(result)).toEqual(["comment-checker", "comment-checker-verbose", "grep", "glob"])
  })

  it("returns empty when all tools are disabled", () => {
    const result = filterDisabledTools(TOOLS, ["comment-checker*", "grep", "glob", "lsp_*"])
    expect(Object.keys(result)).toEqual([])
  })
})
