import color from "picocolors";
import { validatePluginConfig } from "../config/validate";
import { getMainSessions } from "../tools/session-manager/storage";

export interface HealthDashboardData {
  timestamp: string;
  configValid: boolean;
  configPath: string | null;
  teamModeEnabled: boolean;
  telemetryEnabled: boolean;
  sessionCount: number;
}

async function buildHealthData(): Promise<HealthDashboardData> {
  const timestamp = new Date().toISOString();

  // Config validity
  const validation = validatePluginConfig(process.cwd());
  const configValid = validation.valid;
  const configPath = validation.path ?? null;
  const pluginConfig = validation.config;
  const teamModeEnabled = pluginConfig?.team_mode?.enabled ?? false;
  const telemetryEnabled = pluginConfig?.telemetry ?? false;

  // Session count
  const sessions = await getMainSessions({});
  const sessionCount = sessions.length;

  return {
    timestamp,
    configValid,
    configPath,
    teamModeEnabled,
    telemetryEnabled,
    sessionCount,
  };
}

function formatTextOutput(data: HealthDashboardData): void {
  console.log(color.bold(color.cyan("=== Plugin Health ===")));
  console.log();
  console.log(`${color.bold("Timestamp:")} ${data.timestamp}`);
  console.log(
    `${color.bold("Config:")} ${
      data.configValid ? color.green("valid") : color.red("invalid")
    } ${data.configPath ? `(${data.configPath})` : ""}`,
  );
  console.log(
    `${color.bold("Team Mode:")} ${
      data.teamModeEnabled ? color.green("enabled") : color.yellow("disabled")
    }`,
  );
  console.log(
    `${color.bold("Telemetry:")} ${
      data.telemetryEnabled ? color.green("enabled") : color.yellow("disabled")
    }`,
  );
  console.log(
    `${color.bold("Sessions:")} ${color.yellow(data.sessionCount.toString())}`,
  );
}

function formatJsonOutput(data: HealthDashboardData): void {
  console.log(
    JSON.stringify(
      {
        timestamp: data.timestamp,
        config_valid: data.configValid,
        config_path: data.configPath,
        team_mode_enabled: data.teamModeEnabled,
        telemetry_enabled: data.telemetryEnabled,
        session_count: data.sessionCount,
      },
      null,
      2,
    ),
  );
}

export async function runHealthDashboard(
  options: { json?: boolean },
): Promise<number> {
  try {
    const data = await buildHealthData();

    if (options.json) {
      formatJsonOutput(data);
    } else {
      formatTextOutput(data);
    }

    return 0;
  } catch (error) {
    if (options.json) {
      console.error(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } else {
      console.error(
        color.red(
          `Error running health dashboard: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );
    }
    return 1;
  }
}
