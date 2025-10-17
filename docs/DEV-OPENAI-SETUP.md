# OpenAI Setup & Network Troubleshooting Guide

**Date:** October 17, 2025  
**Purpose:** Diagnose whether OpenAI API key is loaded and network calls work in Expo Go vs Development Build

---

## Quick Diagnostic

### 1. Enable Debug Mode

Add to `.env.local` (in project root, same folder as `package.json`):

```bash
EXPO_PUBLIC_DEBUG_CORTEX=true
EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-... # Your actual OpenAI key
EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL=true
EXPO_PUBLIC_CORTEX_ENGINE=LLM
```

### 2. Restart Metro with Cache Clear

```bash
npm start -c
```

### 3. Check Metro Logs

Look for these log messages when the app starts:

---

## Branch A: Key Not Loaded (`hasKey: false`)

### Symptom
```
[CORTEX][KEYCHECK] { keyPrefix: undefined, hasKey: false }
```

### Root Causes
1. `.env.local` is not in the project root
2. Variable name is wrong (must be `EXPO_PUBLIC_OPENAI_API_KEY`)
3. Quotes around the value (don't use quotes)
4. Metro cache not cleared after adding env var

### Fix

1. **Verify file location:**
   ```bash
   ls -la .env.local
   # Should be in same folder as package.json
   ```

2. **Verify file content:**
   ```bash
   cat .env.local | grep OPENAI
   # Should output: EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-...
   # NO quotes, NO spaces around =
   ```

3. **Restart Metro with cache clear:**
   ```bash
   npm start -c
   # Or: npx expo start -c
   ```

4. **Re-check logs:**
   ```
   [CORTEX][KEYCHECK] { keyPrefix: 'sk-proj', hasKey: true }
   ```

---

## Branch B: Key Loaded But Network Fails

### Symptom A: Network Error
```
[CORTEX][KEYCHECK] { keyPrefix: 'sk-proj', hasKey: true }
[CORTEX][KEYTEST] network error TypeError: Network request failed
```

**Likely Cause:** Expo Go network restrictions or corporate firewall

### Symptom B: Auth Error
```
[CORTEX][KEYCHECK] { keyPrefix: 'sk-proj', hasKey: true }
[CORTEX][KEYTEST] { ok: false, status: 401, sample: undefined, platform: 'ios' }
```

**Likely Cause:** Invalid or expired API key

---

## Solution: Development Build (Recommended for Production)

Expo Go has limitations with network requests and native modules. For production apps with API keys, use a **Development Build**.

### Step 1: Prebuild Native Projects
```bash
npx expo prebuild
```

This generates `/ios` and `/android` folders with native code.

### Step 2: Build and Run on Device/Simulator

**iOS:**
```bash
# Simulator
npx expo run:ios

# Physical device
npx expo run:ios --device
```

**Android:**
```bash
# Emulator
npx expo run:android

# Physical device (USB connected)
npx expo run:android --device
```

### Step 3: Verify Network Success

After the app launches, check Metro logs:

```
[CORTEX][KEYCHECK] { keyPrefix: 'sk-proj', hasKey: true }
[CORTEX][KEYTEST] { ok: true, status: 200, sample: 'gpt-4o-mini', platform: 'ios' }
```

✅ **Success!** OpenAI API calls now work.

---

## Alternative: Server-Side Proxy (Production Best Practice)

### Why?

Shipping API keys to the client is a security risk:
- Keys can be extracted from the app bundle
- Rate limits affect all users
- No audit trail per user

### Recommended Architecture

```
Mobile App → Supabase Edge Function → OpenAI API
            (authenticated)          (server key)
```

### Implementation Steps

1. **Create Supabase Edge Function:**

   ```bash
   # supabase/functions/classify-catchall/index.ts
   import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
   
   serve(async (req) => {
     const { text, userId } = await req.json()
     
     // Verify user is authenticated
     const authHeader = req.headers.get('Authorization')
     // ... verify JWT token
     
     // Call OpenAI with server key
     const res = await fetch('https://api.openai.com/v1/chat/completions', {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({
         model: 'gpt-4o-mini',
         messages: [{ role: 'user', content: text }],
       }),
     })
     
     const data = await res.json()
     return new Response(JSON.stringify(data), {
       headers: { 'Content-Type': 'application/json' },
     })
   })
   ```

2. **Update App to Call Edge Function:**

   ```typescript
   // cortex/proxyEngine.ts
   export class ProxyEngine implements ICortexEngine {
     async classify({ text }: CortexInput): Promise<CortexOutput> {
       const res = await fetch('https://your-project.supabase.co/functions/v1/classify-catchall', {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${supabase.auth.session()?.access_token}`,
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({ text }),
       })
       
       const data = await res.json()
       return normaliseToCortexOutput(data)
     }
   }
   ```

3. **Benefits:**
   - ✅ API key never leaves the server
   - ✅ Per-user rate limiting and logging
   - ✅ Works in Expo Go (no native build required)
   - ✅ Can add caching, validation, abuse prevention

---

## Troubleshooting Matrix

| Symptom | hasKey | status | platform | Solution |
|---------|--------|--------|----------|----------|
| Key undefined | `false` | N/A | any | Fix `.env.local` format |
| Network error | `true` | N/A | `ios`/`android` | Use dev build or proxy |
| 401 Unauthorized | `true` | `401` | any | Check API key validity |
| 403 Forbidden | `true` | `403` | any | Check API key permissions |
| 200 OK | `true` | `200` | any | ✅ Working! |

---

## Quick Commands Reference

```bash
# Check env file exists
ls -la .env.local

# View env vars (be careful with sensitive data)
cat .env.local | grep EXPO_PUBLIC

# Clear Metro cache and restart
npm start -c

# Build development app (iOS)
npx expo prebuild
npx expo run:ios

# Build development app (Android)
npx expo prebuild
npx expo run:android

# Type check (should be zero errors)
npm run typecheck

# Run tests
npm test
```

---

## Expected Log Sequence (Success)

```
Starting Metro Bundler
...
[Supabase Client] Initializing...
[createCortexEngine] choose: { engineFlag: 'LLM', classifyFlag: 'true', hasKey: true, ... }
[createCortexEngine] using OpenAI engine with rate limiter
[CORTEX][KEYCHECK] { keyPrefix: 'sk-proj', hasKey: true }
[CORTEX][KEYTEST] { ok: true, status: 200, sample: 'gpt-4o-mini', platform: 'ios' }
```

✅ **All systems operational!**

---

## FAQ

**Q: Can I use Expo Go for development?**  
A: Yes, but network requests to external APIs may be limited. For full functionality, use a development build.

**Q: Is it safe to put my API key in .env.local?**  
A: `.env.local` is gitignored, so it won't be committed. However, the key will be bundled into the app. For production, use a server-side proxy.

**Q: How do I rotate my API key?**  
A: Update `.env.local` with the new key and restart Metro (`npm start -c`).

**Q: Why does the test show status 200 but classification still fails?**  
A: The `/v1/models` endpoint tests basic connectivity. Check the actual classification logs (`[CORTEX][LLM]`) for specific errors.

**Q: Can I use a different LLM provider?**  
A: Yes! Implement a new engine (e.g., `AnthropicEngine`, `GeminiEngine`) that follows the `ICortexEngine` interface.

---

**Last Updated:** October 17, 2025  
**Related Files:**
- `App.tsx` - Diagnostic logs
- `cortex/openAiEngine.ts` - Key enforcement
- `cortex/createEngine.ts` - Engine selection
- `.env.example` - Template env file
