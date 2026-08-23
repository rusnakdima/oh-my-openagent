/**
 * command-arguments.ts — Parses `/openspec <args>` into a discriminated union.
 *
 * Mirrors parseGoalCommand from goal/command-arguments.ts.
 */

export type OpenSpecParsedCommand =
  | { readonly kind: "propose"; readonly specName: string; readonly description?: string }
  | { readonly kind: "verify"; readonly specName: string }
  | { readonly kind: "apply"; readonly specName: string }
  | { readonly kind: "archive"; readonly specName: string }
  | { readonly kind: "status" }
  | { readonly kind: "list" }
  | { readonly kind: "help" }

const HELP_TEXT = `Available /openspec subcommands:
  propose <name> [description] — Create a new OpenSpec proposal
  verify <name>               — Verify a spec's integrity
  apply <name>                — Apply a spec to the project
  archive <name>              — Archive a completed spec
  status                     — Show current spec status
  list                       — List all known specs
  help                       — Show this help`

/**
 * Parse raw command arguments for /openspec.
 * Splits on whitespace — each token is space-separated.
 * No quoting mechanism; descriptions with spaces are not supported.
 */
export function parseOpenSpecCommand(rawArgs: string): OpenSpecParsedCommand {
  const trimmed = rawArgs.trim()
  if (trimmed === "") {
    return { kind: "help" }
  }

  // Split on any whitespace (mimics goal command)
  const tokens = trimmed.split(/\s+/)
  const cmd = tokens[0]?.toLowerCase()
  const rest = tokens.slice(1)

  switch (cmd) {
    case "propose": {
      const specName = rest[0]
      if (!specName) return { kind: "help" }
      // Remaining tokens form the description (joined back for display)
      const description = rest.length > 1 ? rest.slice(1).join(" ") : undefined
      return { kind: "propose", specName, description }
    }

    case "verify": {
      const specName = rest[0]
      if (!specName) return { kind: "help" }
      return { kind: "verify", specName }
    }

    case "apply": {
      const specName = rest[0]
      if (!specName) return { kind: "help" }
      return { kind: "apply", specName }
    }

    case "archive": {
      const specName = rest[0]
      if (!specName) return { kind: "help" }
      return { kind: "archive", specName }
    }

    case "status":
      return { kind: "status" }

    case "list":
      return { kind: "list" }

    case "help":
      return { kind: "help" }

    default:
      return { kind: "help" }
  }
}
