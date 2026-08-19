export const OPENSPEC_PATTERN = /\b(plan this|write a spec|spec out|openspec|create spec)\b/i

export const OPENSPEC_MESSAGE = `[openspec-mode]
The user wants to create or work with an OpenSpec. The agent should:
1. Create a spec if none exists (auto_create is enabled)
2. Inject spec context via the openspec-session hook
3. Use openspec tools (openspec_read/verify/status/apply/archive) to track progress
`
