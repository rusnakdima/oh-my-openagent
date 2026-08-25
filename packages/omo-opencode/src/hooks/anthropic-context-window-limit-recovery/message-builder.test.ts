import {
  afterAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";

import * as loggerModule from "../../shared/logger";
import * as storageDetection from "../../shared/opencode-storage-detection";
import * as emptyTextModule from "./storage/empty-text";
import * as textPartInjectorModule from "./storage/text-part-injector";

const replaceEmptyTextPartsAsync = mock(() => Promise.resolve(false));
const injectTextPartAsync = mock(() => Promise.resolve(false));
const findMessagesWithEmptyTextPartsFromSDK = mock(() =>
  Promise.resolve([] as string[])
);

// Spy on the real module namespaces and import `./message-builder` fresh per
// test (query-string cache buster) so its named-import bindings capture the
// currently-installed spies. Unlike mock.module(), this pattern is immune to
// other test files registering global module mocks before this file runs.
let cacheBuster = 0;

function installSpies(): void {
  spyOn(loggerModule, "log").mockImplementation(() => {});
  spyOn(storageDetection, "isSqliteBackend").mockImplementation(() => true);
  spyOn(emptyTextModule, "findMessagesWithEmptyTextParts").mockImplementation(
    () => [],
  );
  spyOn(emptyTextModule, "replaceEmptyTextParts").mockImplementation(
    () => false,
  );
  spyOn(emptyTextModule, "replaceEmptyTextPartsAsync").mockImplementation(
    (...args: Parameters<typeof replaceEmptyTextPartsAsync>) =>
      replaceEmptyTextPartsAsync(...args),
  );
  spyOn(
    emptyTextModule,
    "findMessagesWithEmptyTextPartsFromSDK",
  ).mockImplementation(
    (...args: Parameters<typeof findMessagesWithEmptyTextPartsFromSDK>) =>
      findMessagesWithEmptyTextPartsFromSDK(...args),
  );
  spyOn(textPartInjectorModule, "injectTextPart").mockImplementation(
    () => false,
  );
  spyOn(textPartInjectorModule, "injectTextPartAsync").mockImplementation(
    (...args: Parameters<typeof injectTextPartAsync>) =>
      injectTextPartAsync(...args),
  );
}

afterAll(() => {
  mock.restore();
});

describe("sanitizeEmptyMessagesBeforeSummarize", () => {
  let sanitizeEmptyMessagesBeforeSummarize: (typeof import("./message-builder"))["sanitizeEmptyMessagesBeforeSummarize"];
  let PLACEHOLDER_TEXT: string;

  beforeEach(async () => {
    replaceEmptyTextPartsAsync.mockReset();
    replaceEmptyTextPartsAsync.mockResolvedValue(false);
    injectTextPartAsync.mockReset();
    injectTextPartAsync.mockResolvedValue(false);
    findMessagesWithEmptyTextPartsFromSDK.mockReset();
    findMessagesWithEmptyTextPartsFromSDK.mockResolvedValue([]);

    installSpies();
    const mod = await import(`./message-builder?test=${cacheBuster++}`);
    sanitizeEmptyMessagesBeforeSummarize = mod.sanitizeEmptyMessagesBeforeSummarize;
    PLACEHOLDER_TEXT = mod.PLACEHOLDER_TEXT;
  });

  test("#given sqlite message with tool content and empty text part #when sanitizing #then it fixes the mixed-content message", async () => {
    const client = {
      session: {
        messages: mock(() =>
          Promise.resolve({
            data: [
              {
                info: { id: "msg-1" },
                parts: [
                  { type: "tool_result", text: "done" },
                  { type: "text", text: "" },
                ],
              },
            ],
          })
        ),
      },
    } as never;
    findMessagesWithEmptyTextPartsFromSDK.mockResolvedValue(["msg-1"]);
    replaceEmptyTextPartsAsync.mockResolvedValue(true);

    const fixedCount = await sanitizeEmptyMessagesBeforeSummarize(
      "ses-1",
      client,
    );

    expect(fixedCount).toBe(1);
    expect(replaceEmptyTextPartsAsync).toHaveBeenCalledWith(
      client,
      "ses-1",
      "msg-1",
      PLACEHOLDER_TEXT,
    );
    expect(injectTextPartAsync).not.toHaveBeenCalled();
  });

  test("#given sqlite message with mixed content and failed replacement #when sanitizing #then it injects the placeholder text part", async () => {
    const client = {
      session: {
        messages: mock(() =>
          Promise.resolve({
            data: [
              {
                info: { id: "msg-2" },
                parts: [
                  { type: "tool_use", text: "call" },
                  { type: "text", text: "" },
                ],
              },
            ],
          })
        ),
      },
    } as never;
    findMessagesWithEmptyTextPartsFromSDK.mockResolvedValue(["msg-2"]);
    injectTextPartAsync.mockResolvedValue(true);

    const fixedCount = await sanitizeEmptyMessagesBeforeSummarize(
      "ses-2",
      client,
    );

    expect(fixedCount).toBe(1);
    expect(injectTextPartAsync).toHaveBeenCalledWith(
      client,
      "ses-2",
      "msg-2",
      PLACEHOLDER_TEXT,
    );
  });
});
