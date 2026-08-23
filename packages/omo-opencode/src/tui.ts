import type { Renderable, TuiPluginModule } from "@opencode-ai/plugin/tui";

import { registerBtwSideTui } from "./features/btw-side";
import { computeView, viewKey } from "./features/tui-sidebar/compute-view";
import { POLL_INTERVAL_MS } from "./features/tui-sidebar/constants";
import {
  deriveAgents,
  deriveConfig,
  deriveJobBoard,
  deriveLoop,
  deriveRoster,
} from "./features/tui-sidebar/derivers";
import type { ViewNode } from "./features/tui-sidebar/element-helpers";
import { readMirror } from "./features/tui-sidebar/mirror-io";
import { buildViewNodes } from "./features/tui-sidebar/render-view";
import type { RosterRow } from "./features/tui-sidebar/state-types";
import type { SidebarView } from "./features/tui-sidebar/state-types";
import { log } from "./shared/logger";
import { setupTuiVoice } from "./tui-voice/index";
import { getAvailableModels } from "./shared/model-cache-state";

type SolidRuntime<Node> = {
  readonly createElement: (tag: string) => Node;
  readonly insert: (parent: Node, child: Node | string) => unknown;
  readonly setProp: (node: Node, name: string, value: unknown) => unknown;
};

type SidebarSlotRegistration<Node> = {
  readonly order: number;
  readonly slots: {
    readonly sidebar_content: () => Node;
  };
};

type RegisterSidebarContentSlotInput<Node> = {
  readonly registerSlot: (registration: SidebarSlotRegistration<Node>) => void;
  readonly requestRender: () => void;
  readonly renderSidebar: () => Node;
};

function registerSidebarContentSlot<Node>({
  registerSlot,
  requestRender,
  renderSidebar,
}: RegisterSidebarContentSlotInput<Node>): void {
  registerSlot({
    order: 900,
    slots: {
      sidebar_content: renderSidebar,
    },
  });
  requestRender();
}

export function materialize<Node>(
  nodes: readonly ViewNode[],
  solid: SolidRuntime<Node>,
): Node {
  const root = solid.createElement("box");
  solid.setProp(root, "flexDirection", "column");
  for (const node of nodes) {
    solid.insert(root, materializeNode(node, solid));
  }
  return root;
}

function materializeNode<Node>(
  node: ViewNode,
  solid: SolidRuntime<Node>,
): Node {
  const element = solid.createElement(node.kind);
  for (const [name, value] of Object.entries(node.props)) {
    solid.setProp(element, name, value);
  }
  if (node.kind === "text") {
    solid.insert(element, node.text ?? "");
  }
  for (const child of node.children ?? []) {
    solid.insert(element, materializeNode(child, solid));
  }
  return element;
}

type RosterResolver = (
  directory: string,
  tuiSelectedModel?: { providerID: string; modelID: string },
  perAgentModels?: Record<string, { providerID: string; modelID: string }>,
) => RosterRow[];
type PluginValidation = {
  readonly valid: boolean;
  readonly messages: readonly string[];
  readonly config: {
    readonly tui?: {
      readonly sidebar?: {
        readonly enabled?: boolean;
      };
    };
  };
};

async function loadPluginValidation(
  directory: string,
): Promise<PluginValidation> {
  const { validatePluginConfig } = await import("./config/validate");
  return validatePluginConfig(directory);
}

async function loadRosterRows(
  directory: string,
): Promise<readonly RosterRow[]> {
  const { resolveRoster } = await import(
    "./features/tui-sidebar/roster-resolver"
  );
  const resolver: RosterResolver = resolveRoster;
  return resolver(directory);
}

async function readView(directory: string): Promise<SidebarView> {
  const validation = await loadPluginValidation(directory);
  const mirror = readMirror(directory);
  const roster = await loadRosterRows(directory);
  return computeView({
    config: deriveConfig(validation),
    roster: deriveRoster(roster),
    agents: deriveAgents(mirror),
    jobs: deriveJobBoard(mirror),
    loop: deriveLoop(mirror),
  });
}

export function handleTuiPollError(
  error: unknown,
  reportPollError: (error: Error) => void = (pollError) =>
    log("[tui-sidebar] polling failed", { error: pollError }),
): void {
  if (error instanceof Error) {
    reportPollError(error);
    return;
  }
  throw error;
}

// @ts-ignore - console.log for debugging
const module: TuiPluginModule = {
  id: "oh-my-openagent:tui",
  tui: async (api) => {
    console.error(
      "[tui] TUI PLUGIN LOADING NOW!!! api keys:",
      Object.keys(api),
    );
    log("[tui] TUI plugin loading...");
    log("[tui] api keys:", Object.keys(api));
    log("[tui] api.command available:", !!api.command);
    log("[tui] api.ui available:", !!api.ui);
    const solid = await import("@opentui/solid").catch(() => null);
    if (!solid) {
      console.error("[tui] @opentui/solid not available - skipping TUI plugin");
      log("[tui] @opentui/solid not available - skipping TUI plugin");
      return;
    }
    console.error("[tui] @opentui/solid loaded successfully");
    log("[tui] @opentui/solid loaded successfully");

    try {
      await registerBtwSideTui(api, solid);
    } catch (error) {
      log("[btw-side] TUI registration failed", { error });
    }

    const directory = api.state.path.directory;
    if (
      (await loadPluginValidation(directory)).config.tui?.sidebar?.enabled ===
        false
    ) {
      return;
    }

    // Get initial roster rows for click mapping
    const initialRoster = await loadRosterRows(directory);

    let currentView = await readView(directory);
    let currentKey = viewKey(currentView);
    let disposed = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function requestRenderWithModal(): void {
      api.renderer.requestRender();
    }

    registerSidebarContentSlot({
      registerSlot: (registration) => {
        api.slots.register(registration);
      },
      requestRender: requestRenderWithModal,
      renderSidebar: () =>
        materialize(buildViewNodes(currentView, api.theme.current), solid),
    });

    // Handle sidebar click events from OpenCode TUI
    try {
      // @ts-ignore - sidebar click handler may not be in types
      if (api.client?.tui?.onSidebarClick) {
        // @ts-ignore
        api.client.tui.onSidebarClick((event: { index: number }) => {
          void handleSidebarClick(
            event.index,
            initialRoster,
            directory,
            currentView,
          );
        });
      }
    } catch {
      // onSidebarClick not available in this OpenCode version
    }

    // NOTE: /omo-model is removed — use OpenCode's native /models command instead.
    // The global model is captured via chat.message when the user sends a message
    // after selecting via /models.

    async function handleSidebarClick(
      index: number,
      _roster: readonly RosterRow[],
      _dir: string,
      currentView: Awaited<ReturnType<typeof readView>>,
    ): Promise<void> {
      // active view:  index 0 = box, index 1 = "Set Global Model"
      // broken view:  index 0 = section, index 1 = "Set Global Model"
      // idle view:    index 0 = section("Models"), 1..N = roster rows, N+1 = "Set Global Model"

      const setGlobalIndex = currentView.kind === "idle"
        ? _roster.length + 2
        : 1;

      if (index === setGlobalIndex) {
        openGlobalModelDialog();
      }
    }

    function openGlobalModelDialog(): void {
      const models = getAvailableModels();
      if (models.length === 0) {
        api.ui.dialog.replace(() =>
          api.ui.DialogSelect({
            title: "Pick Global Model",
            options: [
              {
                title: "No models available",
                value: null,
                description:
                  "Configure your API providers in OpenCode settings",
              },
            ],
            onSelect: () => {
              api.ui.dialog.clear();
            },
          })
        );
        return;
      }
      api.ui.dialog.replace(() =>
        api.ui.DialogSelect({
          title: "Pick Global Model",
          options: models.map((m) => ({
            title: m.label,
            value: m,
            description: `${m.providerID}/${m.modelID}`,
          })),
          onSelect: (opt) => {
            if (opt.value) {
              void applyModelSelection(opt.value);
            }
            api.ui.dialog.clear();
          },
        })
      );
    }

    async function applyModelSelection(
      model: { providerID: string; modelID: string },
    ): Promise<void> {
      try {
        // Persist to the cross-process store (the channel the server plugin reads)
        // and to the user config files (for future sessions). The server plugin's
        // chat.message override applies the pick to ALL agent modes live.
        const { applyGlobalModel } = await import(
          "./shared/session-model-state"
        );
        applyGlobalModel(model);
        const { writeGlobalModelToConfigs } = await import(
          "./shared/persist-config-model"
        );
        writeGlobalModelToConfigs(model);
        log("[tui] set global model", {
          providerID: model.providerID,
          modelID: model.modelID,
        });
      } catch (err) {
        log("[tui] failed to apply model selection", { error: err });
      }
    }

    const schedule = (): void => {
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    const tick = async (): Promise<void> => {
      if (disposed || inFlight) {
        if (!disposed) schedule();
        return;
      }
      inFlight = true;
      try {
        const nextView = await readView(directory);
        const nextKey = viewKey(nextView);
        if (nextKey !== currentKey) {
          currentView = nextView;
          currentKey = nextKey;
          api.renderer.requestRender();
        }
      } catch (error) {
        handleTuiPollError(error);
      } finally {
        inFlight = false;
        if (!disposed) schedule();
      }
    };

    schedule();
    api.lifecycle.onDispose(() => {
      disposed = true;
      if (timer) clearTimeout(timer);
    });

    // Set up push-to-talk voice mode (shortcut + indicator)
    void setupTuiVoice(api);
  },
};

export default module;
