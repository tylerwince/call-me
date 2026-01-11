# TextMe

**Minimal plugin that lets Claude Code text you via iMessage, Telegram, or Slack.**

Start a task, walk away. Get a text when Claude is done, stuck, or needs a decision.

- **Minimal plugin** - Does one thing: text you. No crazy setups.
- **Multi-turn conversations** - Message back and forth naturally.
- **Three providers** - iMessage (macOS), Telegram, or Slack.
- **Tool-use composable** - Claude can do other tasks while waiting for your reply.

---

## Quick Start

### 1. Choose Your Provider

Pick **one** of the following:

| Provider | Platform | Requirements |
|----------|----------|--------------|
| **iMessage** | macOS only | `imsg` CLI installed |
| **Telegram** | Any | Telegram bot token |
| **Slack** | Any | Slack app with Socket Mode |

### 2. Set Up Your Provider

<details>
<summary><b>Option A: iMessage (macOS only)</b></summary>

iMessage is the simplest option if you're on macOS.

**Requirements:**
- macOS with Messages app configured
- `imsg` CLI tool installed ([installation instructions](https://github.com/CharlieWhile13/imsg))

**Environment variables:**
```bash
TEXTME_PROVIDER=imessage
TEXTME_IMESSAGE_RECIPIENT=+15551234567  # Phone number or email
```

That's it! No API keys or accounts needed.

</details>

<details>
<summary><b>Option B: Telegram</b></summary>

Telegram works on any platform and is free.

**Setup:**
1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` and follow the prompts to create a bot
3. Copy the **bot token** (looks like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)
4. Message your new bot to start a chat
5. Get your **chat ID** by messaging [@userinfobot](https://t.me/userinfobot)

**Environment variables:**
```bash
TEXTME_PROVIDER=telegram
TEXTME_TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TEXTME_TELEGRAM_CHAT_ID=123456789
```

</details>

<details>
<summary><b>Option C: Slack</b></summary>

Slack is great for team environments.

**Setup:**
1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Enable **Socket Mode** under Settings > Socket Mode
3. Create an **App-Level Token** with `connections:write` scope (starts with `xapp-`)
4. Under OAuth & Permissions, add these **Bot Token Scopes**:
   - `chat:write` - Send messages
   - `channels:history` - Read channel messages (for public channels)
   - `groups:history` - Read messages (for private channels)
   - `im:history` - Read DMs
5. Install the app to your workspace
6. Copy the **Bot User OAuth Token** (starts with `xoxb-`)
7. Get your **Channel ID**: Right-click the channel > View channel details > scroll to bottom
8. Invite the bot to the channel: `/invite @YourBotName`

**Environment variables:**
```bash
TEXTME_PROVIDER=slack
TEXTME_SLACK_BOT_TOKEN=xoxb-your-bot-token
TEXTME_SLACK_APP_TOKEN=xapp-your-app-token
TEXTME_SLACK_CHANNEL=C01234567
```

</details>

### 3. Set Environment Variables

Add these to `~/.claude/settings.json`:

```json
{
  "env": {
    "TEXTME_PROVIDER": "imessage",
    "TEXTME_IMESSAGE_RECIPIENT": "+15551234567"
  }
}
```

Or for Telegram:
```json
{
  "env": {
    "TEXTME_PROVIDER": "telegram",
    "TEXTME_TELEGRAM_BOT_TOKEN": "123456:ABC-DEF...",
    "TEXTME_TELEGRAM_CHAT_ID": "123456789"
  }
}
```

Or for Slack:
```json
{
  "env": {
    "TEXTME_PROVIDER": "slack",
    "TEXTME_SLACK_BOT_TOKEN": "xoxb-...",
    "TEXTME_SLACK_APP_TOKEN": "xapp-...",
    "TEXTME_SLACK_CHANNEL": "C01234567"
  }
}
```

### 4. Install Plugin

```bash
/install-github-plugin tylerwince/call-me
```

Restart Claude Code. Done!

---

## Configuration Reference

### Required Variables

| Variable | Description |
|----------|-------------|
| `TEXTME_PROVIDER` | `imessage`, `telegram`, or `slack` |

### Provider-Specific Variables

**iMessage:**
| Variable | Description |
|----------|-------------|
| `TEXTME_IMESSAGE_RECIPIENT` | Phone number or email to message |

**Telegram:**
| Variable | Description |
|----------|-------------|
| `TEXTME_TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TEXTME_TELEGRAM_CHAT_ID` | Your chat ID |

**Slack:**
| Variable | Description |
|----------|-------------|
| `TEXTME_SLACK_BOT_TOKEN` | Bot User OAuth Token (xoxb-...) |
| `TEXTME_SLACK_APP_TOKEN` | App-Level Token (xapp-...) |
| `TEXTME_SLACK_CHANNEL` | Channel ID to send messages to |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEXTME_MESSAGE_TIMEOUT_MS` | `300000` | Timeout waiting for reply (5 minutes) |

---

## How It Works

```
Claude Code                    TextMe MCP Server
    │                                │
    │  "I finished the feature..."   │
    ▼                                ▼
Plugin ────stdio────────────► MCP Server
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
                 iMessage        Telegram          Slack
                 (imsg CLI)      (Bot API)        (Socket Mode)
                    │                │                │
                    ▼                ▼                ▼
              Your iPhone      Your Phone       Your Slack
              gets a text      gets a msg       gets a msg
```

---

## Tools

### `send_message`
Send a message and optionally wait for a reply.

```typescript
// Send and wait for reply (default)
const result = await send_message({
  message: "Hey! I finished the auth system. What should I work on next?"
});
// result.reply contains the user's response

// Send without waiting
await send_message({
  message: "Starting deployment now. I'll update you when done.",
  wait_for_reply: false
});
```

### `wait_for_reply`
Wait for the user to send a message.

```typescript
const reply = await wait_for_reply({
  timeout_seconds: 300  // 5 minutes
});
```

### `get_history`
Get recent conversation history.

```typescript
const history = await get_history({
  limit: 10
});
// Returns array of { speaker: 'claude' | 'user', message: string }
```

---

## Example Conversation

```
Claude: send_message("Hey! I finished refactoring the API. Should I add tests next or move to the frontend?")

User (via iMessage): "Add tests first, then frontend"

Claude: send_message("Got it! Should I use Jest or Vitest for the tests?")

User: "Vitest"

Claude: send_message("Perfect, I'll set up Vitest and write tests for the API endpoints.", wait_for_reply=false)

[Claude writes tests...]

Claude: send_message("Tests are done! 47 tests passing. Moving to frontend now.")
```

---

## Troubleshooting

### Claude doesn't use the tool
1. Check environment variables are set in `~/.claude/settings.json`
2. Restart Claude Code after installing the plugin
3. Try explicitly: "Text me when you're done with the task"

### iMessage not working
1. Verify `imsg` CLI is installed: `imsg --help`
2. Make sure Messages app is configured on your Mac
3. Check that the recipient phone/email is valid

### Telegram not working
1. Make sure you've started a chat with your bot first
2. Verify the chat ID is correct (use @userinfobot)
3. Check the bot token is valid

### Slack not working
1. Verify Socket Mode is enabled for the app
2. Make sure the bot is invited to the channel
3. Check that all required scopes are added
4. Verify both tokens (xoxb and xapp) are correct

---

## Development

```bash
cd server
bun install
bun run dev
```

---

## License

MIT
