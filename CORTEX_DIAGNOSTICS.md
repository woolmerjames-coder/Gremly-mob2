# Cortex Proxy Diagnostics - Dev Only

## Overview
Added minimal, dev-only diagnostics to confirm Cortex proxy calls from the app and surface errors clearly. All diagnostics are gated with `__DEV__` and do not affect production builds.

## Changes Made

### 1. Enhanced CortexClient with Dev Logs
**File**: `lib/cortex/CortexClient.ts`

Added structured logging throughout the request lifecycle:
- `[CORTEX] POST` - Before fetch with URL, type, model, timeout
- `[CORTEX] STATUS` - HTTP response status code
- `[CORTEX] OK` - Success with response ID
- `[CORTEX] PROXY_ERROR` - Server-side proxy errors
- `[CORTEX] EXCEPTION` - Client-side exceptions

All logs are gated with `__DEV__` check and appear in Metro console.

### 2. Created Diagnostic Helper
**File**: `lib/cortex/diag.ts` (new)

Provides `runCortexProxyDiag()` function that:
- Logs start with full cortex configuration
- Makes test "Say hi" completion call (8 tokens max)
- Logs success with response ID and timing
- Logs failure with error message
- Returns `{ ok, data/error }` for UI display

### 3. App Boot Diagnostics
**File**: `App.tsx`

Added dev-only diagnostics in `useEffect`:
1. Logs cortex env configuration on boot
2. Runs automatic proxy diagnostic test
3. All gated with `if (__DEV__)` checks

### 4. Dev-Only Ping Button
**File**: `components/today/TodayMascotHeader.tsx`

Added long-press handler on mascot (dev only):
- Long-press mascot for 250ms triggers Cortex ping
- Shows native toast/alert with result
- Only active in dev builds (`__DEV__` check)
- Does not interfere with normal tap behavior

## Usage

### Viewing Logs
Start Expo and watch Metro console for structured logs:

```bash
npx expo start -c
```

Expected output on boot:
```
[CORTEX] env { url: 'https://...', model: 'gpt-4o-mini', timeoutMs: 12000 }
[CORTEX] DIAG start { url: '...', model: '...', timeoutMs: 12000 }
[CORTEX] POST https://.../cortex-proxy { type: 'complete', model: '...', timeoutMs: 12000 }
[CORTEX] STATUS 200
[CORTEX] OK cmpl-...
[CORTEX] DIAG ok { ms: 1635, id: 'cmpl-...' }
```

### Manual Testing
1. Open Today screen
2. Long-press the mascot (🐸) for 250ms
3. See toast (Android) or alert (iOS) showing:
   - **Success**: "Cortex OK"
   - **Failure**: "Cortex FAIL: [error message]"

## Log Format

### Success Path
```typescript
[CORTEX] POST https://...cortex-proxy { type: 'chat', model: 'gpt-4o-mini', timeoutMs: 12000 }
[CORTEX] STATUS 200
[CORTEX] OK cmpl-abc123  // OpenAI completion ID
```

### Proxy Error Path
```typescript
[CORTEX] POST https://...cortex-proxy { type: 'chat', model: 'gpt-4o-mini', timeoutMs: 12000 }
[CORTEX] STATUS 200
[CORTEX] PROXY_ERROR Rate limit exceeded  // Server-side error
[CORTEX] EXCEPTION [cortex] proxy_error Rate limit exceeded
```

### Network Error Path
```typescript
[CORTEX] POST https://...cortex-proxy { type: 'chat', model: 'gpt-4o-mini', timeoutMs: 12000 }
[CORTEX] EXCEPTION [cortex] network error
```

## Configuration Visibility

All cortex configuration is logged at boot (dev only):
```typescript
{
  url: env.cortexUrl,           // Proxy endpoint URL
  model: env.cortex.model,      // LLM model (default: gpt-4o-mini)
  timeoutMs: env.cortex.timeoutMs  // Client timeout (default: 12000)
}
```

## Production Impact

**Zero impact on production builds:**
- All logs use `if (__DEV__)` guards
- Long-press handler only active in dev (`__DEV__` check)
- No performance overhead in release builds
- No exposed secrets or sensitive data

## Troubleshooting

### "Missing EXPO_PUBLIC_CORTEX_URL"
Check `.env.local` has:
```bash
EXPO_PUBLIC_CORTEX_URL=https://<project-ref>.supabase.co/functions/v1/cortex-proxy
```

### Proxy Returns 429 (Rate Limited)
Check server-side rate limits:
```bash
npx supabase secrets list
# Check: CORTEX_RATE_MAX, CORTEX_RATE_WINDOW_MS
```

### Timeout Errors
Client-side timeout exceeded. Check:
1. `EXPO_PUBLIC_CORTEX_TIMEOUT_MS` in `.env.local`
2. Server-side `CORTEX_TIMEOUT_MS` in Supabase secrets
3. Network connectivity

### No Logs Appearing
1. Ensure `__DEV__` is true (dev mode)
2. Check Metro console (not device logs)
3. Restart with `npx expo start -c`

## Test Results

✅ **TypeScript**: 0 errors  
✅ **Lint**: 0 errors (95 pre-existing warnings)  
✅ **Boot Diagnostics**: Working (verified in logs)  
✅ **Proxy Connection**: Successful (1635ms response)  
✅ **Response Format**: Valid OpenAI completion ID

## Files Modified

1. `lib/cortex/CortexClient.ts` - Added dev logging
2. `lib/cortex/diag.ts` - New diagnostic helper
3. `App.tsx` - Boot diagnostics and env logging
4. `components/today/TodayMascotHeader.tsx` - Long-press ping handler

## Next Steps

These diagnostics can remain in the codebase indefinitely:
- Zero production impact (gated by `__DEV__`)
- Helps debug issues in development
- Provides visibility into proxy behavior
- Easy to understand log format

No cleanup required unless logs become noisy during development.
