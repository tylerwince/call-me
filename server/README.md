# CallMe Server

MCP server that lets Claude call you on the phone. Uses Telnyx for phone calls, OpenAI for TTS, and OpenAI Realtime API for streaming speech-to-text.

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
| `CALLME_PHONE_ACCOUNT_SID` | Telnyx Connection ID |
| `CALLME_PHONE_AUTH_TOKEN` | Telnyx API Key |
| `CALLME_PHONE_NUMBER` | Your Telnyx phone number (E.164 format) |
| `CALLME_USER_PHONE_NUMBER` | Your personal phone number to receive calls |
| `CALLME_OPENAI_API_KEY` | OpenAI API key (for TTS and realtime STT) |
| `CALLME_NGROK_AUTHTOKEN` | ngrok auth token for webhook tunneling |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `CALLME_TTS_VOICE` | `onyx` | OpenAI voice: alloy, echo, fable, onyx, nova, shimmer |
| `CALLME_PORT` | `3333` | Local HTTP server port |
| `CALLME_NGROK_DOMAIN` | - | Custom ngrok domain (paid feature) |
| `CALLME_TRANSCRIPT_TIMEOUT_MS` | `180000` | Timeout for user speech (3 minutes default) |
| `CALLME_STT_SILENCE_DURATION_MS` | `800` | Silence duration to detect end of speech |

## Providers

| Service | Provider | Notes |
|---------|----------|-------|
| Phone | Telnyx | ~$0.007/min, Call Control API v2 |
| TTS | OpenAI | Streaming TTS with low latency |
| STT | OpenAI Realtime | Real-time streaming transcription with server VAD |

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
│  │ • initiate  │───▶│ • speak     │───▶│ • Telnyx    │     │
│  │ • continue  │    │ • listen    │    │ • OpenAI    │     │
│  │ • end_call  │    │             │    │   TTS/STT   │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                            │                                │
│                            ▼                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ HTTP Server (webhooks) ◄── ngrok tunnel             │   │
│  │ • /twiml (phone webhooks)                           │   │
│  │ • /media-stream (WebSocket for audio)               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ OpenAI Realtime API (WebSocket)                     │   │
│  │ • Streaming transcription with server VAD           │   │
│  │ • Automatic turn detection                          │   │
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
