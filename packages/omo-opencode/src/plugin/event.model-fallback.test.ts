/// <reference types="bun-types" />
import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { createEventHandler } from "./event";
import {
  _resetForTesting,
  setMainSession,
} from "../features/claude-code-session-state";
import {
  clearPendingModelFallback,
  createModelFallbackHook,
} from "../hooks/model-fallback/hook";
import * as connectedProvidersCache from "../shared/connected-providers-cache";
import {
  releaseAllPromptAsyncReservationsForTesting,
} from "../hooks/shared/prompt-async-gate";
import { unsafeTestValue } from "../../../../test-support/unsafe-test-value";

type EventInput = { event: { type: string; properties?: unknown } };
type EventHandlerInput = Parameters<ReturnType<typeof createEventHandler>>[0];

function asEventHandlerInput(input: EventInput): EventHandlerInput {
  return unsafeTestValue<EventHandlerInput>(input);
}

let readConnectedProvidersCacheSpy: { mockRestore: () => void } | undefined;
let readProviderModelsCacheSpy: { mockRestore: () => void } | undefined;

function setupConnectedProviderCacheMocks(): void {
  readConnectedProvidersCacheSpy = spyOn(
    connectedProvidersCache,
    "readConnectedProvidersCache",
  ).mockReturnValue(null);
  readProviderModelsCacheSpy = spyOn(
    connectedProvidersCache,
    "readProviderModelsCache",
  ).mockReturnValue(null);
}

describe("createEventHandler - model fallback", () => {
  const createHandler = (args?: {
    hooks?: unknown;
    pluginConfig?: unknown;
    abort?: (input: { path: { id: string } }) => Promise<unknown>;
    promptAsync?: (input: { path: { id: string } }) => Promise<unknown>;
  }) => {
    setupConnectedProviderCacheMocks();
    const abortCalls: string[] = [];
    const promptCalls: string[] = [];
    const promptAsyncCalls: string[] = [];

    const sessionClient = {
      abort: async ({ path }: { path: { id: string } }) => {
        abortCalls.push(path.id);
        if (args?.abort) {
          return args.abort({ path });
        }
        return {};
      },
      prompt: async ({ path }: { path: { id: string } }) => {
        promptCalls.push(path.id);
        return {};
      },
      ...(args?.promptAsync
        ? {
          promptAsync: async (input: { path: { id: string } }) => {
            promptAsyncCalls.push(input.path.id);
            return args.promptAsync?.(input);
          },
        }
        : {}),
    };

    const eventHandler = createEventHandler({
      ctx: unsafeTestValue({
        directory: "/tmp",
        client: {
          session: sessionClient,
        },
      }),
      pluginConfig: unsafeTestValue(args?.pluginConfig ?? {}),
      firstMessageVariantGate: {
        markSessionCreated: () => {},
        clear: () => {},
      },
      managers: unsafeTestValue({
        tmuxSessionManager: {
          onSessionCreated: async () => {},
          onSessionDeleted: async () => {},
        },
        skillMcpManager: {
          disconnectSession: async () => {},
        },
      }),
      hooks: unsafeTestValue(args?.hooks ?? {}),
    });
    const handler = (input: EventInput): Promise<void> =>
      eventHandler(asEventHandlerInput(input));

    return { handler, abortCalls, promptCalls, promptAsyncCalls };
  };

  afterEach(() => {
    readConnectedProvidersCacheSpy?.mockRestore();
    readProviderModelsCacheSpy?.mockRestore();
    readConnectedProvidersCacheSpy = undefined;
    readProviderModelsCacheSpy = undefined;
    _resetForTesting();
    releaseAllPromptAsyncReservationsForTesting();
  });

  test("does not trigger model-fallback from session.status when runtime_fallback is enabled", async () => {
    //#given
    const sessionID = "ses_status_retry_runtime_enabled";
    setMainSession(sessionID);
    const modelFallback = createModelFallbackHook();
    clearPendingModelFallback(modelFallback, sessionID);
    const runtimeFallback = {
      event: async () => {},
      "chat.message": async () => {},
    };
    const { handler, abortCalls, promptCalls } = createHandler({
      hooks: { modelFallback, runtimeFallback },
      pluginConfig: { runtime_fallback: { enabled: true } },
    });

    await handler({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_user_status_runtime_enabled",
            sessionID,
            role: "user",
            modelID: "claude-opus-4-8",
            providerID: "quotio",
            agent: "Sisyphus - Ultraworker",
          },
        },
      },
    });

    //#when
    await handler({
      event: {
        type: "session.status",
        properties: {
          sessionID,
          status: {
            type: "retry",
            attempt: 1,
            message:
              "All credentials for model claude-opus-4-8 are cooling down [retrying in 7m 56s attempt #1]",
            next: 476,
          },
        },
      },
    });

    //#then
    expect(abortCalls).toEqual([]);
    expect(promptCalls).toEqual([]);
  });

  test("does not trigger model-fallback retry when modelFallback hook is not provided (disabled by default)", async () => {
    //#given
    const sessionID = "ses_disabled_by_default";
    setMainSession(sessionID);
    const { handler, abortCalls, promptCalls } = createHandler();

    //#when - message.updated with assistant error
    await handler({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_err_disabled_1",
            sessionID,
            role: "assistant",
            time: { created: 1, completed: 2 },
            error: {
              name: "APIError",
              data: {
                message:
                  'Bad Gateway: {"error":{"message":"unknown provider for model claude-opus-4-8-thinking"}}',
                isRetryable: true,
              },
            },
            parentID: "msg_user_disabled_1",
            modelID: "claude-opus-4-8-thinking",
            providerID: "anthropic",
            agent: "Sisyphus - Ultraworker",
            path: { cwd: "/tmp", root: "/tmp" },
            cost: 0,
            tokens: {
              input: 0,
              output: 0,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
        },
      },
    });

    //#when - session.error with retryable error
    await handler({
      event: {
        type: "session.error",
        properties: {
          sessionID,
          error: {
            name: "UnknownError",
            data: {
              error: {
                message:
                  'Bad Gateway: {"error":{"message":"unknown provider for model claude-opus-4-8-thinking"}}',
              },
            },
          },
        },
      },
    });

    //#then - no abort or prompt calls should have been made
    expect(abortCalls).toEqual([]);
    expect(promptCalls).toEqual([]);
  });
});
