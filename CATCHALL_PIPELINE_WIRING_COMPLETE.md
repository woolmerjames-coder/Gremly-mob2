# Catch-All Submit Pipeline Wiring - Complete

**Date:** October 16, 2025  
**Branch:** `feat/phase-6-5-catchall-ai`  
**Status:** ✅ Complete - Zero TS errors, all tests passing

## Summary

Traced and wired the Catch-All submit flow to the Cortex engine with comprehensive debug logging, proper flag gating, and single-source-of-truth payload mapping.

## Changes Made

### A. Pipeline Location (`components/ManualAddSheet.tsx`)

**Handler:** `handleSubmit` → catchall branch (line ~632)

**Flow:**
1. User fills catchall form → presses Save
2. Validation (zod schema)
3. **Classification point** (new):
   - Read `EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL` flag
   - If enabled: call `cortex.classify()`
   - If disabled: skip classification
   - On error: fallback to `null` result
4. Map cortex result to repo payload
5. Persist via `repo.create()`
6. Success animation

### B. Single Classification Point

**Location:** `components/ManualAddSheet.tsx` lines 632-706

**Implementation:**
```typescript
const DEBUG = (process.env.EXPO_PUBLIC_DEBUG_CORTEX ?? 'false') === 'true';
const classifyFlag = (process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL ?? 'false') === 'true';

if (DEBUG) {
  console.log('[CATCHALL][PIPE] start. classifyFlag:', classifyFlag, 'text length:', ...);
}

let res: CortexOutput | null = null;

if (classifyFlag) {
  try {
    if (DEBUG) console.log('[CATCHALL][PIPE] invoking cortex.classify...');
    res = await cortex.classify({ text: trimmedBody, spaceId: state.spaceId || null });
    if (DEBUG) console.log('[CATCHALL][PIPE] engine result:', res);
  } catch (classificationError) {
    if (DEBUG) console.error('[CATCHALL][PIPE] engine error, falling back to heuristic:', classificationError);
    // Explicit fallback to null (heuristic mapping)
  }
} else {
  if (DEBUG) console.log('[CATCHALL][PIPE] classification disabled by flag');
}
```

**Key Points:**
- Single `if (classifyFlag)` guard
- Clear DEBUG logging at each step
- Graceful fallback on error (null result)
- No dynamic imports (uses injected `cortex` provider)

### C. Payload Mapping (Single Source of Truth)

**Location:** `components/ManualAddSheet.tsx` lines 668-684

**Mapping logic:**
```typescript
const payload: CreateRecordInput = res
  ? mapClassificationToCreateInput(res, trimmedBody, state.spaceId)
  : {
      type: 'note',
      title: '',
      body: trimmedBody,
      subtype: 'catchall',
      space_id: state.spaceId || null,
      ai_placed: false,
      why_string: null,
    };

if (DEBUG) {
  console.log('[CATCHALL][PIPE] final payload:', {
    type: payload.type,
    subtype: 'subtype' in payload ? payload.subtype : undefined,
    ai_placed: payload.ai_placed,
    why_string: payload.why_string,
  });
}

await repo.create(payload);
```

**Behavior:**
- If cortex returns classification → use `mapClassificationToCreateInput`
- If null/disabled → default to catch-all note with `ai_placed: false`, `why_string: null`
- Always log final payload when DEBUG enabled

### D. Engine Selection (`cortex/createEngine.ts`)

**Updated logic:**
```typescript
export const createCortexEngine = (): ICortexEngine => {
  const DEBUG = (process.env.EXPO_PUBLIC_DEBUG_CORTEX ?? 'false') === 'true';
  const engineFlag = (process.env.EXPO_PUBLIC_CORTEX_ENGINE ?? 'HEURISTIC').toUpperCase();
  const classifyFlag = process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL ?? 'false';
  const hasKey = !!process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  const model = process.env.EXPO_PUBLIC_CORTEX_MODEL ?? 'gpt-4o-mini';

  if (DEBUG) {
    console.log('[createCortexEngine] choose:', { engineFlag, classifyFlag, hasKey, model });
  }

  const classifyCatchall = parseBoolean(classifyFlag, false);
  if (!classifyCatchall) {
    if (DEBUG) console.log('[createCortexEngine] classification disabled by flag');
    return new DisabledCortexEngine();
  }

  if (engineFlag === 'LLM' && hasKey) {
    if (DEBUG) console.log('[createCortexEngine] using OpenAI engine with rate limiter');
    // ... create OpenAI engine with rate limiter
    return new ManagedCortexEngine({ primary, fallback: heuristicEngine, limiter });
  }

  if (DEBUG || engineFlag === 'LLM') {
    console.warn('[createCortexEngine] Using Heuristic engine.', { engineFlag, hasKey });
  }
  return heuristicEngine;
};
```

**Key Points:**
- Returns `DisabledCortexEngine` if `EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL` is false
- Uses OpenAI engine only if `engineFlag === 'LLM'` AND `hasKey === true`
- Falls back to heuristic otherwise
- Enhanced DEBUG logging at decision points

### E. UI Log Point (`components/overlay/CatchAllForm.tsx`)

**Added logging in `handleSubmit`:**
```typescript
const handleSubmit = () => {
  if (DEBUG) {
    console.log('[CATCHALL][CAPTURE] submit dispatched, text:', entry.trim().substring(0, 50) + ...);
  }
  // ... rest of handler
};
```

**Log prefix:** `[CATCHALL][CAPTURE]`  
**Content:** First 50 chars of trimmed text (prevents log spam)

### F. Test Updates (`__tests__/manual-add/ManualAddSheet.catchall.test.tsx`)

**Fixed environment setup:**
```typescript
// Set env before any imports that might read it
process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL = 'true';
```

**Moved to module-level** (before imports) to ensure flag is set when code evaluates.

**Added assertion:**
```typescript
await waitFor(() => {
  expect(mockClassify).toHaveBeenCalled();
  expect(mockCreate).toHaveBeenCalledWith({ ... });
});
```

## Environment Flags

| Flag | Type | Default | Purpose |
|------|------|---------|---------|
| `EXPO_PUBLIC_DEBUG_CORTEX` | boolean | `false` | Enable verbose debug logging |
| `EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL` | boolean | `false` | Enable classification for catch-all |
| `EXPO_PUBLIC_CORTEX_ENGINE` | enum | `HEURISTIC` | Engine type: `LLM` or `HEURISTIC` |
| `EXPO_PUBLIC_OPENAI_API_KEY` | string | *(required for LLM)* | OpenAI API key |
| `EXPO_PUBLIC_CORTEX_MODEL` | string | `gpt-4o-mini` | OpenAI model name |
| `EXPO_PUBLIC_CORTEX_TIMEOUT_MS` | number | `2500` | Classification timeout (ms) |
| `EXPO_PUBLIC_CORTEX_RATE_WINDOW_S` | number | `60` | Rate limit window (seconds) |
| `EXPO_PUBLIC_CORTEX_RATE_MAX` | number | `5` | Max requests per window |

## Debug Log Points

When `EXPO_PUBLIC_DEBUG_CORTEX=true`:

### Component Logs
```
[CATCHALL][FORM] render, entry length: <n>
[CATCHALL][CAPTURE] submit dispatched, text: <first 50 chars>
[CATCHALL][FORM] validation success, submitting payload
[CATCHALL][FORM] onSubmit dispatched
```

### Pipeline Logs
```
[CATCHALL][PIPE] start. classifyFlag: <bool>, text length: <n>
[CATCHALL][PIPE] invoking cortex.classify...
[CATCHALL][PIPE] engine result: <CortexOutput>
[CATCHALL][PIPE] final payload: { type, subtype, ai_placed, why_string }
```

### Engine Logs
```
[createCortexEngine] choose: { engineFlag, classifyFlag, hasKey, model }
[createCortexEngine] using OpenAI engine with rate limiter
[OpenAIEngine] classify start, text length: <n>
[OpenAIEngine] API response: <result>
```

## Test Results

```bash
$ npm test -- ManualAddSheet.catchall
PASS __tests__/manual-add/ManualAddSheet.catchall.test.tsx
  ManualAddSheet - Catch All
    ✓ creates catch-all note with body (XXXms)
    ✓ keeps save disabled when body is missing (XXms)
    ✓ creates catch-all with aiPlaced=false (XXms)
    ✓ reclassifies to todo when cortex suggests it (XXms)
    ✓ falls back to catchall when classification fails (XXms)

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

```bash
$ npm test
Test Suites: 1 skipped, 20 passed, 20 of 21 total
Tests:       4 skipped, 125 passed, 129 total
```

## TypeScript Validation

```bash
$ ./node_modules/.bin/tsc --noEmit
# Zero errors ✅
```

## Files Modified

1. `components/ManualAddSheet.tsx` - Single classification point with flag gating
2. `cortex/createEngine.ts` - Enhanced engine selection with DEBUG logging
3. `components/overlay/CatchAllForm.tsx` - Added capture log point
4. `__tests__/manual-add/ManualAddSheet.catchall.test.tsx` - Fixed env setup

## Architecture Notes

### Two Separate Components
1. **ManualAddSheet.tsx** (ActionSheet) - Has Cortex integration ✅
2. **ManualAddOverlay.tsx** (Modal) - Passes payload to parent, no Cortex (by design)

The overlay is used in screens like `TodayScreen.tsx` where the parent handles submission directly without AI classification.

### Provider Pattern
- `CortexProvider` creates engine via `createCortexEngine()` at mount
- Engine instance is memoized and stable across renders
- Component reads flags at runtime for per-request decisions

### Fallback Strategy
1. If classification disabled → skip cortex entirely
2. If classification enabled but fails → null result, map to default catch-all
3. If OpenAI fails → `ManagedCortexEngine` falls back to heuristic automatically

## Next Steps

**Production Checklist:**
- [ ] Set `EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL=true` in production env
- [ ] Set `EXPO_PUBLIC_CORTEX_ENGINE=LLM` in production env
- [ ] Configure valid `EXPO_PUBLIC_OPENAI_API_KEY`
- [ ] Adjust rate limits for production traffic (`EXPO_PUBLIC_CORTEX_RATE_*`)
- [ ] Monitor `[CATCHALL][PIPE]` logs for classification success rate
- [ ] Review `why_string` values in production data

**Optional Enhancements:**
- Add telemetry/analytics for classification decisions
- Implement user feedback loop for AI suggestions
- Add A/B testing for different models/prompts
- Cache classification results for identical text

## Verification Commands

```bash
# TypeScript
./node_modules/.bin/tsc --noEmit

# Tests (catch-all)
npm test -- ManualAddSheet.catchall

# Tests (full suite)
npm test

# Runtime (with debug logs)
EXPO_PUBLIC_DEBUG_CORTEX=true npm start
```

---

**Status:** ✅ Ready for QA / Staging deployment
