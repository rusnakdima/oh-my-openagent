import { z } from "zod";

export const TuiSidebarConfigSchema = z.object({
  enabled: z.boolean().default(true),
  /** Which agents to show in the TUI sidebar roster. If empty, shows all available agents. */
  visibleAgents: z.array(z.string()).optional(),
  /** Which categories to show in the TUI sidebar roster. If empty, shows all available categories. */
  visibleCategories: z.array(z.string()).optional(),
});

export const TuiConfigSchema = z.object({
  sidebar: TuiSidebarConfigSchema.default({ enabled: true }),
});

export type TuiConfig = z.infer<typeof TuiConfigSchema>;
