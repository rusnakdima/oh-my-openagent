import { z } from "zod"

export const TuiSidebarConfigSchema = z.object({
  enabled: z.boolean().default(true),
  showSubagentAgents: z.boolean().default(false),
})

export const TuiConfigSchema = z.object({
  sidebar: TuiSidebarConfigSchema,
})

export type TuiConfig = z.infer<typeof TuiConfigSchema>
