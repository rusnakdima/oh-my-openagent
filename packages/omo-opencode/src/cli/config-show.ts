import { loadPluginConfig } from "../plugin-config";

export type ConfigShowOptions = {
  readonly json?: boolean;
};

export async function configShow(
  options: ConfigShowOptions = {},
): Promise<number> {
  try {
    const config = loadPluginConfig(process.cwd(), {});

    if (options.json) {
      console.log(JSON.stringify(config, null, 2));
    } else {
      // Pretty-print with color using basic ANSI codes
      const output = JSON.stringify(config, null, 2);
      console.log(output);
    }
    return 0;
  } catch (err) {
    console.error(
      "Failed to load config:",
      err instanceof Error ? err.message : String(err),
    );
    return 1;
  }
}
