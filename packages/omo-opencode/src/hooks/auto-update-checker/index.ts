export { createAutoUpdateCheckerHook } from "./hook";

export {
  extractChannel,
  isDistTag,
  isPrereleaseOrDistTag,
  isPrereleaseVersion,
} from "./version-channel";

export { checkForUpdate } from "./checker";
export { invalidateCache, invalidatePackage } from "./cache";
export type { AutoUpdateCheckerOptions, UpdateCheckResult } from "./types";
