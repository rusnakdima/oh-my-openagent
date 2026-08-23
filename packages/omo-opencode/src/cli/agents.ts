import { Command } from "commander"
import { spawn } from "child_process"
import { AGENT_MODEL_REQUIREMENTS } from "../shared/model-requirements"
import { detectHeuristicModelFamily } from "@oh-my-opencode/model-core"
import { validatePluginConfig } from "../config/validate"
import { getEffectiveModel } from "./doctor/checks/model-resolution-effective-model"
import { formatAgentTable, formatAgentTableVerbose } from "./agents-table"
import { updateOmoConfig } from "@oh-my-opencode/omo-config-core"
import type { AgentName } from "../config/schema/agent-names"
import type { AgentMode } from "../agents/types"

export const AGENT_ORDER: AgentName[] = [
  "sisyphus",
  "hephaestus",
  "prometheus",
  "atlas",
  "oracle",
  "librarian",
  "explore",
  "multimodal-looker",
  "metis",
  "momus",
  "sisyphus-junior",
]

// Modes are defined in each agent's factory file (plugin-only, not in model-core).
// Hardcoded here to keep the CLI harness-neutral.
const AGENT_MODES: Record<AgentName, AgentMode> = {
  sisyphus: "primary",
  hephaestus: "primary",
  prometheus: "primary",
  atlas: "primary",
  oracle: "subagent",
  librarian: "subagent",
  explore: "subagent",
  "multimodal-looker": "subagent",
  metis: "subagent",
  momus: "subagent",
  "sisyphus-junior": "subagent",
}

// Display name → canonical name mapping for omo agents in `opencode agent list` text output.
const OMO_DISPLAY_NAME_MAP: Record<string, AgentName> = {
  "Sisyphus - ultraworker": "sisyphus",
  "Hephaestus - Deep Agent": "hephaestus",
  "Prometheus - Plan Builder": "prometheus",
  "Atlas - Plan Executor": "atlas",
  "Oracle": "oracle",
  "Librarian": "librarian",
  "Explore": "explore",
  "Multimodal-Looker": "multimodal-looker",
  "Metis - Plan Consultant": "metis",
  "Momus - Plan Critic": "momus",
  "Sisyphus-Junior": "sisyphus-junior",
}

export interface AgentInfo {
  name: string
  mode: AgentMode
  effectiveModel: string
  provenance: "config override" | "fallback chain" | "live"
  configOverride: string | null
  fallbackChain: string[]
  liveModel?: string
  liveProvider?: string
}

function formatChainEntry(
  providers: readonly string[],
  model: string,
  variant?: string,
): string {
  const v = variant ? `-${variant}` : ""
  return `${providers[0]}/${model}${v}`
}

export function resolveAgentsInfo(): AgentInfo[] {
  const { config } = validatePluginConfig(process.cwd())
  const userAgents = config.agents ?? {}

  return AGENT_ORDER.map((name) => {
    const requirement = AGENT_MODEL_REQUIREMENTS[name]
    if (!requirement) return null

    const userOverride = userAgents[name]?.model ?? null
    const effectiveModel = getEffectiveModel(requirement, userOverride ?? undefined)
    const provenance: AgentInfo["provenance"] = userOverride ? "config override" : "fallback chain"

    const fallbackChain = requirement.fallbackChain.map((entry) =>
      formatChainEntry(entry.providers, entry.model, entry.variant),
    )

    return {
      name,
      mode: AGENT_MODES[name],
      effectiveModel,
      provenance,
      configOverride: userOverride,
      fallbackChain,
    }
  }).filter(Boolean) as AgentInfo[]
}

interface LiveAgent {
  name: string
  mode: "subagent" | "primary" | "all"
  model?: { modelID: string; providerID: string }
  description?: string
}

async function fetchLiveAgents(): Promise<LiveAgent[]> {
  const port = 18792
  const url = `http://127.0.0.1:${port}/agent`

  // Start opencode serve in background (detached so it outlives this process)
  const serverProcess = spawn("opencode", ["serve", "--port", String(port)], {
    stdio: "pipe",
    detached: true,
  })

  // Give the server time to start listening
  await new Promise<void>((resolve) => setTimeout(resolve, 4000))

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`)
    }
    const agents = (await response.json()) as LiveAgent[]
    return agents
  } finally {
    // Kill the entire process group
    try {
      process.kill(-serverProcess.pid!, "SIGKILL")
    } catch {
      serverProcess.kill("SIGKILL")
    }
  }
}

export async function resolveLiveAgentsInfo(): Promise<AgentInfo[]> {
  const { config } = validatePluginConfig(process.cwd())
  const userAgents = config.agents ?? {}

  let liveAgents: LiveAgent[] = []
  try {
    liveAgents = await fetchLiveAgents()
  } catch {
    // Server unavailable — fall back to static analysis
  }

  if (liveAgents.length === 0) {
    // Fall back to static info
    return resolveAgentsInfo().map((a) => ({ ...a }))
  }

  // Build a map of canonical name → live agent
  const liveMap = new Map<AgentName, LiveAgent>()
  for (const agent of liveAgents) {
    const canonical = OMO_DISPLAY_NAME_MAP[agent.name]
    if (canonical) {
      liveMap.set(canonical, agent)
    }
  }

  return AGENT_ORDER.map((name) => {
    const requirement = AGENT_MODEL_REQUIREMENTS[name]
    if (!requirement) return null

    const userOverride = userAgents[name]?.model ?? null
    const effectiveModel = getEffectiveModel(requirement, userOverride ?? undefined)
    const live = liveMap.get(name)
    const provenance: AgentInfo["provenance"] = live
      ? "live"
      : userOverride
        ? "config override"
        : "fallback chain"

    const fallbackChain = requirement.fallbackChain.map((entry) =>
      formatChainEntry(entry.providers, entry.model, entry.variant),
    )

    const liveModel = live?.model?.modelID
    const liveProvider = live?.model?.providerID

    return {
      name,
      mode: AGENT_MODES[name],
      effectiveModel:
        live && liveModel ? `${liveProvider}/${liveModel}` : effectiveModel,
      provenance,
      configOverride: userOverride,
      fallbackChain,
      liveModel,
      liveProvider,
    }
  }).filter(Boolean) as AgentInfo[]
}

export async function runAgentsCommandAsync(options: {
  json: boolean
  verbose: boolean
  live: boolean
  primaryOnly: boolean
}): Promise<number> {
  let agents = options.live ? await resolveLiveAgentsInfo() : resolveAgentsInfo()

  if (options.primaryOnly) {
    agents = agents.filter((a) => a.mode === "primary")
  }

  const overriddenCount = agents.filter(
    (a) => a.provenance === "config override" || a.provenance === "live",
  ).length

  if (options.json) {
    console.log(
      JSON.stringify(
        { agents, summary: { total: agents.length, overridden: overriddenCount } },
        null,
        2,
      ),
    )
  } else if (options.verbose) {
    const note =
      options.live && agents[0]?.provenance !== "live"
        ? "\n  (static — no live server detected)"
        : ""
    console.log(formatAgentTableVerbose(agents))
    console.log(`\n${agents.length} agents shown. ${overriddenCount} have overrides.${note}`)
  } else {
    const note =
      options.live && agents[0]?.provenance !== "live"
        ? "\n  (static — no live server detected)"
        : ""
    console.log(formatAgentTable(agents))
    console.log(`\n${agents.length} agents shown. ${overriddenCount} have overrides.${note}`)
  }

  return 0
}

export function normalizeModelForConfig(model: string): string {
  // Already has provider prefix (e.g., "minimax/MiniMax-M2.7")
  const trimmed = model.trim()
  if (trimmed.includes("/")) return trimmed

  // Auto-detect provider from model name via heuristic registry
  const detected = detectHeuristicModelFamily(trimmed)
  if (detected) {
    const prefix = detected.provider ?? detected.family
    return `${prefix}/${trimmed}`
  }

  // Unknown model — store as-is and let OpenCode handle validation
  return trimmed
}

export async function runSetModelCommand(model: string): Promise<number> {
  if (!model || model.trim() === "") {
    console.error("Error: model argument cannot be empty. Use 'omo agents set-model <model>' to set a model.")
    console.error("To clear model overrides, edit ~/.omo/omo.jsonc directly.")
    return 1
  }

  const normalizedModel = normalizeModelForConfig(model)

  // Build edits: set model for every agent
  const edits = AGENT_ORDER.map((name) => ({
    path: ["agents", name, "model"] as const,
    value: normalizedModel,
  }))

  try {
    await updateOmoConfig({ edits, scope: "user" })
  } catch (err) {
    console.error(`Failed to write config: ${err}`)
    return 1
  }

  console.log(`Setting model to "${normalizedModel}" for all agents...`)
  for (const name of AGENT_ORDER) {
    console.log(`  ${name.padEnd(18)} ✅ updated`)
  }
  console.log(`\nRestart OpenCode to apply changes.`)

  return 0
}

export function configureAgentsCommand(program: Command): void {
  const agentsCmd = program
    .command("agents")
    .description("Show effective model per built-in agent")

  agentsCmd
    .option("--json", "Output in JSON format")
    .option("--verbose", "Show full fallback chain per agent")
    .option(
      "--live",
      "Query a live OpenCode server for actual registered agents and their models (starts a temporary server if none is running)",
    )
    .option(
      "--primary-only",
      "Show only primary agents (sisyphus, hephaestus, prometheus, atlas); hide subagents",
    )
    .addHelpText(
      "after",
      `
Examples:
  $ bunx oh-my-opencode agents
  $ bunx oh-my-opencode agents --verbose
  $ bunx oh-my-opencode agents --json
  $ bunx oh-my-opencode agents --live
  $ bunx oh-my-opencode agents set-model <model>

This command shows:
  - Agent name and mode (primary/subagent)
  - Effective model: config override, or first fallback chain entry
  - Provenance: whether the model came from config or the fallback chain
  - With --verbose: full fallback chain per agent
  - With --live: actual live model from the OpenCode server (requires server)
`,
    )
    .action(async (opts) => {
      const exitCode = await runAgentsCommandAsync({
        json: opts.json ?? false,
        verbose: opts.verbose ?? false,
        live: opts.live ?? false,
        primaryOnly: opts.primaryOnly ?? false,
      })
      process.exit(exitCode)
    })

  // set-model is a nested subcommand under `agents`
  agentsCmd
    .command("set-model <model>")
    .description("Set the same model for all built-in agents in the user config")
    .action(async (model) => {
      const exitCode = await runSetModelCommand(model)
      process.exit(exitCode)
    })
}
