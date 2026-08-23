import { z } from "zod"

export const InteractiveMenuConfigSchema = z.object({
  enabled: z.boolean().default(true),
})

export type InteractiveMenuConfig = z.infer<typeof InteractiveMenuConfigSchema>
