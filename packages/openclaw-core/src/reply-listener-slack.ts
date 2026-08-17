import { lookupByMessageId } from "./session-registry"
import { injectReplyIntoPane, ReplyListenerRateLimiter } from "./reply-listener-injection"
import { logReplyListenerMessage } from "./reply-listener-log"
import {
  recordSeenSlackMessage,
  writeReplyListenerDaemonState,
  type ReplyListenerDaemonState,
} from "./reply-listener-state"
import type { OpenClawConfig } from "./types"

interface SlackMessage {
  type: string
  subtype?: string
  text: string
  user: string
  ts: string
  thread_ts?: string
}

interface SlackConversationsHistoryResponse {
  ok: boolean
  messages?: SlackMessage[]
  has_more?: boolean
  cursor?: string
}

export async function pollSlackReplies(
  config: OpenClawConfig,
  state: ReplyListenerDaemonState,
  rateLimiter: ReplyListenerRateLimiter,
): Promise<void> {
  const replyListener = config.replyListener
  if (!replyListener?.slackBotToken || !replyListener.slackChannelId) return

  try {
    const oldest = state.slackLastMessageTs ?? "0"
    const url = `https://slack.com/api/conversations.history?channel=${replyListener.slackChannelId}&oldest=${oldest}&limit=10`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${replyListener.slackBotToken}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) {
      state.errors += 1
      state.lastError = `Slack API error: HTTP ${response.status}`
      logReplyListenerMessage(state.lastError!)
      writeReplyListenerDaemonState(state)
      return
    }

    const data = await response.json() as SlackConversationsHistoryResponse
    if (!data.ok) {
      state.errors += 1
      const errorMsg = (data as unknown as { error?: string }).error ?? "unknown"
      state.lastError = `Slack API error: ${errorMsg}`
      logReplyListenerMessage(state.lastError!)
      writeReplyListenerDaemonState(state)
      return
    }

    if (!data.messages || data.messages.length === 0) return

    for (const message of [...data.messages].reverse()) {
      // Record all messages seen for cursor tracking
      recordSeenSlackMessage(state, message.ts)
      writeReplyListenerDaemonState(state)

      // Skip messages without thread_ts (not a threaded reply)
      const parentTs = message.thread_ts
      if (!parentTs) continue

      // Filter by authorized users if configured
      if (replyListener.authorizedSlackUserIds && replyListener.authorizedSlackUserIds.length > 0) {
        if (!replyListener.authorizedSlackUserIds.includes(message.user)) continue
      }

      const mapping = lookupByMessageId("slack", parentTs)
      if (!mapping) continue

      if (!rateLimiter.canProceed()) {
        logReplyListenerMessage(`WARN: Rate limit exceeded, dropping Slack message ${message.ts}`)
        state.errors += 1
        continue
      }

      const success = await injectReplyIntoPane(mapping.tmuxPaneId, message.text, "slack", config)
      if (success) {
        state.messagesInjected += 1
        try {
          await fetch(
            `https://slack.com/api/reactions.add?channel=${replyListener.slackChannelId}&timestamp=${message.ts}&name=white_check_mark`,
            {
              method: "POST",
              headers: { "Authorization": `Bearer ${replyListener.slackBotToken}` },
            },
          )
        } catch (error) {
          logReplyListenerMessage(
            `WARN: Failed to acknowledge Slack message ${message.ts}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      } else {
        state.errors += 1
      }

      writeReplyListenerDaemonState(state)
    }
  } catch (error) {
    state.errors += 1
    state.lastError = error instanceof Error ? error.message : String(error)
    logReplyListenerMessage(`Slack polling error: ${state.lastError!}`)
  }
}
