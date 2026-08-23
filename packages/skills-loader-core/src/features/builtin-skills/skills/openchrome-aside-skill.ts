import type { BuiltinSkill } from "../types"

/**
 * Tiered browser automation skill using a cascade strategy:
 *
 * 1. **Aside** (LLM-powered) — Uses an OpenAI-compatible API call to reason about
 *    the user's goal and suggest the most appropriate next action. This step NEVER
 *    launches a browser and works even without Chrome.
 *
 * 2. **Openchrome** (deterministic Chrome automation) — When the aside suggests a
 *    concrete action, falls back to the `openchrome` CLI to perform deterministic,
 *    scripted Chrome automation. Requires Chrome.
 *
 * 3. **Playwright MCP** (zero-setup fallback) — When neither above is available,
 *    falls back to the `playwright` MCP server for browser automation.
 *
 * Selection logic (cascade, try in order):
 *
 * ```
 * if (OPENAI_API_KEY accessible) → use Aside LLM reasoning
 * else if (openchrome CLI available) → use OpenchromeBrowser
 * else                             → use PlaywrightMCP
 * ```
 *
 * @see https://github.com/openchatsuite/openchrome
 */
export const openchromeAsideSkill: BuiltinSkill = {
  name: "playwright",
  description:
    "MUST USE for any browser-related tasks. Tiered browser automation: Aside LLM reasoning → Openchrome deterministic Chrome → Playwright MCP fallback. Handles verification, browsing, information gathering, web scraping, testing, screenshots, and all browser interactions.",
  template: `# Playwright Browser Automation (Tiered Stack)

This skill uses a tiered cascade for browser automation — try each step in order until one succeeds.

## Tier 1: Aside LLM Reasoning (ALWAYS try first)

Before launching any browser, reason about the task using an LLM call:

\`\`\`
<system>\${SYSTEM_PROMPT}

You are a browser automation reasoning assistant.

User goal: \${USER_GOAL}

Analyze the goal and respond with:
- What concrete action to take
- Why this action is correct
- What could go wrong

If the goal is vague or needs more information, say "NEED_MORE_INFO: <question>".

Keep the response concise (max 50 words).
</system>
\`\`\`

If the LLM response suggests a concrete action AND you have enough information, try to execute it.

## Tier 2: Openchrome (deterministic Chrome automation)

If the goal requires browser interaction and openchrome CLI is available:

\`\`\`bash
# Check if openchrome is available
openchrome --version

# Run an openchrome script
openchrome run --script <<'EOF'
// Your automation script here
EOF
\`\`\`

See https://github.com/openchatsuite/openchrome for script syntax.

## Tier 3: Playwright MCP (zero-setup fallback)

When neither Aside nor Openchrome is available, fall back to Playwright MCP:

\`\`\`bash
# Start Playwright MCP server (if not already running)
npx @playwright/mcp@latest
\`\`\`

Then use Playwright tools (\`playwright_navigate\`, \`playwright_click\`, etc.) for automation.

## Decision Flow

1. **Parse the user's goal** — what do they want to accomplish?
2. **Try Aside LLM** — get reasoning and a suggested action plan
3. **If openchrome available AND action is deterministic** → use Openchrome
4. **Otherwise** → fall back to Playwright MCP

## When to Use Each Tier

| Tier | Use When | Requirements |
|------|----------|--------------|
| Aside LLM | Any goal — reasoning always helps | OPENAI_API_KEY or compatible API |
| Openchrome | Deterministic, scripted Chrome tasks | Chrome + openchrome CLI |
| Playwright MCP | General browser automation | Playwright + browser binary |

## Important Principles

- **Always try Aside LLM first** — even simple tasks benefit from reasoning
- **Escalate appropriately** — don't use Playwright for a task Openchrome can handle in 1 line
- **Graceful degradation** — if a tier fails, try the next tier automatically`,
}
