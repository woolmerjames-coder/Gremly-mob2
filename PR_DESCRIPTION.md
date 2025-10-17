# feat(cortex): Phase 6.5 Catch-All early AI (flag-gated)

## Overview
Wires the Catch-All "Capture" submit flow to the Cortex classification engine with comprehensive debug logging, rate-limit fallback, and payload rationale persistence.

## Changes

### 1. Pipeline Integration (`components/ManualAddSheet.tsx`)
- Added classification point in catch-all submit branch
- Reads `EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL` flag to enable/disable AI
- Calls `cortex.classify()` when flag is enabled
- Maps classification result to repo payload with `ai_placed` and `why_string`
- Graceful fallback to heuristic on error
- Added success toast: "Saved to the Hub." + "I put this here." (when AI-placed)

### 2. Rate Limiter Enhancement (`cortex/createEngine.ts`)
- Added DEBUG logging when rate limit is hit
- Log message: `[CORTEX][RATE] limit reached; using heuristic`
- `ManagedCortexEngine` automatically falls back to heuristic when primary is rate-limited

### 3. Button & Logging (`components/overlay/CatchAllForm.tsx`)
- Updated testID from `catchall-submit` to `capture-catchall` (per spec)
- Added `[CATCHALL][CAPTURE]` log at submit with text preview

### 4. Rate-Limit Tests (`__tests__/cortex/rate-limit.test.ts`)
- New test suite verifying rate limiter behavior
- Tests:
  - Falls back to heuristic when limit exceeded
  - Allows requests again after window expires
  - Disables rate limiting when `EXPO_PUBLIC_CORTEX_RATE_MAX=0`

### 5. Documentation
- `CATCHALL_PIPELINE_WIRING_COMPLETE.md` - Comprehensive implementation guide
- `CATCHALL_PIPELINE_FLOW.md` - Visual flowcharts and log examples

## Debug Logs

When `EXPO_PUBLIC_DEBUG_CORTEX=true`:

```
[CATCHALL][CAPTURE] submit dispatched, text: "Buy milk and eggs..."
[CATCHALL][PIPE] start. classifyFlag: true, text length: 34
[CATCHALL][PIPE] invoking cortex.classify...
[CATCHALL][PIPE] engine result: { type: 'todo', aiPlaced: true, ... }
[CATCHALL][PIPE] final payload: { type: 'todo', ai_placed: true, why_string: '...' }
```

Rate limit hit:
```
[CORTEX][RATE] limit reached; using heuristic
```

## Environment Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL` | `false` | Enable AI classification |
| `EXPO_PUBLIC_CORTEX_ENGINE` | `HEURISTIC` | Engine type (`LLM` or `HEURISTIC`) |
| `EXPO_PUBLIC_OPENAI_API_KEY` | *(required)* | OpenAI API key |
| `EXPO_PUBLIC_DEBUG_CORTEX` | `false` | Verbose debug logging |
| `EXPO_PUBLIC_CORTEX_RATE_MAX` | `5` | Max requests per window |
| `EXPO_PUBLIC_CORTEX_RATE_WINDOW_S` | `60` | Rate limit window (seconds) |

## Quality Gates

- ✅ **Lint:** 0 errors, 1 pre-existing warning
- ✅ **TypeScript:** Zero errors
- ✅ **Tests:** 21 suites passed, 128 tests passed
  - ✅ Rate-limit fallback verified
  - ✅ Catch-all submission tests passing
  - ✅ Classification payload mapping correct

## PR Checklist

- [x] Lint/typecheck/tests green
- [x] Flag off → heuristic path OK
- [x] Flag on → LLM path OK (when key provided)
- [x] Rate-limit triggers fallback without crash
- [x] `why_string` persisted in repos
- [x] "Saved to the Hub." + "I put this here." toasts display as expected
- [x] Button testID updated to `capture-catchall`
- [x] Comprehensive debug logging added
- [x] Documentation complete

## Testing Instructions

### 1. Flag Disabled (Default)
```bash
# .env.local
EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL=false
```
- Catch-all saves immediately without AI
- `ai_placed: false`, `why_string: null`

### 2. Flag Enabled (Heuristic)
```bash
EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL=true
EXPO_PUBLIC_CORTEX_ENGINE=HEURISTIC
```
- Uses keyword-based heuristic
- Fast, no API calls

### 3. Flag Enabled (LLM)
```bash
EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL=true
EXPO_PUBLIC_CORTEX_ENGINE=LLM
EXPO_PUBLIC_OPENAI_API_KEY=sk-...
EXPO_PUBLIC_DEBUG_CORTEX=true
```
- Uses OpenAI for classification
- Watch console for `[CATCHALL][PIPE]` logs
- Try entering "Buy groceries tomorrow" → should classify as todo

### 4. Rate Limit Testing
```bash
EXPO_PUBLIC_CORTEX_RATE_MAX=2
EXPO_PUBLIC_CORTEX_RATE_WINDOW_S=10
```
- Submit 3+ catch-all items rapidly
- 3rd should fallback to heuristic
- Watch for `[CORTEX][RATE] limit reached` log

## Screenshots

*Add screenshots of:*
- Toast notification after successful save
- Debug logs in console
- Rate limit warning in console

## Related Issues

Closes #[issue-number] (if applicable)

## Breaking Changes

- Button testID changed from `catchall-submit` → `capture-catchall`
  - Update any E2E tests that reference the old ID

## Migration Guide

No migration needed for existing users. Feature is flag-gated and disabled by default.

To enable:
1. Add `EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL=true` to `.env.local`
2. Configure engine and API key as needed
3. Monitor debug logs to verify behavior

---

**Reviewer Notes:**
- Focus on rate-limiter fallback logic in `createEngine.ts`
- Verify toast UX is non-intrusive
- Check that `why_string` is properly persisted and readable in DB
