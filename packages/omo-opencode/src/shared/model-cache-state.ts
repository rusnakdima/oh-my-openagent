/**
 * Model Cache State for TUI
 *
 * Provides access to available models for the TUI sidebar and model picker.
 * Models are read from the connected-providers cache (JSON file).
 */

import {
  type ProviderModelsCache,
  readProviderModelsCache,
} from "./connected-providers-cache";

// Module-level singleton for TUI access
let cachedModels:
  | Array<{ providerID: string; modelID: string; label: string }>
  | null = null;

/**
 * Get the list of available models for the model picker.
 * Reads from the provider models cache and returns formatted model entries.
 */
export function getAvailableModels(): Array<
  { providerID: string; modelID: string; label: string }
> {
  // Return cached if available
  if (cachedModels !== null) {
    return cachedModels;
  }

  const cache: ProviderModelsCache | null = readProviderModelsCache();
  if (!cache) {
    return [];
  }

  const models: Array<{ providerID: string; modelID: string; label: string }> =
    [];

  // Iterate over all providers and their models
  for (const [providerID, modelEntries] of Object.entries(cache.models)) {
    for (const entry of modelEntries) {
      if (typeof entry === "string") {
        // Simple model ID string
        models.push({
          providerID,
          modelID: entry,
          label: entry,
        });
      } else if (entry && typeof entry === "object" && "id" in entry) {
        // Model metadata object
        models.push({
          providerID,
          modelID: entry.id,
          label: entry.name ?? entry.id,
        });
      }
    }
  }

  // Sort by label for consistent display
  models.sort((a, b) => a.label.localeCompare(b.label));

  // Cache the result
  cachedModels = models;

  return models;
}

/**
 * Refresh the cached model list.
 * Call this when models may have changed.
 */
export function refreshCachedModels(): void {
  cachedModels = null;
}
