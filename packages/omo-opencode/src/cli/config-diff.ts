import color from "picocolors"
import { OhMyOpenCodeConfigSchema } from "../config/schema/oh-my-opencode-config"
import { validatePluginConfig } from "../config/validate"
import { findUnknownKeyPaths } from "../plugin-config/unknown-key-diagnostics"

export type DiffStatus = "user" | "default" | "unknown"

export interface DiffEntry {
  path: string
  status: DiffStatus
  userValue?: unknown
  defaultValue?: unknown
}

function pathToString(path: readonly PropertyKey[]): string {
  return path.map((k) => (typeof k === "number" ? `[${k}]` : k)).join(".")
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function computeDiff(
  user: unknown,
  defaults: unknown,
  unknownPaths: readonly (readonly PropertyKey[])[],
  path: readonly PropertyKey[]
): DiffEntry[] {
  const results: DiffEntry[] = []
  const pathStr = pathToString(path)
  const isUnknown = unknownPaths.some((p) => pathToString(p) === pathStr)

  if (isUnknown) {
    results.push({ path: pathStr, status: "unknown", userValue: user })
    return results
  }

  if (!isPlainRecord(user) || !isPlainRecord(defaults)) {
    if (user !== defaults) {
      results.push({ path: pathStr, status: "user", userValue: user, defaultValue: defaults })
    }
    return results
  }

  const allKeys = new Set([...Object.keys(user), ...Object.keys(defaults)])

  for (const key of allKeys) {
    const userVal = (user as Record<string, unknown>)[key]
    const defaultVal = (defaults as Record<string, unknown>)[key]
    const hasInUser = key in (user as Record<string, unknown>)
    const hasInDefaults = key in (defaults as Record<string, unknown>)

    if (hasInUser && !hasInDefaults) {
      // Unknown key according to schema
      results.push({ path: pathStr ? `${pathStr}.${key}` : key, status: "unknown", userValue: userVal })
    } else if (!hasInUser && hasInDefaults) {
      // Key exists only in defaults — show only if no --path filter (defaults are filtered)
      results.push({ path: pathStr ? `${pathStr}.${key}` : key, status: "default", defaultValue: defaultVal })
    } else if (isPlainRecord(userVal) && isPlainRecord(defaultVal)) {
      results.push(...computeDiff(userVal, defaultVal, unknownPaths, [...path, key]))
    } else if (userVal !== defaultVal) {
      results.push({
        path: pathStr ? `${pathStr}.${key}` : key,
        status: "user",
        userValue: userVal,
        defaultValue: defaultVal,
      })
    }
  }

  return results
}

export function runConfigDiff(options: { json?: boolean; path?: string }): number {
  const validation = validatePluginConfig(process.cwd())
  const defaults = OhMyOpenCodeConfigSchema.parse({}) as Record<string, unknown>
  const userConfig = validation.valid ? (validation.config as unknown as Record<string, unknown>) : {}

  const unknownPaths = findUnknownKeyPaths(OhMyOpenCodeConfigSchema, userConfig)
  const diff = computeDiff(userConfig, defaults, unknownPaths, [])

  // Filter by --path if provided
  const filtered = options.path
    ? diff.filter((e) => e.path.startsWith(options.path!))
    : diff.filter((e) => e.status !== "default")

  if (options.json) {
    console.log(JSON.stringify(filtered, null, 2))
    return 0
  }

  if (filtered.length === 0) {
    console.log("No differences found.")
    return 0
  }

  const colPath = color.bold("Path")
  const colStatus = color.bold("Status")
  const colValue = color.bold("Value")

  console.log("=== Config Diff ===")
  console.log(`${colPath.padEnd(32)} ${colStatus.padEnd(10)} ${colValue}`)
  console.log(String().padEnd(64, "-"))

  for (const entry of filtered) {
    const path = entry.path.padEnd(32)
    let status: string
    let value: string

    switch (entry.status) {
      case "user":
        status = color.green("user")
        value = JSON.stringify(entry.userValue)
        break
      case "default":
        status = color.yellow("default")
        value = `(not set)`
        break
      case "unknown":
        status = color.red("unknown")
        value = `[present in user config]`
        break
    }

    console.log(`${path} ${status.padEnd(10)} ${value}`)
  }

  return 0
}
