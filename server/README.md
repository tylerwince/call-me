# CallMe Server

MCP server that lets Claude call you on the phone. Runs as a stdio-based MCP server with automatic ngrok tunneling for phone provider webhooks.

## Setup

```bash
cd server
bun install
```

## Environment Variables

All environment variables are prefixed with `CALLME_`.

### Required

| Variable | Description |
|----------|-------------|
| `CALLME_PHONE_ACCOUNT_SID` | Telnyx Connection ID or Twilio Account SID |
| `CALLME_PHONE_AUTH_TOKEN` | Telnyx API Key or Twilio Auth Token |
| `CALLME_PHONE_NUMBER` | Your Telnyx/Twilio phone number (E.164 format) |
| `CALLME_USER_PHONE_NUMBER` | Your personal phone number to receive calls |
| `CALLME_OPENAI_API_KEY` | OpenAI API key (for STT and optionally TTS) |
| `CALLME_NGROK_AUTHTOKEN` | ngrok auth token for webhook tunneling |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `CALLME_PHONE_PROVIDER` | `telnyx` | Phone provider: `telnyx` or `twilio` |
| `CALLME_TTS_PROVIDER` | `openai` | TTS provider: `openai` or `chatterbox` |
| `CALLME_STT_MODEL` | `gpt-4o-mini-transcribe` | STT model: `gpt-4o-mini-transcribe` or `whisper-1` |
| `CALLME_TTS_VOICE` | `onyx` | OpenAI voice: alloy, echo, fable, onyx, nova, shimmer |
| `CALLME_CHATTERBOX_URL` | `http://localhost:5100` | Chatterbox server URL (if using chatterbox) |
| `CALLME_PORT` | `3333` | Local HTTP server port |
| `CALLME_NGROK_DOMAIN` | - | Custom ngrok domain (paid feature) |

## Providers

### Phone Providers

| Provider | Cost | Notes |
|----------|------|-------|
| **Telnyx** (default) | ~$0.007/min | 50% cheaper than Twilio |
| Twilio | ~$0.014/min | Industry standard |

### STT Providers

| Model | Cost | Notes |
|-------|------|-------|
| **gpt-4o-mini-transcribe** (default) | $0.003/min | Faster, cheaper |
| whisper-1 | $0.006/min | Original Whisper |

### TTS Providers

| Provider | Cost | Notes |
|----------|------|-------|
| **OpenAI** (default) | ~$15/1M chars | Cloud-based |
| Chatterbox | Free | Self-hosted, requires Docker |

## Running

The server is designed to be run as an MCP server via Claude Code or another MCP client:

```bash
bun run start
```

Or for development with auto-reload:

```bash
bun run dev
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CallMe MCP Server (stdio)                                  │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ MCP Tools   │    │ CallManager │    │  Providers  │     │
│  │ • initiate  │───▶│ • speak     │───▶│ • Phone     │     │
│  │ • continue  │    │ • listen    │    │ • TTS       │     │
│  │ • end_call  │    │ • transcribe│    │ • STT       │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                            │                                │
│                            ▼                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ HTTP Server (webhooks) ◄── ngrok tunnel             │   │
│  │ • /twiml (phone webhooks)                           │   │
│  │ • /media-stream (WebSocket for audio)               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `initiate_call` | Start a phone call with your message |
| `continue_call` | Send a follow-up message on active call |
| `end_call` | End the call with a closing message |

## License

MIT
