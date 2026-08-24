import { homedir } from "node:os";
import { posix } from "node:path";

import {
  loadOmoOpenCodeConfigChain,
  type OmoOpenCodeConfigView,
} from "../../plugin-config/omo-config-chain";
import { OhMyOpenCodeConfigSchema } from "../../config/schema/oh-my-opencode-config";

export type ConfigLayerInfo = {
  readonly index: number;
  readonly scope: "project" | "user" | "defaults";
  readonly path: string;
};

export type ExplainResult = {
  readonly key: string;
  readonly value: unknown;
  readonly source: string;
  readonly defaultValue: unknown;
};

function inferScope(
  view: OmoOpenCodeConfigView,
  projectCwd: string,
): "project" | "user" | "defaults" {
  const homeDir = homedir();
  const normalizedHome = posix.resolve(homeDir);
  const normalizedPath = posix.resolve(view.path);

  if (
    normalizedPath.startsWith(normalizedHome + "/.omo/") ||
    normalizedPath === posix.join(normalizedHome, ".omo", "omo.jsonc")
  ) {
    return "user";
  }
  if (normalizedPath.includes("/.omo/omo.jsonc")) {
    return "project";
  }
  return "defaults";
}

function formatScope(scope: "project" | "user" | "defaults"): string {
  switch (scope) {
    case "project":
      return "Project";
    case "user":
      return "User";
    case "defaults":
      return "Defaults (schema)";
  }
}

function shortPath(path: string): string {
  const homeDir = homedir();
  if (path.includes("/.omo/omo.jsonc")) {
    const idx = path.indexOf("/.omo/omo.jsonc");
    const prefix = path.substring(0, idx);
    if (prefix === homeDir || prefix === posix.resolve(homeDir)) {
      return "~/.omo/omo.jsonc";
    }
    return `${posix.basename(prefix)}/.omo/omo.jsonc`;
  }
  return path;
}

function getValueAtKey(config: Record<string, unknown>, key: string): unknown {
  if (key in config) {
    return config[key];
  }
  return undefined;
}

export function listConfigLayers(
  cwd: string = process.cwd(),
): ConfigLayerInfo[] {
  const chain = loadOmoOpenCodeConfigChain(cwd);
  const result: ConfigLayerInfo[] = [];

  for (let i = 0; i < chain.views.length; i++) {
    const view = chain.views[i];
    const scope = inferScope(view, cwd);
    result.push({
      index: result.length + 1,
      scope,
      path: view.path,
    });
  }

  if (result.length === 0) {
    result.push({
      index: 1,
      scope: "defaults",
      path: "Defaults (schema)",
    });
  }

  return result;
}

export function explainConfigKey(
  key: string,
  cwd: string = process.cwd(),
): ExplainResult | null {
  const chain = loadOmoOpenCodeConfigChain(cwd);

  const schemaDefaults = OhMyOpenCodeConfigSchema.parse({});

  let sourceView: OmoOpenCodeConfigView | null = null;

  for (let i = chain.views.length - 1; i >= 0; i--) {
    const view = chain.views[i];
    const value = getValueAtKey(view.config, key);
    if (value !== undefined) {
      sourceView = view;
      break;
    }
  }

  let source: string;
  let value: unknown;

  if (sourceView !== null) {
    const scope = inferScope(sourceView, cwd);
    const short = shortPath(sourceView.path);
    source = `${formatScope(scope)} ${short}`;
    value = getValueAtKey(sourceView.config, key);
  } else {
    source = "Defaults (schema)";
    value = schemaDefaults[key as keyof typeof schemaDefaults];
  }

  const defaultValue = schemaDefaults[key as keyof typeof schemaDefaults];

  return {
    key,
    value,
    source,
    defaultValue,
  };
}

export function printConfigLayers(cwd: string = process.cwd()): void {
  const layers = listConfigLayers(cwd);
  console.log("Config layers (nearest to farthest):");
  for (const layer of layers) {
    console.log(
      `  ${layer.index}. ${formatScope(layer.scope)}: ${shortPath(layer.path)}`,
    );
  }
}

export function printExplainResult(
  key: string,
  cwd: string = process.cwd(),
): void {
  const result = explainConfigKey(key, cwd);
  if (result === null) {
    console.log(`Key '${key}' not found in any layer.`);
    return;
  }

  const valueStr = JSON.stringify(result.value, null, 0);
  console.log(`${result.key}: ${valueStr}`);
  console.log(`  Source: ${result.source}`);
  if (
    result.defaultValue !== undefined &&
    JSON.stringify(result.value) !== JSON.stringify(result.defaultValue)
  ) {
    console.log(`  Default: ${JSON.stringify(result.defaultValue, null, 0)}`);
  }
}
