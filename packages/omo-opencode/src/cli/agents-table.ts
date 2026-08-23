import type { AgentInfo } from "./agents"

export function formatAgentTable(agents: AgentInfo[]): string {
  const header = "Agent              Mode      Effective Model                  Provenance"
  const separator = "-".repeat(90)
  const rows = agents.map((a) => {
    const name = a.name.padEnd(18)
    const mode = a.mode.padEnd(8)
    const model = a.effectiveModel.padEnd(30)
    const provenance = a.provenance
    return `${name} ${mode} ${model} ${provenance}`
  })
  return [header, separator, ...rows].join("\n")
}

export function formatAgentTableVerbose(agents: AgentInfo[]): string {
  const rows = agents.map((a) => {
    const lines = [
      `## ${a.name} (${a.mode})`,
      `   Effective Model: ${a.effectiveModel}`,
      `   Provenance: ${a.provenance}`,
    ]
    if (a.configOverride) {
      lines.push(`   Config Override: ${a.configOverride}`)
    }
    if (a.liveModel) {
      lines.push(`   Live Model: ${a.liveProvider}/${a.liveModel}`)
    }
    if (a.fallbackChain.length > 0) {
      lines.push(`   Fallback Chain: ${a.fallbackChain.join(" → ")}`)
    }
    return lines.join("\n")
  })
  return rows.join("\n\n")
}
