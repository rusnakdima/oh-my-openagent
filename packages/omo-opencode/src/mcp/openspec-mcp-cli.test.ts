import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Readable, Writable } from "node:stream"
import { mkdir, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

let tmp: string
let specDir: string

function inputStream(messages: object[]): Readable {
  // Concatenate all JSON-RPC messages with newlines, then let Readable consume them
  const data = messages.map((m) => JSON.stringify(m)).join("\n") + "\n"
  return Readable.from([data])
}

function collectingWritable(chunks: string[]): Writable {
  return new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString())
      callback()
    },
  })
}

function parseResponses(chunks: string[]): Array<{ id: unknown; result?: unknown; error?: unknown }> {
  return chunks
    .join("")
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as { id: unknown; result?: unknown; error?: unknown })
}

beforeEach(async () => {
  tmp = join(tmpdir(), `openspec-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  specDir = "specs"
  await mkdir(join(tmp, specDir), { recursive: true })
})

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true })
})

// ─── runOpenSpecMcpServer tests ──────────────────────────────────────────────

describe("runOpenSpecMcpServer", () => {
  it("#given initialize request #when server starts #then returns protocol version + capabilities", async () => {
    const { runOpenSpecMcpServer } = await import("./openspec-mcp")

    const chunks: string[] = []
    const server = runOpenSpecMcpServer(inputStream([{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "test", version: "1.0.0" } } }]), collectingWritable(chunks), {
      specDir,
      cwd: tmp,
    })

    await server
    const responses = parseResponses(chunks)
    expect(responses).toHaveLength(1)
    expect(responses[0].id).toBe(1)
    expect((responses[0].result as { serverInfo: { name: string; version: string } }).serverInfo.name).toBe("openspec")
    expect((responses[0].result as { capabilities: { tools: unknown } }).capabilities.tools).toEqual({})
  })

  it("#given ping request #when server is initialized #then returns pong", async () => {
    const { runOpenSpecMcpServer } = await import("./openspec-mcp")

    const chunks: string[] = []
    const server = runOpenSpecMcpServer(
      inputStream([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "test", version: "1.0.0" } } },
        { jsonrpc: "2.0", id: 2, method: "ping" },
      ]),
      collectingWritable(chunks),
      { specDir, cwd: tmp },
    )

    await server
    const responses = parseResponses(chunks)
    expect(responses).toHaveLength(2)
    // Response to ping (id:2) is the second response
    const pong = responses.find((r) => r.id === 2)
    expect(pong?.result).toEqual({})
  })

  it("#given tools/list request #when server is initialized #then returns 6 tools", async () => {
    const { runOpenSpecMcpServer } = await import("./openspec-mcp")

    const chunks: string[] = []
    const server = runOpenSpecMcpServer(
      inputStream([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "test", version: "1.0.0" } } },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
      ]),
      collectingWritable(chunks),
      { specDir, cwd: tmp },
    )

    await server
    const responses = parseResponses(chunks)
    const toolsResp = responses.find((r) => r.id === 2)
    expect(toolsResp?.result).toBeDefined()
    const tools = (toolsResp?.result as { tools: unknown[] }).tools
    expect(tools).toHaveLength(6)
  })

  it("#given tools/call openspec_status #when spec exists #then returns task counts", async () => {
    // Create a spec before the server starts
    const specName = "status-spec"
    const specPath = join(tmp, specDir, specName)
    await mkdir(specPath, { recursive: true })
    await writeFile(join(specPath, "spec.md"), "# Status Spec\n\nDesc.\n")
    await writeFile(join(specPath, "plan.md"), "# Plan\n\n")
    await writeFile(join(specPath, "tasks.md"), "| [ ] | Open task |\n| [x] | Done task |\n")

    const { runOpenSpecMcpServer } = await import("./openspec-mcp")

    const chunks: string[] = []
    const server = runOpenSpecMcpServer(
      inputStream([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "test", version: "1.0.0" } } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "openspec_status", arguments: { spec_name: "status-spec" } } },
      ]),
      collectingWritable(chunks),
      { specDir, cwd: tmp },
    )

    await server
    const responses = parseResponses(chunks)
    const statusResp = responses.find((r) => r.id === 2)
    expect(statusResp?.result).toBeDefined()
    const text = (statusResp?.result as { content: Array<{ text: string }> }).content[0].text
    expect(text).toContain("status-spec")
    expect(text).toContain("1 open")
    expect(text).toContain("1 completed")
  })

  it("#given tools/call openspec_propose #when spec does not exist #then creates files", async () => {
    const { runOpenSpecMcpServer } = await import("./openspec-mcp")

    const chunks: string[] = []
    const server = runOpenSpecMcpServer(
      inputStream([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "test", version: "1.0.0" } } },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "openspec_propose",
            arguments: {
              title: "CLI Test Spec",
              spec_name: "cli-test-spec",
              requirements: "Requirement A.\nRequirement B.",
              plan_summary: "Do thing one.",
              tasks: [{ description: "Task 1" }],
            },
          },
        },
      ]),
      collectingWritable(chunks),
      { specDir, cwd: tmp },
    )

    await server
    const responses = parseResponses(chunks)
    const proposeResp = responses.find((r) => r.id === 2)
    expect(proposeResp?.result).toBeDefined()
    const text = (proposeResp?.result as { content: Array<{ text: string }> }).content[0].text
    expect(text).toContain("cli-test-spec")

    // Verify files were created
    const specFile = join(tmp, specDir, "cli-test-spec", "spec.md")
    const exists = await Bun.file(specFile).exists()
    expect(exists).toBe(true)
  })

  it("#given tools/call openspec_verify #when spec is valid #then returns verification results", async () => {
    // Create a valid spec
    const specName = "verify-spec"
    const specPath = join(tmp, specDir, specName)
    await mkdir(specPath, { recursive: true })
    await writeFile(join(specPath, "spec.md"), "# Verify Spec\n\nValid spec.\n")
    await writeFile(join(specPath, "plan.md"), "# Plan\n\nValid plan.\n")
    await writeFile(join(specPath, "tasks.md"), "| [ ] | Task 1 |\n")

    const { runOpenSpecMcpServer } = await import("./openspec-mcp")

    const chunks: string[] = []
    const server = runOpenSpecMcpServer(
      inputStream([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "test", version: "1.0.0" } } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "openspec_verify", arguments: { spec_name: "verify-spec" } } },
      ]),
      collectingWritable(chunks),
      { specDir, cwd: tmp },
    )

    await server
    const responses = parseResponses(chunks)
    const verifyResp = responses.find((r) => r.id === 2)
    expect(verifyResp?.result).toBeDefined()
    const text = (verifyResp?.result as { content: Array<{ text: string }> }).content[0].text
    expect(text).toContain("verify-spec")
    expect(text).toContain("spec.md")
    expect(text).toContain("plan.md")
    expect(text).toContain("tasks.md")
  })

  it("#given tools/call openspec_verify #when no specs exist #then returns no specs message", async () => {
    const { runOpenSpecMcpServer } = await import("./openspec-mcp")

    const chunks: string[] = []
    const server = runOpenSpecMcpServer(
      inputStream([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "test", version: "1.0.0" } } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "openspec_verify", arguments: {} } },
      ]),
      collectingWritable(chunks),
      { specDir, cwd: tmp },
    )

    await server
    const responses = parseResponses(chunks)
    const verifyResp = responses.find((r) => r.id === 2)
    expect(verifyResp?.result).toBeDefined()
    const text = (verifyResp?.result as { content: Array<{ text: string }> }).content[0].text
    expect(text).toContain("No specs found")
  })

  it("#given tools/call openspec_read #when spec file exists #then returns file content", async () => {
    const specName = "read-spec"
    const specPath = join(tmp, specDir, specName)
    await mkdir(specPath, { recursive: true })
    await writeFile(join(specPath, "spec.md"), "# Read Spec\n\nDescription here.\n")
    await writeFile(join(specPath, "plan.md"), "# Plan\n\nTask plan.\n")
    await writeFile(join(specPath, "tasks.md"), "| [ ] | Task 1 |\n")

    const { runOpenSpecMcpServer } = await import("./openspec-mcp")

    const chunks: string[] = []
    const server = runOpenSpecMcpServer(
      inputStream([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "test", version: "1.0.0" } } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "openspec_read", arguments: { file: "spec.md", spec_name: "read-spec" } } },
      ]),
      collectingWritable(chunks),
      { specDir, cwd: tmp },
    )

    await server
    const responses = parseResponses(chunks)
    const readResp = responses.find((r) => r.id === 2)
    expect(readResp?.result).toBeDefined()
    const text = (readResp?.result as { content: Array<{ text: string }> }).content[0].text
    expect(text).toContain("Read Spec")
    expect(text).toContain("Description here")
  })

  it("#given tools/call openspec_read #when file missing #then returns no file message", async () => {
    const specName = "empty-spec"
    const specPath = join(tmp, specDir, specName)
    await mkdir(specPath, { recursive: true })
    await writeFile(join(specPath, "spec.md"), "# Empty Spec\n\nOnly spec.md exists.\n")

    const { runOpenSpecMcpServer } = await import("./openspec-mcp")

    const chunks: string[] = []
    const server = runOpenSpecMcpServer(
      inputStream([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "test", version: "1.0.0" } } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "openspec_read", arguments: { file: "tasks.md", spec_name: "empty-spec" } } },
      ]),
      collectingWritable(chunks),
      { specDir, cwd: tmp },
    )

    await server
    const responses = parseResponses(chunks)
    const readResp = responses.find((r) => r.id === 2)
    expect(readResp?.result).toBeDefined()
    const text = (readResp?.result as { content: Array<{ text: string }> }).content[0].text
    expect(text).toContain("No tasks.md found")
  })

  it("#given tools/call openspec_archive #when spec exists #then moves spec to ARCHIVE", async () => {
    const specName = "archive-spec"
    const specPath = join(tmp, specDir, specName)
    await mkdir(specPath, { recursive: true })
    await writeFile(join(specPath, "spec.md"), "# Archive Spec\n\nTo be archived.\n")
    await writeFile(join(specPath, "plan.md"), "# Plan\n\n")
    await writeFile(join(specPath, "tasks.md"), "| [x] | Done |\n")

    const { runOpenSpecMcpServer } = await import("./openspec-mcp")

    const chunks: string[] = []
    const server = runOpenSpecMcpServer(
      inputStream([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "test", version: "1.0.0" } } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "openspec_archive", arguments: { spec_name: "archive-spec" } } },
      ]),
      collectingWritable(chunks),
      { specDir, cwd: tmp },
    )

    await server
    const responses = parseResponses(chunks)
    const archiveResp = responses.find((r) => r.id === 2)
    expect(archiveResp?.result).toBeDefined()
    const text = (archiveResp?.result as { content: Array<{ text: string }> }).content[0].text
    expect(text).toContain("archived")

    // Verify spec moved to ARCHIVE/
    const originalPath = join(tmp, specDir, "archive-spec", "spec.md")
    const archivedPath = join(tmp, specDir, "ARCHIVE", "archive-spec", "spec.md")
    expect(await Bun.file(originalPath).exists()).toBe(false)
    expect(await Bun.file(archivedPath).exists()).toBe(true)
  })

  it("#given tools/call openspec_archive #when spec not found #then returns isError", async () => {
    const { runOpenSpecMcpServer } = await import("./openspec-mcp")

    const chunks: string[] = []
    const server = runOpenSpecMcpServer(
      inputStream([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "test", version: "1.0.0" } } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "openspec_archive", arguments: { spec_name: "nonexistent" } } },
      ]),
      collectingWritable(chunks),
      { specDir, cwd: tmp },
    )

    await server
    const responses = parseResponses(chunks)
    const archiveResp = responses.find((r) => r.id === 2)
    expect((archiveResp?.result as { isError?: boolean })?.isError).toBe(true)
    const text = (archiveResp?.result as { content: Array<{ text: string }> }).content[0].text
    expect(text).toContain("not found")
  })

  it("#given tools/call with unknown method #then returns isError content", async () => {
    const { runOpenSpecMcpServer } = await import("./openspec-mcp")

    const chunks: string[] = []
    const server = runOpenSpecMcpServer(
      inputStream([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "test", version: "1.0.0" } } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "unknown_method", arguments: {} } },
      ]),
      collectingWritable(chunks),
      { specDir, cwd: tmp },
    )

    await server
    const responses = parseResponses(chunks)
    const unknownResp = responses.find((r) => r.id === 2) as Record<string, unknown> | undefined
    expect(unknownResp?.result).toBeDefined()
    // isError lives inside result, not at JSON-RPC response top level
    expect((unknownResp?.result as { isError?: boolean })?.isError).toBe(true)
    const resultContent = (unknownResp?.result as { content: Array<{ text: string }> }).content[0]
    expect(resultContent.text).toContain("Unknown tool")
  })

  it("#given invalid JSON-RPC #then returns parse error", async () => {
    const { runOpenSpecMcpServer } = await import("./openspec-mcp")

    // Use a custom readable that sends valid initialize then garbage
    const chunks: string[] = []
    const initReq = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "test", version: "1.0.0" } } }
    const readable = new Readable({
      read() {
        this.push(JSON.stringify(initReq) + "\n")
        this.push("this is not json\n")
        this.push(null) // EOF
      },
    })

    const server = runOpenSpecMcpServer(readable, collectingWritable(chunks), { specDir, cwd: tmp })

    await server
    const responses = parseResponses(chunks)
    // First response is the initialize result
    expect(responses[0].id).toBe(1)
    // Second response is the parse error
    expect(responses[1].error).toBeDefined()
    expect((responses[1].error as { code: number }).code).toBe(-32700)
  })
})
