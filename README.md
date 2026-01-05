# CallMe

**Claude Code Plugin** - Claude calls you on the phone when it needs your input or wants to report progress.

## Quick Start

### 1. Get Required Accounts

You'll need:
- **Phone provider**: [Telnyx](https://telnyx.com) (r~$0.007/min)
- **OpenAI API key**: For speech-to-text and text-to-speech
- **ngrok account**: Free at [ngrok.com](https://ngrok.com) (for webhook tunneling)

### 2. Set Up Phone Provider

**Telnyx:**
1. Create account at [portal.telnyx.com](https://portal.telnyx.com)
2. Buy a phone number (~$1/month)
3. Create a "Call Control" application
4. Note your Connection ID and API Key

### 3. Set Environment Variables

```bash
# Phone provider
export CALLME_PHONE_ACCOUNT_SID=your_connection_id
export CALLME_PHONE_AUTH_TOKEN=your_api_key
export CALLME_PHONE_NUMBER=+1234567890  # Your Telnyx/Twilio number

# Your phone number (where to call you)
export CALLME_USER_PHONE_NUMBER=+1234567890

# Speech services
export CALLME_OPENAI_API_KEY=sk-xxx

# ngrok (get free token at ngrok.com)
export CALLME_NGROK_AUTHTOKEN=xxx
```

### 4. Install Plugin

```bash
/plugin marketplace add ZeframLou/call-me
/plugin install callme@callme
```

Restart Claude Code. Done!

## How It Works

```
Claude Code                    CallMe MCP Server (local)
    │                                    │
    │  "I finished the feature..."       │
    ▼                                    ▼
Plugin ────stdio──────────────────► MCP Server
                                         │
                                         ├─► ngrok tunnel
                                         │
                                         ▼
                                   Phone Provider (Telnyx)
                                         │
                                         ▼
                                   Your Phone rings
                                   You speak
                                   Text returns to Claude
```

The MCP server runs locally on your machine and automatically starts an ngrok tunnel for phone provider webhooks.

## Tools

### `initiate_call`
Start a phone call.

```typescript
const { callId, response } = await initiate_call({
  message: "Hey! I finished the auth system. What should I work on next?"
});
```

### `continue_call`
Continue with follow-up questions.

```typescript
const response = await continue_call({
  call_id: callId,
  message: "Got it. Should I add rate limiting too?"
});
```

### `end_call`
End the call.

```typescript
await end_call({
  call_id: callId,
  message: "Perfect, I'll get started. Talk soon!"
});
```

## When Claude Calls You

- **Task completed** - Status report, asking what's next
- **Decision needed** - Architecture, technology choices
- **Blocked** - Needs clarification to continue

Claude won't call for simple yes/no questions.

## Costs

Running your own CallMe server costs:
- **Phone calls**: ~$0.007/min (Telnyx) or ~$0.014/min (Twilio)
- **Speech-to-text**: ~$0.006/min (OpenAI Whisper)
- **Text-to-speech**: ~$0.02/min (OpenAI TTS)
- **Phone number**: ~$1/month

**Total**: ~$0.03-0.04/minute of conversation

## Configuration

All configuration is via environment variables. See [.env.example](.env.example) for the full list.

**Important:** I've found that putting the env vars in `~/.claude/settings.json` (or the corresponding Claude Code config file for your plugin install scope) consistently works vs trying to export them to your shell directly. See [Claude docs](https://code.claude.com/docs/en/settings) for example configs.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CALLME_PHONE_ACCOUNT_SID` | Yes | - | Provider account/connection ID |
| `CALLME_PHONE_AUTH_TOKEN` | Yes | - | Provider auth token |
| `CALLME_PHONE_NUMBER` | Yes | - | Outbound caller ID |
| `CALLME_USER_PHONE_NUMBER` | Yes | - | Your personal phone |
| `CALLME_OPENAI_API_KEY` | Yes | - | For STT and TTS |
| `CALLME_NGROK_AUTHTOKEN` | Yes | - | ngrok auth token |
| `CALLME_PORT` | No | `3333` | Local HTTP port |

## Troubleshooting

### Claude doesn't use the tool
1. Check all required environment variables are set (ideally in `~/.claude/settings.json`)
2. Restart Claude Code after installing the plugin
3. Try explicitly: "Call me to discuss the next steps"

### Call doesn't connect
1. Check the MCP server logs (stderr) for errors
2. Verify your phone provider credentials are correct
3. Make sure ngrok is able to create a tunnel

### ngrok errors
1. Verify your `CALLME_NGROK_AUTHTOKEN` is correct
2. Check if you've hit ngrok's free tier limits
3. Try a different port with `CALLME_PORT=3334`

## Development

```bash
cd server
bun install
bun run dev
```

## License

MIT
