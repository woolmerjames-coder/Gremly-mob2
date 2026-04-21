# Gremly Calendar Worker

Cloudflare Worker for calendar integration (OAuth + API calls).

## Setup

### 1. Install dependencies

```bash
cd gremly-calendar-worker
npm install
```

### 2. Set secrets

```bash
# Your Azure client secret (the V0A8Q~... value you saved)
wrangler secret put AZURE_CLIENT_SECRET

# Your Supabase URL (e.g., https://xxxxx.supabase.co)
wrangler secret put SUPABASE_URL

# Your Supabase SERVICE ROLE key (not anon key!)
# Find it in Supabase Dashboard → Settings → API → service_role key
wrangler secret put SUPABASE_SERVICE_KEY
```

### 3. Deploy

```bash
npm run deploy
```

This will output your worker URL, something like:
```
https://gremly-calendar-worker.YOUR_ACCOUNT.workers.dev
```

### 4. Test the deployment

```bash
curl https://gremly-calendar-worker.YOUR_ACCOUNT.workers.dev/health
```

Should return:
```json
{"status":"ok","timestamp":"2026-01-21T..."}
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth) |
| POST | `/auth/outlook/exchange` | Exchange OAuth code for tokens |
| POST | `/auth/disconnect` | Disconnect a calendar provider |
| GET | `/calendar/events?start=YYYY-MM-DD&end=YYYY-MM-DD` | Fetch events |
| GET | `/calendar/status` | Get connection status |

All endpoints except `/health` require `Authorization: Bearer <supabase_jwt>` header.

## Local Development

```bash
npm run dev
```

This starts a local server at `http://localhost:8787`.

Note: OAuth callbacks won't work locally since Microsoft redirects to `gremly://`.
For local testing, you can manually insert tokens into Supabase and test the
`/calendar/events` endpoint.

## Environment Variables

Set in `wrangler.toml`:
- `AZURE_CLIENT_ID` - Your Azure app client ID
- `AZURE_REDIRECT_URI` - `gremly://auth/callback`

Set via `wrangler secret put`:
- `AZURE_CLIENT_SECRET` - Your Azure app client secret
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key (NOT anon key)
- `SUPABASE_JWT_SECRET` - Supabase JWT secret (Project Settings → API → JWT Secret) — required for HS256 token verification

## Adding Google Calendar (Phase 4)

1. Set up Google Cloud Console OAuth
2. Add secrets:
   ```bash
   wrangler secret put GOOGLE_CLIENT_ID
   wrangler secret put GOOGLE_CLIENT_SECRET
   ```
3. Implement `src/auth/google.ts` and `src/calendar/google.ts`
4. Add routes in `src/index.ts`

## Troubleshooting

### "Unauthorized" errors
- Check that the Supabase JWT is valid and not expired
- Verify `SUPABASE_JWT_SECRET` is set via `wrangler secret put SUPABASE_JWT_SECRET` (Project Settings → API → JWT Secret)
- Verify `SUPABASE_SERVICE_KEY` is set correctly

### "Token exchange failed"
- Verify AZURE_CLIENT_SECRET is correct
- Check that the redirect URI matches exactly
- Ensure the code verifier matches what was used in the auth request

### "Calendar API error: 401"
- Token may have been revoked by user
- Try disconnecting and reconnecting the calendar
