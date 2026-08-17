import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { ReplyListenerRateLimiter } from "../reply-listener-injection"
import { pollSlackReplies } from "../reply-listener-slack"
import * as injectionModule from "../reply-listener-injection"
import * as sessionRegistryModule from "../session-registry"
import type { ReplyListenerDaemonState } from "../reply-listener-state"
import type { OpenClawConfig } from "../types"
import { unsafeTestValue } from "../../../../test-support/unsafe-test-value"

const originalFetch = globalThis.fetch

const tempHome = mkdtempSync(join(tmpdir(), "openclaw-reply-listener-slack-"))
const stateDir = join(tempHome, ".omo", "openclaw", "state")
const stateFilePath = join(stateDir, "reply-listener-state.json")

function createConfig(): OpenClawConfig {
  return {
    enabled: true,
    gateways: {
      gateway: {
        type: "http",
        url: "https://example.com",
        method: "POST",
      },
    },
    hooks: {},
    replyListener: {
      slackBotToken: "xoxb-test-token",
      slackChannelId: "C0123456789",
      authorizedSlackUserIds: ["U0123456789"],
      pollIntervalMs: 10,
      rateLimitPerMinute: 10,
      maxMessageLength: 500,
      includePrefix: true,
    },
  }
}

function createState(): ReplyListenerDaemonState {
  return {
    isRunning: true,
    pid: 1234,
    startedAt: "2026-04-07T00:00:00.000Z",
    startupToken: "startup-token",
    configSignature: null,
    lastPollAt: "2026-04-07T00:00:01.000Z",
    telegramLastUpdateId: null,
    discordLastMessageId: null,
    lastDiscordMessageId: null,
    slackLastMessageTs: null,
    lastSlackMessageTs: null,
    messagesSeen: 0,
    messagesInjected: 0,
    errors: 0,
  }
}

describe("pollSlackReplies", () => {
  beforeEach(() => {
    process.env.HOME = tempHome
    process.env.USERPROFILE = tempHome
    globalThis.fetch = originalFetch
    rmSync(stateDir, { recursive: true, force: true })
    mkdirSync(stateDir, { recursive: true })
  })

  afterEach(() => {
    mock.restore()
    globalThis.fetch = originalFetch
  })

  test("records API errors in daemon state when Slack returns non-ok", async () => {
    const fetchMock = mock(() => Promise.resolve(
      new Response(JSON.stringify({ ok: false, error: "invalid_auth" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ))
    globalThis.fetch = unsafeTestValue<typeof fetch>(fetchMock)

    const state = createState()

    await pollSlackReplies(createConfig(), state, new ReplyListenerRateLimiter(10))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(state.errors).toBe(1)
    expect(state.lastError).toBe("Slack API error: invalid_auth")
    expect(existsSync(stateFilePath)).toBe(true)

    const persistedState = JSON.parse(readFileSync(stateFilePath, "utf-8")) as ReplyListenerDaemonState
    expect(persistedState.errors).toBe(1)
    expect(persistedState.lastError).toBe("Slack API error: invalid_auth")
    expect(persistedState.messagesSeen).toBe(0)
  })

  test("records HTTP non-200 responses as errors", async () => {
    const fetchMock = mock(() => Promise.resolve(
      new Response(null, { status: 500 }),
    ))
    globalThis.fetch = unsafeTestValue<typeof fetch>(fetchMock)

    const state = createState()

    await pollSlackReplies(createConfig(), state, new ReplyListenerRateLimiter(10))

    expect(state.errors).toBe(1)
    expect(state.lastError).toBe("Slack API error: HTTP 500")
  })

  test("increments messagesInjected when a Slack threaded reply matches a registered message", async () => {
    const fetchMock = mock()
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            messages: [
              {
                type: "message",
                subtype: "reply",
                text: "LGTM, approved",
                user: "U0123456789",
                ts: "1234567890.123456",
                thread_ts: "1234567890.111111",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    globalThis.fetch = unsafeTestValue<typeof fetch>(fetchMock)

    const lookupSpy = spyOn(sessionRegistryModule, "lookupByMessageId").mockReturnValue({
      sessionId: "ses-1",
      tmuxSession: "session-1",
      tmuxPaneId: "%7",
      projectPath: "/tmp/project",
      platform: "slack",
      messageId: "1234567890.111111",
      createdAt: "2026-04-07T00:00:00.000Z",
    })
    const injectSpy = spyOn(injectionModule, "injectReplyIntoPane").mockResolvedValue(true)

    const state = createState()

    await pollSlackReplies(createConfig(), state, new ReplyListenerRateLimiter(10))

    expect(lookupSpy).toHaveBeenCalledWith("slack", "1234567890.111111")
    expect(injectSpy).toHaveBeenCalledWith("%7", "LGTM, approved", "slack", createConfig())
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(state.messagesSeen).toBe(1)
    expect(state.messagesInjected).toBe(1)
    expect(state.lastSlackMessageTs).toBe("1234567890.123456")
  })

  test("skips non-threaded messages", async () => {
    const fetchMock = mock()
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          messages: [
            {
              type: "message",
              text: "This is a top-level message",
              user: "U0123456789",
              ts: "1234567890.222222",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
    globalThis.fetch = unsafeTestValue<typeof fetch>(fetchMock)

    const lookupSpy = spyOn(sessionRegistryModule, "lookupByMessageId")
    const state = createState()

    await pollSlackReplies(createConfig(), state, new ReplyListenerRateLimiter(10))

    expect(lookupSpy).not.toHaveBeenCalled()
    expect(state.messagesSeen).toBe(1)
    expect(state.messagesInjected).toBe(0)
  })

  test("skips unauthorized users", async () => {
    const fetchMock = mock()
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          messages: [
            {
              type: "message",
              subtype: "reply",
              text: "unauthorized reply",
              user: "U9999999999",
              ts: "1234567890.333333",
              thread_ts: "1234567890.111111",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
    globalThis.fetch = unsafeTestValue<typeof fetch>(fetchMock)

    const lookupSpy = spyOn(sessionRegistryModule, "lookupByMessageId")
    const state = createState()

    await pollSlackReplies(createConfig(), state, new ReplyListenerRateLimiter(10))

    expect(lookupSpy).not.toHaveBeenCalled()
    expect(state.messagesSeen).toBe(1)
    expect(state.messagesInjected).toBe(0)
  })

  test("does nothing when slackBotToken is missing", async () => {
    const configWithoutSlack: OpenClawConfig = {
      ...createConfig(),
      replyListener: {
        ...createConfig().replyListener!,
        slackBotToken: undefined,
        slackChannelId: "C0123456789",
      } as import("../types").OpenClawReplyListenerConfig,
    }

    const fetchMock = mock()
    globalThis.fetch = unsafeTestValue<typeof fetch>(fetchMock)

    const state = createState()

    await pollSlackReplies(configWithoutSlack, state, new ReplyListenerRateLimiter(10))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(state.messagesSeen).toBe(0)
  })

  test("does nothing when slackChannelId is missing", async () => {
    const configWithoutChannel: OpenClawConfig = {
      ...createConfig(),
      replyListener: {
        ...createConfig().replyListener!,
        slackBotToken: "xoxb-test-token",
        slackChannelId: undefined,
      } as import("../types").OpenClawReplyListenerConfig,
    }

    const fetchMock = mock()
    globalThis.fetch = unsafeTestValue<typeof fetch>(fetchMock)

    const state = createState()

    await pollSlackReplies(configWithoutChannel, state, new ReplyListenerRateLimiter(10))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(state.messagesSeen).toBe(0)
  })
})
