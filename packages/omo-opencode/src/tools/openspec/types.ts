import { z } from "zod"

export const OpenSpecReadArgsSchema = z.object({
  file: z.enum(["spec.md", "plan.md", "tasks.md"]),
  spec_name: z.string().optional(),
})

export const OpenSpecVerifyArgsSchema = z.object({
  spec_name: z.string().optional(),
})

export const OpenSpecStatusArgsSchema = z.object({
  spec_name: z.string().optional(),
})

export const OpenSpecProposeArgsSchema = z.object({
  title: z.string(),
  spec_name: z.string(),
  requirements: z.string(),
  plan_summary: z.string(),
  tasks: z.array(
    z.object({
      description: z.string(),
      status: z.enum(["pending", "in_progress", "completed", "blocked"]).default("pending"),
    }),
  ),
})

export const OpenSpecApplyArgsSchema = z.object({
  spec_name: z.string(),
})

export const OpenSpecArchiveArgsSchema = z.object({
  spec_name: z.string(),
})

export type OpenSpecReadArgs = z.infer<typeof OpenSpecReadArgsSchema>
export type OpenSpecVerifyArgs = z.infer<typeof OpenSpecVerifyArgsSchema>
export type OpenSpecStatusArgs = z.infer<typeof OpenSpecStatusArgsSchema>
export type OpenSpecProposeArgs = z.infer<typeof OpenSpecProposeArgsSchema>
export type OpenSpecApplyArgs = z.infer<typeof OpenSpecApplyArgsSchema>
export type OpenSpecArchiveArgs = z.infer<typeof OpenSpecArchiveArgsSchema>
