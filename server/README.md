# Hey Boss Server

The backend server for Hey Boss. Supports two modes:

1. **Self-host mode**: Single user, no payments or database needed
2. **SaaS mode**: Multi-user with Stripe payments and web registration

## Quick Start (Self-Host)

For personal use, just set `SELF_HOST_PHONE`:

```bash
cd server
bun install

export TWILIO_ACCOUNT_SID=ACxxxxx
export TWILIO_AUTH_TOKEN=xxxxx
export TWILIO_PHONE_NUMBER=+1234567890
export OPENAI_API_KEY=sk-xxxxx
export PUBLIC_URL=https://your-server.com
export SELF_HOST_PHONE=+1234567890  # Your phone

bun run dev
```

No Stripe, no database, no user management needed.

## SaaS Mode

For running a paid service with multiple users:

### 1. Setup

```bash
cd server
bun install
cp .env.example .env
```

### 2. Configure

Edit `.env`:

```bash
# Required
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1234567890
OPENAI_API_KEY=sk-xxxxx
PUBLIC_URL=https://api.heyboss.io

# Stripe
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Pricing (16¢/min with 2x markup)
PRICE_MULTIPLIER=2.0
```

### 3. Stripe Webhook

In Stripe Dashboard → Webhooks:
- URL: `https://api.heyboss.io/webhook`
- Events: `checkout.session.completed`

### 4. Run

```bash
bun run dev   # Development
bun run start # Production
```

## User Flow

1. User visits `https://api.heyboss.io`
2. Signs up with email + phone number
3. Gets API key on dashboard
4. Adds credits via Stripe ($5, $10, $25, $50)
5. Uses API key with plugin

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Hey Boss Server                                            │
│                                                             │
│  Web Pages          MCP Server         Twilio               │
│  • /signup          • /mcp             • /twiml             │
│  • /dashboard       • Auth             • /media-stream      │
│  • /login           • Tools                                 │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ SQLite (users, usage) + Stripe (payments)           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Pricing

```bash
# Your costs
TWILIO_COST_PER_MIN=2   # 2¢
WHISPER_COST_PER_MIN=1  # 1¢
TTS_COST_PER_MIN=5      # 5¢

# Your markup
PRICE_MULTIPLIER=2.0    # 2x
```

**Result:** Base 8¢ × 2.0 = **16¢/min** to users

## Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /` | No | Home page |
| `GET /signup` | No | Registration |
| `GET /dashboard` | Session | User dashboard |
| `POST /mcp` | API Key | MCP protocol |
| `POST /webhook` | Stripe | Payment webhook |
| `GET /health` | No | Health check |

## Environment Variables

| Variable | Mode | Description |
|----------|------|-------------|
| `TWILIO_*` | Both | Twilio credentials |
| `OPENAI_API_KEY` | Both | OpenAI key |
| `PUBLIC_URL` | Both | Server URL |
| `SELF_HOST_PHONE` | Self-host | Your phone (enables self-host) |
| `SELF_HOST_API_KEY` | Self-host | Optional custom API key |
| `DATABASE_PATH` | SaaS | SQLite path |
| `STRIPE_SECRET_KEY` | SaaS | Stripe key |
| `STRIPE_WEBHOOK_SECRET` | SaaS | Webhook secret |
| `PRICE_MULTIPLIER` | Both | Pricing markup |

## Deployment

### Docker

```dockerfile
FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production
COPY dist ./dist
EXPOSE 3000
CMD ["bun", "run", "start"]
```

### systemd

```ini
[Unit]
Description=Hey Boss
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/hey-boss/server
ExecStart=/usr/bin/node dist/index.js
EnvironmentFile=/opt/hey-boss/server/.env
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## License

MIT
