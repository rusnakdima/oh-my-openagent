export const MODEL_TEMPLATE = `# /model Command

## Purpose

Let the user select a TUI model for delegation via an interactive tmux menu.

## How It Works

1. Parse the agent name from arguments (e.g., \`/model deep\` → agent = "deep")
2. If no agent given → set the GLOBAL model (clears all per-agent overrides)
3. If agent given → set that agent's per-agent model override

## Steps

### Step 1: Read available models from the OpenCode models cache

Use a code block to read the models cache file directly:

\`\`\`typescript
import { readFileSync } from "fs"
import { join, dirname } from "path"

// Find the cache directory
const home = process.env.HOME ?? process.env.USERPROFILE ?? "/home/dmitriy"
const cacheDir = join(home, ".cache", "opencode")
const cacheFile = join(cacheDir, "models.json")

const raw = readFileSync(cacheFile, "utf-8")
const data = JSON.parse(raw) as Record<string, { models?: Record<string, unknown> }>

const models: string[] = []
for (const [providerId, provider] of Object.entries(data)) {
  if (provider.models && typeof provider.models === "object") {
    for (const modelId of Object.keys(provider.models)) {
      models.push(\`\${providerId}/\${modelId}\`)
    }
  }
}
// Sort alphabetically
models.sort((a, b) => a.localeCompare(b))
models  // e.g. ["anthropic/claude-opus-5", "openai/gpt-5", ...]
\`\`\`

### Step 2: Open interactive menu

Call the \`interactive_menu\` tool with the model list as numbered options:

\`\`\`json
{
  "name": "interactive_menu",
  "arguments": {
    "prompt": "Select model for {agent_label}:",
    "options": models.map((m, i) => \`\${i + 1}. \${m}\`)
  }
}
\`\`\`

- \`agent_label\` = "global" if no agent, otherwise the agent name

### Step 3: Parse the result

The result is a JSON string:
- \`{"value": "1"}\` → user selected option 1 (index = 0)
- \`{"cancelled": true}\` → user cancelled

### Step 4: Apply the model

After parsing the selection index, apply the model:

**For global model (no agent argument):**
\`\`\`typescript
const { setGlobalTuiModel, clearAllPerAgentModels } = await import("../../shared/session-model-state")
const { getTuiStateMirrorSingleton } = await import("../../features/tui-sidebar/mirror-manager")

const index = parseInt(selectionValue, 10) - 1
const [providerID, modelID] = models[index].split("/")
setGlobalTuiModel({ providerID, modelID })
clearAllPerAgentModels()
getTuiStateMirrorSingleton()?.flush()
\`\`\`

**For per-agent model (agent argument provided):**
\`\`\`typescript
const { setPerAgentModel } = await import("../../shared/session-model-state")
const { getTuiStateMirrorSingleton } = await import("../../features/tui-sidebar/mirror-manager")

const index = parseInt(selectionValue, 10) - 1
const [providerID, modelID] = models[index].split("/")
setPerAgentModel(agentName, { providerID, modelID })
getTuiStateMirrorSingleton()?.flush()
\`\`\`

### Step 5: Confirm to user

- Global: "Global model set to {providerID}/{modelID}. All per-agent overrides cleared."
- Per-agent: "{Agent} model set to {providerID}/{modelID}."

## Arguments Format

- \`/model\` → no agent, sets global
- \`/model deep\` → agent = "deep" (case-insensitive)
- \`/model sisyphus\` → agent = "sisyphus"
`
