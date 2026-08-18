import { z } from "zod"

export const BuiltinCommandNameSchema = z.enum([
 "goal",
 "refactor",
 "start-work",
 "stop-continuation",
 "remove-ai-slops",
 "hyperplan",
 "wiki-init",
 "wiki-ingest",
 "wiki-query",
 "wiki-lint",
 "wiki-update",
 "openspec",
])

export type BuiltinCommandName = z.infer<typeof BuiltinCommandNameSchema>
