import { z } from "zod"

/**
 * OpenSpec config schema.
 *
 * Top-level key: `openspec` in the OMO config file, parallel to `goal` and `team_mode`.
 *
 * Design goals:
 *  - `enabled` must be explicitly true to activate (default false — additive)
 *  - `spec_dir` lets users place their specs anywhere (default: `openspec` in cwd)
 *  - `auto_inject` reads spec.md / plan.md / tasks.md on first message and injects context
 *  - `shorten_interview` reduces verbosity in spec-tool interaction
 *  - `task_write_back` lets tool-execute.after hook update tasks.md on task completion
 */
export const OpenSpecConfigSchema = z.object({
  /** Enable OpenSpec support (default: false) */
  enabled: z.boolean().default(false),
  /**
   * Root directory for OpenSpec files.
   * Each spec lives in a subdirectory named by its spec_name.
   * Default: `"openspec"` (i.e. `./openspec/{spec_name}/`)
   */
  spec_dir: z.string().default("openspec"),
  /**
   * Automatically inject spec.md, plan.md, and tasks.md context into the
   * first session message when a spec exists. Reduces manual /specify calls.
   * (default: true when enabled)
   */
  auto_inject: z.boolean().default(true),
  /**
   * Shorten the interview: omit lengthy spec preamble and reduce tool-result
   * verbosity. Useful for tight loops where spec context is already known.
   * (default: false)
   */
  shorten_interview: z.boolean().default(false),
  /**
   * Write task completion markers back to `openspec/{name}/tasks.md` via the
   * tool.execute.after hook when tasks are completed by the agent.
   * Prevents token overconsumption from re-reading unchanged task state.
   * (default: true when enabled)
   */
  task_write_back: z.boolean().default(true),
})

export type OpenSpecConfig = z.infer<typeof OpenSpecConfigSchema>
