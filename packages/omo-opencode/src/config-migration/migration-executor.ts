import {
  type MigrationRunResult,
  runMigration,
  type RunMigrationOptions,
} from "@oh-my-opencode/omo-config-core";

import type { LegacyConfigMigrationPlan } from "./migration-plans";

export type ExecuteLegacyConfigMigrationPlanOptions = Omit<
  RunMigrationOptions,
  "id" | "sources" | "targetPath" | "transform"
>;

export function executeLegacyConfigMigrationPlan(
  plan: LegacyConfigMigrationPlan,
  options: ExecuteLegacyConfigMigrationPlanOptions = {},
): MigrationRunResult {
  return runMigration({ ...options, ...plan });
}
