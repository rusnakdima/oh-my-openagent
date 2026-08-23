/**
 * Backward-compatible shim: the implementation moved to
 * `../process-sweep/exec` (family-based sweep restructure).
 */
export {
  type CodegraphProcessKiller,
  createDefaultCodegraphProcessKiller,
  enumerateCodegraphProcesses,
} from "../process-sweep/exec";
