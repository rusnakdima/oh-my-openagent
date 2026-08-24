// Compatibility exports for the established palace collector module.

export {
  collectCore,
  collectExternal,
  UNCOMMITTED_LABEL,
} from "./entry-collector";
export type {
  PalaceCoreEntry,
  PalaceEntryState,
  PalaceExternalEntry,
} from "./entry-collector";
export {
  collectHistory,
  HISTORY_MAX_COMMITS,
  HISTORY_PER_DIFF_CAP,
  HISTORY_RECENT_DIFFS,
  HISTORY_TOTAL_PAYLOAD_CAP,
  REFLECTION_COMMIT_PATTERN,
} from "./history-collector";
export type {
  PalaceCommit,
  PalaceHistory,
  PalaceHistoryCaps,
} from "./history-collector";
export { collectReflection } from "./reflection-collector";
export type {
  PalaceReflection,
  PalaceReflectionOutcome,
} from "./reflection-collector";
