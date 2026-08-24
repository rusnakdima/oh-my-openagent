/**
 * Backward-compatible shim: the implementation moved to
 * `../process-sweep/sweeper` (family-based sweep restructure).
 */
export {
  type CodegraphSweepAction,
  sweepCodegraphZombies,
  type SweepCodegraphZombiesOptions,
  type SweepCodegraphZombiesResult,
} from "../process-sweep/sweeper";
