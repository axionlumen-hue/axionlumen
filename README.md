# Telegram Live Viewer

A clean, modern Telegram Mini App for exclusive VIP live broadcast viewing with Telegram Stars membership payment.

## Overview

This is a lightweight, production-ready Telegram Mini App that provides:
- **Telegram Authentication** - Secure WebApp validation
- **Telegram Stars VIP Membership** - In-app subscription payment
- **LiveKit Streaming** - Subscribe-only viewer for exclusive broadcasts
- **Responsive Design** - Works on phones, tablets, and desktop
- **No Page Scrolling** - Fits perfectly in the Telegram WebView

## Architecture

```
Telegram User → Telegram Bot → Mini App
                                ├── Authentication (Telegram WebApp)
                                ├── Payment (Telegram Stars)
                                ├── Database (SQLite)
                                └── LiveKit (Subscribe-only viewer)
```

## Project Structure

```
telegram-live-viewer/
├── public/
│   ├── index.html          # HTML template
│   ├── styles.css          # Responsive CSS
│   └── app.js              # Vanilla JavaScript frontend
├── server.js               # Express backend + Telegram bot
├── database.js             # SQLite database layer
├── package.json
├── .env                    # Environment configuration
├── .gitignore
└── README.md
```

## Installation

### Prerequisites
- Node.js 14+ 
- npm or yarn
- Telegram Bot Token
- LiveKit server credentials
- (Optional) Telegram Channel ID for private invites

### Setup Steps

1. **Clone/download the project:**
   ```bash
   cd telegram-live-viewer
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env .env.local
   # Edit .env.local with your credentials
   ```

4. **Required environment variables:**
   ```
   BOT_TOKEN=your_telegram_bot_token
   WEBAPP_URL=https://yourdomain.com
   LIVEKIT_URL=https://your-livekit-server.com
   LIVEKIT_API_KEY=your_api_key
   LIVEKIT_API_SECRET=your_api_secret
   LIVEKIT_ROOM=exclusive-community-live
   PORT=3000
   STARS_PRICE=500
   ```

5. **Optional:**
   ```
   CHANNEL_ID=your_telegram_channel_id
   ```

## Running the Application

### Start the server:
```bash
npm start
```

The server will:
- Start Express on http://localhost:3000
- Initialize SQLite database
- Start Telegram bot polling
- Serve static frontend files

### Development:
```bash
npm run dev
```

## How It Works

### 1. Authentication Flow
- User opens Telegram Mini App
- Frontend sends `X-Telegram-Init-Data` header (from `window.Telegram.WebApp.initData`)
- Server validates cryptographic signature with `BOT_TOKEN`
- User data is extracted and stored in database

### 2. Payment Flow (Telegram Stars)
1. User clicks Subscribe button
2. Frontend calls `POST /api/create-invoice`
3. Server creates Telegram Stars invoice via Bot API
4. Frontend opens invoice in Telegram
5. User completes payment in Telegram
6. Telegram bot receives `successful_payment` update
7. Server grants VIP access (30 days)
8. Frontend detects access and enables viewing

### 3. LiveKit Streaming
- Only authenticated VIP users can request access token
- Frontend calls `POST /api/livekit-token`
- Server generates subscribe-only token
- Token prevents: publishing audio/video, publishing data
- Token allows: subscribing to broadcast stream
- Frontend connects via LiveKit JavaScript SDK
- Video stream displays in browser

### 4. Mute Requests
- VIP users can request temporary mute via `/mute` command or `POST /api/request-mute`
- Mute requests are stored in database
- Broadcaster can monitor pending requests

## API Endpoints

### Authentication
All authenticated endpoints require header: `X-Telegram-Init-Data: <initData>`

### `GET /health`
Health check.
```
Response: { status: "ok" }
```

### `GET /api/status`
Get current viewer status and configuration.
```
Response: {
  authenticated: boolean,
  access: boolean,
  accessUntil: number (Unix timestamp),
  user: { id, username, firstName },
  live: { title, creator, room },
  starsPrice: number
}
```

### `POST /api/create-invoice`
Create Telegram Stars invoice for VIP membership.
```
Response: {
  alreadyPaid: boolean,
  invoiceLink?: string,
  stars?: number
}
```

### `POST /api/livekit-token`
Get LiveKit access token (VIP only).
```
Response: {
  serverUrl: string,
  token: string,
  room: string
}
```

### `POST /api/request-mute`
Submit mute request (VIP only).
```
Response: { success: boolean }
```

## Telegram Bot Commands

- `/start` - Open VIP viewer
- `/menu` - Show viewer menu
- `/status` - Check VIP access status
- `/mute` - Request temporary mute

## Database Schema

### users table
```sql
telegram_id (PRIMARY KEY)
username
first_name
access_until (Unix timestamp)
created_at
updated_at
```

### payments table
```sql
charge_id (PRIMARY KEY)
telegram_id
stars
payload
paid_at
```

### mute_requests table
```sql
id (PRIMARY KEY)
telegram_id
status
created_at
```

## Security

### Secret Management
- All secrets stored in `.env` (not version controlled)
- Server never exposes: `BOT_TOKEN`, `LIVEKIT_API_SECRET`
- Frontend never receives server secrets

### Telegram Authentication
- Cryptographic signature validation with `BOT_TOKEN`
- Prevents spoofed user data
- Auth data must be less than 24 hours old

### Payment Validation
- Payment payload must contain user Telegram ID
- Currency must be `XTR` (Telegram Stars)
- Amount must equal `STARS_PRICE`
- Payments are idempotent (charge_id prevents duplicates)

### LiveKit Access
- Tokens are subscribe-only (no publish)
- 2-hour TTL per token
- Only authenticated VIP users receive tokens

## Telegram Mini App Setup

### 1. Create Telegram Bot
```
Talk to @BotFather on Telegram
/newbot
Name: "Telegram Live Viewer"
Username: "live_viewer_bot"
```

### 2. Configure Mini App
```
/mybots
Select your bot
Web App
App URL: https://yourdomain.com
```

### 3. Set Webhook (optional, for production)
```bash
curl -X POST https://api.telegram.org/bot<BOT_TOKEN>/setWebhook \
  -d url=https://yourdomain.com/webhook
```

## LiveKit Setup

1. Deploy LiveKit server (or use managed service)
2. Create room `exclusive-community-live` (or configure name in `.env`)
3. Get API credentials
4. Set environment variables

## Deployment

### Requirements
- Node.js 14+ runtime
- Persistent storage (SQLite)
- HTTPS for Telegram Mini App

### Heroku Example
```bash
heroku create telegram-live
heroku config:set BOT_TOKEN=xxx WEBAPP_URL=xxx ...
git push heroku main
```

### Docker Example
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## Testing

### Check server health:
```bash
curl http://localhost:3000/health
```

### Test API status (requires valid Telegram auth):
```bash
curl -H "X-Telegram-Init-Data: <initData>" \
  http://localhost:3000/api/status
```

### Open Mini App
- In Telegram, start the bot: `/start`
- Click "Open VIP Viewer"
- Should load http://localhost:3000

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BOT_TOKEN` | ✅ | - | Telegram Bot API token |
| `WEBAPP_URL` | ✅ | - | URL where Mini App is hosted |
| `LIVEKIT_URL` | ✅ | - | LiveKit server URL |
| `LIVEKIT_API_KEY` | ✅ | - | LiveKit API key |
| `LIVEKIT_API_SECRET` | ✅ | - | LiveKit API secret |
| `LIVEKIT_ROOM` | ❌ | `exclusive-community-live` | LiveKit room name |
| `PORT` | ❌ | `3000` | Server port |
| `STARS_PRICE` | ❌ | `500` | VIP membership price (Telegram Stars) |
| `CHANNEL_ID` | ❌ | - | Optional Telegram channel for invites |

## Features Implemented

- ✅ Telegram WebApp authentication
- ✅ Telegram Stars payment (XTR currency)
- ✅ VIP access grants (30 days)
- ✅ LiveKit subscribe-only viewer
- ✅ Playback controls (play, stop, volume, mute)
- ✅ Mute request system
- ✅ Responsive mobile design
- ✅ No page scrolling viewport
- ✅ Telegram bot integration
- ✅ Private channel invite (optional)
- ✅ Payment idempotency
- ✅ Secure signature validation
- ✅ Error handling and logging

## Troubleshooting

### Bot doesn't respond to commands
- Verify `BOT_TOKEN` is correct
- Check bot polling (check server logs)
- Ensure bot can access Telegram API

### Payment not working
- Verify `STARS_PRICE` matches invoice amount
- Check `BOT_TOKEN` is valid
- Ensure Telegram Bot API can create invoices

### LiveKit connection fails
- Verify credentials in `.env`
- Check LiveKit server is running
- Ensure room exists in LiveKit
- Verify user has VIP access

### Mini App doesn't load
- Verify `WEBAPP_URL` is HTTPS
- Check `BOT_TOKEN` is correct
- Ensure frontend files in `public/` are accessible

## License

MIT

## Support

For issues or questions, please refer to the documentation above or check server logs for detailed error messages.
