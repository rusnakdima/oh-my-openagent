/** Compatibility export surface for memory-usage consumers. */
export {
  incrementMemoryUsage,
  type MemoryUsageEntry,
  type MemoryUsageLedger,
  type MemoryUsageLedgerPath,
  memoryUsagePaths,
  readMemoryUsageLedger,
} from "./memory-usage-ledger";
export {
  extractMemoryUsagePath,
  MemoryUsageTracker,
} from "./memory-usage-tracker";
export {
  type MemoryUsageOptions,
  registerMemoryUsage,
} from "./memory-usage-wiring";
