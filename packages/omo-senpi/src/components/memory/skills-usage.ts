/** Compatibility export surface for skills-usage consumers. */
export {
  incrementSkillUsage,
  readSkillsUsageLedger,
  type SkillsUsageLedger,
  type SkillsUsageLedgerPath,
  skillsUsagePaths,
  type SkillUsageEntry,
} from "./skills-usage-ledger";
export { extractSkillId, SkillsUsageTracker } from "./skills-usage-tracker";
export {
  registerSkillsUsage,
  type SkillsUsageOptions,
} from "./skills-usage-wiring";
