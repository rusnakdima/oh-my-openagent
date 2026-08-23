/**
 * openspec-mcp.ts — Thin stdio MCP server for OpenSpec tools.
 *
 * Wraps the native OpenSpec tools as an MCP server so external consumers
 * (Codex, Claude Code, other MCP clients) can use OpenSpec without the
 * native OpenCode tool registration.
 *
 * Transport: JSON-RPC 2.0 over stdio (line-delimited or Content-Length).
 * Server name: openspec, version: 1.0.0.
 */

import type { Readable, Writable } from "node:stream";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  errorResponse,
  isPlainRecord,
  jsonRpcId,
  type JsonRpcResponse,
  type JsonRpcResult,
  runJsonRpcStdioServer,
  successResponse,
} from "@oh-my-opencode/mcp-stdio-core";
import {
  createOpenSpecMcpTools,
  handleOpenSpecMcpRequest,
} from "./openspec-tools";
import type { LocalMcpConfig } from "./lsp";

export const OPENSEPC_MCP_SERVER_NAME = "openspec";
export const OPENSEPC_MCP_SERVER_VERSION = "1.0.0";

export type OpenSpecMcpOptions = {
  readonly specDir?: string;
  readonly cwd?: string;
};

export async function handleOpenSpecMcpRequestRpc(
  input: unknown,
  options: OpenSpecMcpOptions = {},
): Promise<JsonRpcResponse | undefined> {
  if (!isPlainRecord(input)) {
    return errorResponse(null, -32600, "Invalid Request");
  }

  const id = jsonRpcId(input["id"]);
  const method = input["method"];

  if (method === "notifications/initialized") return undefined;
  if (method === "ping") return successResponse(id, {});

  if (method === "initialize") {
    return successResponse(id, {
      capabilities: { tools: {} },
      serverInfo: {
        name: OPENSEPC_MCP_SERVER_NAME,
        version: OPENSEPC_MCP_SERVER_VERSION,
      },
      protocolVersion: "2024-11-05",
    });
  }

  if (method === "tools/list") {
    const tools = createOpenSpecMcpTools({
      specDir: options.specDir ?? "openspec",
    });
    return successResponse(id, { tools });
  }

  if (method === "tools/call") {
    const params = input["params"] as {
      name: string;
      arguments?: Record<string, unknown>;
    } | undefined;
    if (!isPlainRecord(params)) {
      return errorResponse(id, -32602, "Invalid params for tools/call");
    }
    try {
      const result = await handleOpenSpecMcpRequest(
        params.name,
        params.arguments ?? {},
        options.cwd ?? process.cwd(),
        options.specDir ?? "openspec",
      );
      return successResponse(id, result as unknown as JsonRpcResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return successResponse(id, {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      });
    }
  }

  return errorResponse(id, -32601, `Method not found: ${String(method)}`);
}

export async function runOpenSpecMcpServer(
  input: Readable = process.stdin,
  output: Writable = process.stdout,
  options: OpenSpecMcpOptions = {},
): Promise<void> {
  await runJsonRpcStdioServer({
    input,
    output,
    handler: async (request) => handleOpenSpecMcpRequestRpc(request, options),
    handlerOptions: undefined,
    idleTimeoutMs: 0,
  });
}

export type OpenSpecMcpConfigOptions = {
  readonly specDir?: string;
  readonly cwd?: string;
  readonly moduleUrl?: string;
};

export function createOpenSpecMcpConfig(
  options: OpenSpecMcpConfigOptions = {},
): LocalMcpConfig & { type: "local" } {
  const moduleDir = options.moduleUrl
    ? dirname(fileURLToPath(options.moduleUrl))
    : dirname(fileURLToPath(import.meta.url));
  // Build script outputs to dist/mcp/ (not dist/ directly)
  const distCliPath = resolve(moduleDir, "mcp", "openspec-mcp-cli.js");
  const sourceCliPath = resolve(moduleDir, "mcp", "openspec-mcp-cli.ts");

  let command: string;
  try {
    require.resolve(distCliPath);
    command = distCliPath;
  } catch {
    command = sourceCliPath;
  }

  return {
    type: "local",
    command: ["bun", command, options.specDir ?? "openspec"],
    enabled: true,
    cwd: resolve(options.cwd ?? process.cwd()),
  };
}
