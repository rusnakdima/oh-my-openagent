import { existsSync, readFileSync } from "node:fs";

import { getLogFilePath } from "../shared/logger";

export type LogOptions = {
  readonly tail?: number;
  readonly grep?: string;
  readonly path?: boolean;
};

export async function runLog(options: LogOptions = {}): Promise<number> {
  const logPath = getLogFilePath();

  if (options.path) {
    console.log(logPath);
    return 0;
  }

  if (!existsSync(logPath)) {
    console.error(`Log file not found: ${logPath}`);
    return 1;
  }

  try {
    const content = readFileSync(logPath, "utf-8");
    let lines = content.split("\n");

    if (options.grep) {
      const pattern = options.grep;
      lines = lines.filter((line) => line.includes(pattern));
    }

    if (options.tail !== undefined && options.tail > 0) {
      lines = lines.slice(-options.tail);
    }

    console.log(lines.join("\n"));
    return 0;
  } catch (err) {
    console.error(
      `Failed to read log: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}
