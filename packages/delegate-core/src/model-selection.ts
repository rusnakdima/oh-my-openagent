import {
  fuzzyMatchModel,
  normalizeModel,
  parseModelString,
  transformModelForProvider,
} from "@oh-my-opencode/model-core";

export {
  fuzzyMatchModel,
  normalizeModel,
  parseModelString,
  parseVariantFromModelID,
  transformModelForProvider,
} from "@oh-my-opencode/model-core";

// Deprecated: kept for backward compatibility with senpi-task
export type DelegateFallbackEntry = {
  readonly providers: string[];
  readonly model: string;
  readonly variant?: string;
};

export type DelegateModelResolutionInput = {
  readonly userModel?: string;
  readonly availableModels: ReadonlySet<string>;
  readonly systemDefaultModel?: string;
};

export type DelegateModelResolutionResult =
  | { readonly model: string; readonly variant?: string }
  | { readonly skipped: true }
  | undefined;

export type DelegateModelResolutionDeps = {
  readonly log?: (message: string, metadata?: Record<string, unknown>) => void;
};

export function resolveModelForDelegateTask(
  input: DelegateModelResolutionInput,
  deps: DelegateModelResolutionDeps,
): DelegateModelResolutionResult {
  // Step 1: User model — global TUI selection
  const userModel = normalizeModel(input.userModel);
  if (userModel) {
    const parsed = parseModelString(userModel);
    const variant = parsed?.variant;
    const baseModel = parsed
      ? `${parsed.providerID}/${parsed.modelID}`
      : userModel;
    const result = variant
      ? { model: baseModel, variant }
      : { model: userModel };

    // Validate against available models if cache is warm
    if (input.availableModels.size > 0) {
      const providerHint = parsed ? [parsed.providerID] : undefined;
      const match = fuzzyMatchModel(
        result.model,
        new Set(input.availableModels),
        providerHint,
      );
      if (match) {
        deps.log?.(
          "[resolveModelForDelegateTask] model resolved via user selection (availability confirmed)",
          {
            model: match,
          },
        );
        return result;
      }
      // User explicitly chose this model — honor it even if not in cache
      deps.log?.(
        "[resolveModelForDelegateTask] user model not in available models, using as-is",
        {
          model: result.model,
        },
      );
    }

    deps.log?.(
      "[resolveModelForDelegateTask] model resolved via user selection",
      {
        model: result.model,
      },
    );
    return result;
  }

  // Step 2: Cold cache skip — if no available models and no cache, defer
  if (
    input.availableModels.size === 0
  ) {
    deps.log?.(
      "[resolveModelForDelegateTask] cold cache — skipping resolution",
    );
    return { skipped: true };
  }

  // Step 3: System default model
  const systemDefaultModel = normalizeModel(input.systemDefaultModel);
  if (systemDefaultModel) {
    deps.log?.(
      "[resolveModelForDelegateTask] model resolved via system default",
      {
        model: systemDefaultModel,
      },
    );
    return { model: systemDefaultModel };
  }

  // No model available
  deps.log?.(
    "[resolveModelForDelegateTask] no model resolved — no user selection, no system default",
  );
  return undefined;
}
