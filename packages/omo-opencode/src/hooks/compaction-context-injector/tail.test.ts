import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

import * as systemDirective from "../../shared/system-directive";

beforeEach(() => {
  mock.restore();
  spyOn(systemDirective, "createSystemDirective").mockImplementation(
    (type: string) => `[DIRECTIVE:${type}]`,
  );
});

afterEach(() => {
  mock.restore();
});

afterAll(() => {
  mock.restore();
});

import { createCompactionContextInjector } from "./index";

type PromptAsyncInput = {
  path: { id: string };
  body: {
    noReply?: boolean;
    agent?: string;
  };
};

function createMockContext(
  promptAsyncMock = mock(async (_input: PromptAsyncInput) => ({})),
) {
  let callIndex = 0;
  const responses = [
    [{
      info: {
        role: "user",
        agent: "atlas",
        model: { providerID: "openai", modelID: "gpt-5" },
      },
    }],
    [{
      info: {
        role: "user",
        agent: "atlas",
        model: { providerID: "openai", modelID: "gpt-5" },
      },
    }],
    [{
      info: {
        role: "user",
        agent: "atlas",
        model: { providerID: "openai", modelID: "gpt-5" },
      },
    }],
  ];

  return {
    client: {
      session: {
        messages: mock(async () => {
          const response =
            responses[Math.min(callIndex, responses.length - 1)] ?? [];
          callIndex += 1;
          return { data: response };
        }),
        promptAsync: promptAsyncMock,
      },
    },
    directory: "/tmp/test",
  };
}

describe("createCompactionContextInjector tail recovery", () => {
  it("recovers after five consecutive assistant messages with no text", async () => {
    //#given
    const promptAsyncMock = mock(async (_input: PromptAsyncInput) => ({}));
    const ctx = createMockContext(promptAsyncMock);
    const injector = createCompactionContextInjector({ ctx });

    await injector.capture("ses_no_text_tail");
    await injector.event({
      event: {
        type: "session.compacted",
        properties: { sessionID: "ses_no_text_tail" },
      },
    });

    //#when
    for (let index = 1; index <= 5; index++) {
      await injector.event({
        event: {
          type: "message.updated",
          properties: {
            info: {
              id: `msg_${index}`,
              role: "assistant",
              sessionID: "ses_no_text_tail",
            },
          },
        },
      });
    }
    await injector.event({
      event: {
        type: "session.idle",
        properties: { sessionID: "ses_no_text_tail" },
      },
    });

    //#then
    expect(promptAsyncMock).toHaveBeenCalledTimes(1);
    const recoveryCall = promptAsyncMock.mock.calls[0]?.[0];
    expect(recoveryCall?.path).toEqual({ id: "ses_no_text_tail" });
    expect(recoveryCall?.body.noReply).toBe(true);
    expect(recoveryCall?.body.agent).toBe("atlas");
  });
});
