/**
 * Hashline core public API.
 *
 * Hash dependency choice: Option 2.
 * This package embeds a runtime-aware xxHash32 implementation (`xxhash32.ts`)
 * that prefers the host runtime's native xxHash32 binding when available and
 * falls back to a pure-JS implementation otherwise. No package-level dependency
 * on any specific runtime; the binding is detected via globalThis at call time.
 */
export {
  HASHLINE_DICT,
  HASHLINE_OUTPUT_PATTERN,
  HASHLINE_REF_PATTERN,
  NIBBLE_STR,
} from "./constants";
export type {
  AppendEdit,
  HashlineEdit,
  PrependEdit,
  ReplaceEdit,
} from "./types";
export {
  computeLegacyLineHash,
  computeLineHash,
  formatHashLine,
  formatHashLines,
  streamHashLinesFromLines,
  streamHashLinesFromUtf8,
} from "./hash-computation";
export {
  HashlineMismatchError,
  normalizeLineRef,
  parseLineRef,
  validateLineRef,
  validateLineRefs,
} from "./validation";
export type { LineRef } from "./validation";
export {
  applyHashlineEdits,
  applyHashlineEditsWithReport,
} from "./edit-operations";
export type { HashlineApplyReport } from "./edit-operations";
export {
  applyAppend,
  applyInsertAfter,
  applyInsertBefore,
  applyPrepend,
  applyReplaceLines,
  applySetLine,
} from "./edit-operation-primitives";
export {
  collectLineRefs,
  detectOverlappingRanges,
  getEditLineNumber,
} from "./edit-ordering";
export { dedupeEdits } from "./edit-deduplication";
export {
  restoreLeadingIndent,
  stripInsertAnchorEcho,
  stripInsertBeforeEcho,
  stripInsertBoundaryEcho,
  stripLinePrefixes,
  stripRangeBoundaryEcho,
  toNewLines,
} from "./edit-text-normalization";
export {
  canonicalizeFileText,
  restoreFileText,
} from "./file-text-canonicalization";
export type { FileTextEnvelope } from "./file-text-canonicalization";
export {
  autocorrectReplacementLines,
  maybeExpandSingleLineMerge,
  restoreIndentForPairedReplacement,
  restoreOldWrappedLines,
  stripMergeOperatorChars,
  stripTrailingContinuationTokens,
} from "./autocorrect-replacement-lines";
export { normalizeHashlineEdits } from "./normalize-edits";
export type { RawHashlineEdit } from "./normalize-edits";
export { createHashlineChunkFormatter } from "./hashline-chunk-formatter";
export type { HashlineChunkFormatter } from "./hashline-chunk-formatter";
export type { HashlineStreamOptions } from "./hash-computation";
export {
  countLineDiffs,
  generateUnifiedDiff,
  toHashlineContent,
} from "./diff-utils";
export { generateHashlineDiff } from "./hashline-edit-diff";
