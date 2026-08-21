export const LIST_AGENTS_TEMPLATE = `# /list-agents

Show all agents and their current TUI models. Call the tools below in order.

## Steps

1. Call \`session_model_info\` to get the current global TUI model and all per-agent overrides.

2. Call \`interactive_menu\` with these options built from the effective models:
   prompt: "Select agent to configure (current model shown):"
   options: [
     "1. artistry — {effective}",
     "2. atlas — {effective}",
     "3. deep — {effective}",
     "4. explore — {effective}",
     "5. hephaestus — {effective}",
     "6. librarian — {effective}",
     "7. metis — {effective}",
     "8. momus — {effective}",
     "9. multimodal-looker — {effective}",
     "10. oracle — {effective}",
     "11. prometheus — {effective}",
     "12. quick — {effective}"
   ]

3. Parse the \`{"value": "N"}\` result (subtract 1 for zero-based index).

4. Tell the user: "Selected {agent} (model: {effective}). Run /model {agent} to change its model."

CRITICAL: Do NOT explain the steps. Execute them now.
`
