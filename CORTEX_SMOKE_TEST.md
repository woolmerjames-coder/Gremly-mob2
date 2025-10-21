# Cortex Smoke Test (Local)

## Steps
1. Ensure `.env` has EXPO_PUBLIC_CORTEX_URL set to your Supabase function URL, and EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL=off.
2. Run `npm run start` and open the app.
3. Open the Unified Overlay (AI freeform mode), type a short note, submit.
4. Confirm: an AI response shows in device logs and the item saves normally (no crashes).

## Troubleshooting
- If no response, verify the function URL is correct.
- If 401/403, re-run `npx supabase login` and `npx supabase functions list`.
- If timeouts, set `EXPO_PUBLIC_CORTEX_TIMEOUT_MS=12000` in `.env`.
