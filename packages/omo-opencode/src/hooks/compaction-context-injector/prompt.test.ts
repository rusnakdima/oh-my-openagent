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

import type { BackgroundManager } from "../../features/background-agent";
import { TaskHistory } from "../../features/background-agent/task-history";
import { createCompactionContextInjector } from "./index";

function createMockBackgroundManager(): BackgroundManager {
  return { taskHistory: new TaskHistory() } as BackgroundManager;
}

describe("createCompactionContextInjector prompt", () => {
  describe("Delegated Agent Sessions", () => {
    it("injects actual task history when backgroundManager and sessionID provided", async () => {
      //#given
      const mockManager = createMockBackgroundManager();
      mockManager.taskHistory.record("ses_parent", {
        id: "t1",
        sessionID: "ses_child",
        agent: "explore",
        description: "Find patterns",
        status: "completed",
        category: "quick",
      });
      const injector = createCompactionContextInjector({
        backgroundManager: mockManager,
      });

      //#when
      const prompt = injector.inject("ses_parent");

      //#then
      expect(prompt).toContain("`ses_child`");
      expect(prompt).toContain("`t1`");
    });

    it("does not inject task history section when no entries exist", async () => {
      //#given
      const mockManager = createMockBackgroundManager();
      mockManager.taskHistory.record("ses_other", {
        id: "other",
        sessionID: "ses_child_other",
        agent: "explore",
        description: "Unrelated",
        status: "completed",
        category: "quick",
      });
      const injector = createCompactionContextInjector({
        backgroundManager: mockManager,
      });

      //#when
      const prompt = injector.inject("ses_empty");

      //#then
      expect(prompt).not.toContain("`ses_child_other`");
      expect(prompt).not.toContain("`other`");
    });

    it("keeps injected delegated history bounded for long task lists", async () => {
      //#given
      const mockManager = createMockBackgroundManager();
      for (let i = 0; i < 100; i++) {
        mockManager.taskHistory.record("ses_parent", {
          id: `t${i}`,
          sessionID: `ses_child_${i}`,
          agent: "explore",
          description: "Inspect verbose delegated task context. ".repeat(200),
          status: "completed",
          category: "quick",
        });
      }
      const injector = createCompactionContextInjector({
        backgroundManager: mockManager,
      });

      //#when
      const prompt = injector.inject("ses_parent");

      //#then - only the most recent entries survive the compaction cap
      expect(prompt).toContain("`t99`");
      expect(prompt).not.toContain("`t0`");
    });
  });
});
