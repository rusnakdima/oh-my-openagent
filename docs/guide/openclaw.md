# OpenClaw — Bidirectional Integration

OpenClaw provides bidirectional integration between OpenCode sessions and
external platforms. Outbound webhooks and shell commands fire on session
lifecycle events; an optional inbound reply-listener daemon polls Discord,
Telegram, and Slack for threaded replies and injects them into active tmux
panes.

## Status

Disabled by default. Configure and enable to activate.

## Outbound — Session Events → External Platforms

Configure HTTP webhooks or shell commands that fire when session events occur.

### Config

Add to the `[opencode]` block of `~/.omo/omo.jsonc` (user) or `.omo/omo.jsonc`
(project):

```jsonc
{
  "openclaw": {
    "enabled": true,
    "gateways": {
      "my-team": {
        "type": "http",
        "url": "https://hooks.slack.com/services/xxx/yyy/zzz",
        "method": "POST",
        "headers": {
          "Content-Type": "application/json"
        }
      }
    },
    "hooks": {
      "session-start": {
        "enabled": true,
        "gateway": "my-team",
        "instruction": "Session {{sessionId}} started in {{projectName}}"
      },
      "session-end": {
        "enabled": true,
        "gateway": "my-team",
        "instruction": "Session {{sessionId}} ended"
      }
    }
  }
}
```

### Available Events

| Event             | When it fires                 |
| ----------------- | ----------------------------- |
| `session-created` | New session started           |
| `session-deleted` | Session deleted or cleaned up |
| `session-idle`    | Agent became idle             |
| `session-error`   | Session hit an error          |
| `session-start`   | Session began processing      |
| `session-end`     | Session completed             |
| `stop`            | User sent stop signal         |

### Payload Variables

Available in both `instruction` templates and shell `command`:

| Variable             | Description                                         |
| -------------------- | --------------------------------------------------- |
| `{{sessionId}}`      | Session ID                                          |
| `{{projectPath}}`    | Absolute project path                               |
| `{{projectName}}`    | Project directory name                              |
| `{{tmuxSession}}`    | Active tmux session name                            |
| `{{tmuxTail}}`       | Last 15 lines of tmux pane (session-end, stop only) |
| `{{event}}`          | Event type name                                     |
| `{{timestamp}}`      | ISO 8601 timestamp                                  |
| `{{prompt}}`         | First user message                                  |
| `{{contextSummary}}` | Context summary                                     |
| `{{reasoning}}`      | Reasoning trace                                     |
| `{{question}}`       | Extracted question                                  |
| `{{instruction}}`    | Interpolated instruction text                       |

### Shell Gateway

```jsonc
{
  "gateways": {
    "local-script": {
      "type": "command",
      "command": "/usr/local/bin/my-script.sh --session {{sessionId}} --project {{projectPath}}"
    }
  }
}
```

## Inbound — Reply Listener (Discord / Telegram / Slack)

The reply listener daemon polls Discord, Telegram, and Slack for threaded
replies and injects them as keyboard input into tracked tmux panes.

### Enable

```jsonc
{
  "openclaw": {
    "replyListener": {
      "discordBotToken": "Bot ...",
      "discordChannelId": "...",
      "authorizedDiscordUserIds": ["..."],

      "telegramBotToken": "...",
      "telegramChatId": "...",

      "slackBotToken": "xoxb-...",
      "slackChannelId": "C...",
      "authorizedSlackUserIds": ["U..."],

      "pollIntervalMs": 3000,
      "rateLimitPerMinute": 10,
      "maxMessageLength": 500
    }
  }
}
```

Only the platforms with credentials configured will be polled. Remove the fields
for platforms you do not use.

### Discord Setup

1. Create a Discord bot at
   [discord.com/developers](https://discord.com/developers)
2. Add the bot to your server with `Read Message History` and `Read` permissions
3. Copy the bot token and the channel ID where the bot should listen
4. Configure `authorizedDiscordUserIds` to restrict who can trigger replies

**How replies work:** The daemon watches for messages that reply to a previously
sent bot message. The reply content is injected into the matching tmux pane.

### Telegram Setup

1. Create a bot via [@BotFather](https://t.me/botfather)
2. Copy the bot token and start a chat with the bot
3. Get your chat ID (e.g. via `@userinfobot`)
4. Configure `telegramChatId` and reply to a bot message to trigger injection

**How replies work:** Reply to a bot message in the configured chat. The daemon
detects the `reply_to_message` field and injects the reply text.

### Slack Setup

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps)
2. Enable **Bot Token** scope with `chat:write`, `channels:history`,
   `channels:read`
3. Install the app to your workspace and copy the **Bot User OAuth Token**
   (starts with `xoxb-`)
4. Add the bot to the target channel
5. Copy the **Channel ID** (starts with `C`)
6. Optionally configure `authorizedSlackUserIds` to restrict inbound replies

**How replies work:** The daemon polls `conversations.history` and detects
threaded replies to messages sent by the bot. Reply to a bot message in a thread
to trigger injection. The daemon reacts with a white checkmark to acknowledge
receipt.

### Security

- HTTPS required for webhook URLs (localhost exempt)
- `authorizedDiscordUserIds` / `authorizedSlackUserIds` filter inbound messages
  by user ID
- Rate limiter: max 10 injections per minute per tmux pane (configurable)
- Bot tokens are stored in your config file — treat config files as sensitive

### Architecture

```
Discord API          Telegram API         Slack API
      │                    │                   │
      └────── pollLoop ───┴───────────────────┘
              (3s interval, per-platform)
                       │
              lookupByMessageId(session registry)
                       │
              injectReplyIntoPane(tmux send-keys)
                       │
              Reply appears in OpenCode session
```

The reply listener runs as a detached Bun process. Daemon state persists to
`~/.omo/openclaw/state/`.
