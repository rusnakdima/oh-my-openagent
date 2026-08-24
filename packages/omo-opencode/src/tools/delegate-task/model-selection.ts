import {
  type DelegateModelResolutionInput,
  type DelegateModelResolutionResult,
  resolveModelForDelegateTask as resolveModelForDelegateTaskCore,
} from "@oh-my-opencode/delegate-core";
import { log } from "../../shared/logger";

export type { DelegateModelResolutionInput, DelegateModelResolutionResult };

export function resolveModelForDelegateTask(
  input: DelegateModelResolutionInput,
): DelegateModelResolutionResult {
  return resolveModelForDelegateTaskCore(input, {
    log,
  });
}
