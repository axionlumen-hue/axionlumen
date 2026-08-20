# Quick Start Guide 🚀

## Installation (3 steps)

```bash
# 1. Install dependencies
npm install

# 2. Create .env file with your credentials
cp .env .env.local
# Edit with your: BOT_TOKEN, LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET

# 3. Start server
npm start
```

Server runs on: http://localhost:3000

---

## Environment Variables

```env
# Required
BOT_TOKEN=xxxxxxxxxxxx:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WEBAPP_URL=https://yourdomain.com
LIVEKIT_URL=wss://livekit.yourdomain.com
LIVEKIT_API_KEY=xxxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxx

# Optional
PORT=3000
STARS_PRICE=500
LIVEKIT_ROOM=exclusive-community-live
CHANNEL_ID=your_channel_id
```

---

## API Endpoints Summary

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | - | Health check |
| GET | `/api/status` | ✅ | User status & config |
| POST | `/api/create-invoice` | ✅ | Create payment invoice |
| POST | `/api/livekit-token` | ✅ | Get stream viewer token |
| POST | `/api/request-mute` | ✅ | Submit mute request |

Auth Header: `X-Telegram-Init-Data: <value>`

---

## Frontend Structure

```
public/
├── index.html          # HTML template
├── styles.css          # Responsive CSS (Telegram theme)
└── app.js              # Complete app logic
```

**No build step needed** - Works directly in browser

---

## Backend Structure

```
server.js              # Express + Telegram Bot
database.js            # SQLite abstraction
package.json           # Dependencies
.env                   # Configuration
```

---

## Database Tables

**users** - User profiles
- telegram_id (primary key)
- username, first_name
- access_until (VIP expiration)
- created_at, updated_at

**payments** - Transaction log
- charge_id (primary key) - Deduplication
- telegram_id, stars, payload, paid_at

**mute_requests** - Mute system
- id (primary key)
- telegram_id, status, created_at

---

## Key Functions

### Frontend (app.js)
- `subscribe()` - Payment flow
- `connectToLiveKit()` - Stream viewer
- `fetchStatus()` - Get user access
- `requestMute()` - Mute submission
- `updateUI()` - Render based on state

### Backend (server.js)
- `validateTelegramInitData()` - Verify signature
- `getAuthenticatedUser()` - Extract user
- `startTelegramBot()` - Telegram integration

### Database (database.js)
- `saveUser()` - Store/update user
- `grantAccess()` - Grant 30-day VIP
- `savePayment()` - Record transaction
- `createMuteRequest()` - Create request

---

## Telegram Bot Commands

- `/start` - Launch Mini App
- `/menu` - Show main menu
- `/status` - Check access status
- `/mute` - Request mute

---

## File Sizes

- app.js: 588 lines (1.2 MB uncompressed)
- server.js: 456 lines (8.2 KB)
- database.js: 249 lines (5.1 KB)
- styles.css: 532 lines (12 KB)
- index.html: 21 lines (0.8 KB)

**Total**: ~1,846 lines of code

---

## Dependencies

```json
{
  "express": "^4.18.2",           // Web server
  "cors": "^2.8.5",               // CORS middleware
  "dotenv": "^16.3.1",            // Config loading
  "node-telegram-bot-api": "^0.64.0",  // Telegram bot
  "livekit-server-sdk": "^0.4.1", // LiveKit tokens
  "sqlite3": "^5.1.6"             // Database
}
```

---

## Deployment

### Heroku
```bash
heroku create
heroku config:set BOT_TOKEN=xxx LIVEKIT_URL=xxx ...
git push heroku main
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["npm", "start"]
```

### Railway / DigitalOcean
- Set environment variables
- Deploy git repo
- Run: `npm start`

---

## Security Checklist

✅ Credentials in .env (git-ignored)
✅ No secrets sent to frontend
✅ Cryptographic Telegram auth
✅ HMAC-SHA256 signature validation
✅ Payment idempotency (charge_id)
✅ Access expiration checking
✅ LiveKit token restrictions
✅ Environment validation at startup

---

## Development Tips

**No build step** - Edit and reload
**Fast startup** - ~3 seconds
**Small codebase** - Easy to debug
**Single server** - Less complexity
**Direct database** - SQLite file

---

## Troubleshooting

### Port already in use
```bash
# Use different port
PORT=5000 npm start
```

### Database locked
```bash
# Remove old connections
rm viewers.sqlite-wal
rm viewers.sqlite-shm
npm start
```

### Missing environment variable
✅ Server validates all required vars
✅ Shows clear error message
✅ Lists what's missing

### Payment not working
1. Check BOT_TOKEN is valid
2. Verify STARS_PRICE matches invoice
3. Ensure auth is working (/api/status)

### LiveKit not working
1. Verify LIVEKIT_URL is accessible
2. Check LIVEKIT_API_KEY/SECRET are correct
3. Ensure LIVEKIT_ROOM exists

---

## Status Checking

```bash
# Health check
curl http://localhost:3000/health

# API status (requires auth header)
curl http://localhost:3000/api/status \
  -H "X-Telegram-Init-Data: <your-init-data>"
```

---

## Monitoring

Check server logs for:
- ✅ "Environment validation passed"
- ✅ "Connected to SQLite database"
- ✅ "Database tables initialized"
- ✅ "Telegram bot started"
- ✅ "Server listening on port 3000"

---

## Files to Know

| File | Purpose | Lines |
|------|---------|-------|
| server.js | Main API server | 456 |
| database.js | Data access layer | 249 |
| public/app.js | Frontend app | 588 |
| public/styles.css | UI styling | 532 |
| public/index.html | HTML template | 21 |
| package.json | Dependencies | 30 |
| .env | Configuration | 20 |
| README.md | Full docs | 400+ |

---

## Support Resources

📖 **README.md** - Full documentation
📋 **RESTRUCTURING_COMPLETE.md** - Architecture details
✅ **IMPLEMENTATION_SUMMARY.md** - Verification report
📝 **FILES_CREATED.md** - Inventory of changes

---

**Status**: ✅ Production Ready
**Language**: Vanilla JavaScript (ES2015+)
**Framework**: Express.js 4.18
**Database**: SQLite 3
**Hosting**: Any Node.js server
**Time to Deploy**: < 10 minutes
