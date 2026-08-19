import { z } from "zod"

export const NotificationConfigSchema = z.object({
  /** Force enable session-notification even if external notification plugins are detected (default: false) */
  force_enable: z.boolean().optional(),
  /** Notify when a tool runs longer than this many seconds (default: 300 = 5 minutes, set to 0 to disable) */
  long_running_tool_seconds: z.number().min(0).max(86400).optional().default(300),
})

export type NotificationConfig = z.infer<typeof NotificationConfigSchema>
