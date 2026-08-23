import { watch } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function watchConfig(
  configPath?: string,
  reloadCallback?: () => void,
): void {
  const pathToWatch = configPath ||
    join(__dirname, "..", "..", "..", ".omo", "omo.jsonc");
  const onReload = reloadCallback || (() => console.log("Config reloaded"));

  try {
    const watcher = watch(
      pathToWatch,
      { persistent: true },
      (_eventType: string, _filename?: string | null) => {
        if (_filename) {
          console.log(`[config-watcher] File changed: ${_filename}`);
          onReload();
        }
      },
    );

    watcher.unref();
    console.log(`[config-watcher] Now watching: ${pathToWatch}`);
  } catch (error) {
    console.error(`[config-watcher] Failed to watch config: ${error}`);
  }
}
