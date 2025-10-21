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

## Latency Tips
- **Use stable Wi-Fi**: Mobile networks can cause variable latency. Connect to a reliable Wi-Fi network for best results.
- **Lower timeout if needed**: Default timeout is 12000ms (12s). You can reduce this in `.env.local` via `EXPO_PUBLIC_CORTEX_TIMEOUT_MS=8000` for faster feedback if your network is stable.
- **Avoid duplicate taps**: While AI is thinking (you'll see "✨ Thinking…"), the Submit button is disabled. Wait for the response to avoid duplicate requests.
