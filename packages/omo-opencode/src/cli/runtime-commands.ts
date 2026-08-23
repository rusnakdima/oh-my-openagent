import type { Command } from "commander";

import { boulder } from "./boulder";
import { codexUlwLoop } from "./codex-ulw-loop";

export interface RuntimeCommandsOptions {
  readonly isCodexPlatform: boolean;
}

export function configureRuntimeCommands(
  program: Command,
  options: RuntimeCommandsOptions = { isCodexPlatform: false },
): void {
  program
    .command("boulder")
    .description("Show boulder progress, elapsed time, and per-task statistics")
    .option("-d, --directory <path>", "Working directory")
    .option("-w, --work-id <id>", "Filter to a specific work")
    .option("--json", "Output as JSON")
    .action(
      async (
        options: {
          readonly directory?: string;
          readonly workId?: string;
          readonly json?: boolean;
        },
      ) => {
        const exitCode = await boulder({
          directory: options.directory,
          workId: options.workId,
          json: options.json ?? false,
        });
        process.exit(exitCode);
      },
    );

  if (options.isCodexPlatform) {
    program
      .command("ulw-loop [args...]")
      .allowUnknownOption()
      .passThroughOptions()
      .description("Run the Codex LazyCodex ulw-loop CLI")
      .action(async (args: string[] = []) => {
        const exitCode = await codexUlwLoop(args);
        process.exit(exitCode);
      });
  }
}
