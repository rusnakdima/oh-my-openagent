#!/usr/bin/env node
/**
 * openspec-mcp-cli.ts — CLI entry point for the OpenSpec MCP stdio server.
 * Bundled to dist/mcp/openspec-mcp-cli.js during build.
 *
 * Usage: node dist/mcp/openspec-mcp-cli.js [spec_dir]
 *
 * protocol: JSON-RPC 2.0 over stdio (line-delimited or Content-Length).
 * OpenCode spawns this as a subprocess and communicates via stdin/stdout.
 */

import { argv, stderr, stdin, stdout } from "node:process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const specDir = argv[2] ?? "openspec";
const cwd = process.cwd();

async function main(): Promise<void> {
  // Dynamically import the compiled MCP server module
  // The module is compiled alongside this CLI in dist/mcp/
  const thisFile = import.meta.url;
  const thisDir = dirname(fileURLToPath(thisFile));
  const require = createRequire(thisFile);

  // Try to resolve the compiled module
  let mcpModule: typeof import("./openspec-mcp.js");
  try {
    mcpModule = require(
      join(thisDir, "openspec-mcp.js"),
    ) as typeof import("./openspec-mcp.js");
  } catch {
    // Try as ESM
    try {
      mcpModule = await import(
        `${join(thisDir, "openspec-mcp.js")}?t=${Date.now()}`
      );
    } catch (err) {
      stderr.write(
        `Error: Could not load openspec-mcp module: ${
          err instanceof Error ? err.message : String(err)
        }\n`,
      );
      process.exitCode = 1;
      return;
    }
  }

  if (typeof mcpModule?.runOpenSpecMcpServer !== "function") {
    stderr.write(
      "Error: openspec-mcp module does not export runOpenSpecMcpServer\n",
    );
    process.exitCode = 1;
    return;
  }

  try {
    await mcpModule.runOpenSpecMcpServer(stdin, stdout, { specDir, cwd });
  } catch (err) {
    stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

main();
