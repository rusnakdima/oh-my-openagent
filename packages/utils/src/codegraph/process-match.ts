/**
 * Backward-compatible shim: the implementation moved to
 * `../process-sweep/codegraph-family` (family-based sweep restructure).
 * All downstream imports of this module keep working unchanged.
 */
export {
  type CodegraphProcessMatchKind,
  type CodegraphZombieProcess,
  selectZombieCodegraphProcesses,
  type SelectZombieCodegraphProcessesOptions,
} from "../process-sweep/codegraph-family";
export {
  type CodegraphProcessInfo,
  parsePosixProcessTable,
  parseWindowsProcessTable,
} from "../process-sweep/process-table";
