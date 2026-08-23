import type { BuiltinSkill } from "../types";

/**
 * OpenSpec builtin skill.
 *
 * Provides agents with OpenSpec workflow documentation:
 * - What OpenSpec is (spec.md + plan.md + tasks.md)
 * - How to use the openspec_* tools
 * - Auto-inject and task-write-back behavior
 *
 * Only loaded when `openspec.enabled = true`.
 * Mirrors the `teamModeEnabled` gating pattern in `createBuiltinSkills()`.
 */
export const openspecSkill: BuiltinSkill = {
  name: "openspec",
  description:
    "OpenSpec workflow — spec.md + plan.md + tasks.md trifecta for structured agent collaboration. " +
    "Enable with openspec.enabled in config. Provides tools to read, verify, propose, apply, and archive specs. " +
    "Auto-injects spec context on session start when a spec exists; writes task completion back to tasks.md on tool finish.",
  template: `# OpenSpec

OpenSpec is a structured specification format for agent collaboration. Each spec is a directory containing three markdown files:

- \`spec.md\` — What we are building and why (requirements + scope)
- \`plan.md\` — How we will build it (technical approach, ordered)
- \`tasks.md\` — What needs to be done (checklist with status markers)

## File format

### spec.md

\`\`\`markdown
# {title}

## Requirements
- ...

## Scope
### In scope
- ...

### Out of scope
- ...
\`\`\`

### plan.md

\`\`\`markdown
# {title} — Technical Plan

## Architecture
...

## Implementation Steps
1. ...
2. ...
\`\`\`

### tasks.md

\`\`\`markdown
# Tasks

| Status | Description |
| ------ | ----------- |
| [ ] | Task description |
| [~] | In-progress task |
| [x] | Completed task |
| [!!] | Blocked task |
\`\`\`

## Status markers

| Marker | Meaning |
| ------ | ------- |
| \`[ ]\` | Pending |
| \`[~]\` | In progress |
| \`[x]\` | Completed |
| \`[!!]\` | Blocked |

## Tools

Use these tools to work with OpenSpec:

- \`openspec_read\` — Read a spec file (\`spec.md\`, \`plan.md\`, or \`tasks.md\`)
- \`openspec_verify\` — Check spec consistency (all 3 files present and aligned)
- \`openspec_status\` — Dump task counts per spec (open / in-progress / done / blocked)
- \`openspec_propose\` — Create a new spec with all 3 files from structured input
- \`openspec_apply\` — Mark all pending tasks as in-progress (start working)
- \`openspec_archive\` — Move a completed spec to the ARCHIVE/ directory

## Workflow

1. **Propose**: Create a spec with \`openspec_propose\`
2. **Verify**: Check it is well-formed with \`openspec_verify\`
3. **Apply**: Mark tasks as in-progress with \`openspec_apply\`
4. **Execute**: Work through tasks, using \`openspec_status\` to track progress
5. **Complete**: Mark done tasks with \`[x]\` marker directly in \`tasks.md\`
6. **Archive**: Move to ARCHIVE/ with \`openspec_archive\` when all tasks are done

## Auto-inject

When \`openspec.auto_inject: true\` (the default), spec context is automatically injected on session start if a spec exists. You do not need to call \`openspec_read\` manually for the first message.

## Task write-back

When \`openspec.task_write_back: true\` (the default), the plugin automatically marks completed tasks in \`tasks.md\` after tool executions that satisfy task requirements. This prevents token overconsumption from repeated re-reading.

## Spec directory layout

\`\`\`
{openspec_dir}/
  {spec_name}/
    spec.md
    plan.md
    tasks.md
  ARCHIVE/
    {archived_spec}/
      spec.md
      plan.md
      tasks.md
\`\`\`

## Limitations

- OpenSpec v1 only. \`.specify/\` support is planned.
- Spec names must be directory-safe (no \`/\`, \`\\\`, or \`:\`)
- Task descriptions are plain markdown table rows; no nested sub-tasks in v1

## Configuration

\`\`\`jsonc
{
  "openspec": {
    "enabled": true,
    "spec_dir": "openspec",
    "auto_inject": true,
    "shorten_interview": false,
    "task_write_back": true
  }
}
\`\`\`
`,
};
