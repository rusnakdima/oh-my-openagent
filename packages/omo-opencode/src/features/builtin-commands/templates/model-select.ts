export const MODEL_TEMPLATE = `# /model Command

## Purpose

Let the user select a TUI model for delegation via an interactive tmux menu.

## Usage

- \`/model\` → set the global model (clears per-agent overrides)
- \`/model <agent>\` → set the model for a specific agent (e.g., \`/model deep\`)

## Steps

### Step 1: Open the interactive menu

Call the \`interactive_menu\` tool with a curated list of popular models as options.

**For global model selection (\`/model\`):**
\`\`\`json
{
  "name": "interactive_menu",
  "arguments": {
    "prompt": "Select a model for ALL agents (global):",
    "options": [
      "1. opencode/big-pickle (built-in, fast)",
      "2. 302ai/gpt-4o (ChatGPT, recommended)",
      "3. 302ai/claude-sonnet-4-6-thinking (Anthropic, best reasoning)",
      "4. 302ai/minimax-m2.7 (fast, low cost)",
      "5. openai/gpt-4o (requires API key)"
    ]
  }
}
\`\`\`

### Step 2: Parse the result

The result is a JSON string:
- \`{"value": "1"}\` → user selected option 1 (index = 0)
- \`{"cancelled": true}\` → user cancelled

Extract the selection index and map to the model:

| Index | Global Model |
|-------|-------------|
| 0 | opencode/big-pickle |
| 1 | 302ai/gpt-4o |
| 2 | 302ai/claude-sonnet-4-6-thinking |
| 3 | 302ai/minimax-m2.7 |
| 4 | openai/gpt-4o |

### Step 3: Apply the model

After parsing the selection, apply it via the state functions:

**For global model (\`/model\`):**
\`\`\`typescript
const { setGlobalTuiModel, clearAllPerAgentModels } = await import("../../shared/session-model-state")
const { getTuiStateMirrorSingleton } = await import("../../features/tui-sidebar/mirror-manager")

const models = [
  "opencode/big-pickle",
  "302ai/gpt-4o",
  "302ai/claude-sonnet-4-6-thinking",
  "302ai/minimax-m2.7",
  "openai/gpt-4o"
]
const modelStr = models[index]
const [providerID, modelID] = modelStr.split("/")
setGlobalTuiModel({ providerID, modelID })
clearAllPerAgentModels()
getTuiStateMirrorSingleton()?.flush()
\`\`\`

**For per-agent model (\`/model deep\`):**
Use the same list but set per-agent:
\`\`\`typescript
const { setPerAgentModel } = await import("../../shared/session-model-state")
const { getTuiStateMirrorSingleton } = await import("../../features/tui-sidebar/mirror-manager")

const models = [
  "opencode/big-pickle",
  "302ai/gpt-4o",
  "302ai/claude-sonnet-4-6-thinking",
  "302ai/minimax-m2.7",
  "openai/gpt-4o"
]
const modelStr = models[index]
const [providerID, modelID] = modelStr.split("/")
setPerAgentModel(agentName, { providerID, modelID })
getTuiStateMirrorSingleton()?.flush()
\`\`\`

### Step 4: Confirm

Tell the user what was set:
- Global: "Global model set to {providerID}/{modelID}. Per-agent overrides cleared."
- Per-agent: "{Agent} model set to {providerID}/{modelID}."

## Arguments

The agent name comes from $ARGUMENTS (e.g., "deep", "sisyphus", "ultrabrain").
`;
