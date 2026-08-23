import { join } from "path";
import { mkdirSync } from "fs";

export const INTERACTIVE_MENU_STORAGE_DIR = join(
  process.env.OMO_MENU_HOME ??
    join(process.env.HOME ?? "/tmp", ".omo", "interactive-menu"),
);
export const OMO_MENU_PANE_PREFIX = "omo-menu-";

export function buildMenuReminderMessage(): string {
  return "";
}
