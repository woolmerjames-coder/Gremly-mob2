# Classification Cascade - Phase 4b Shadow Mode Integration Audit

**Date:** December 1, 2024  
**Branch:** `Classification-revamp-Dec-1`  
**Phase:** 4b - Shadow Mode Integration  

---

## Overview

Phase 4b integrates the V2 classification cascade into the production `cortexDecide.ts` pipeline using a shadow mode pattern. This allows V2 to run in parallel with V1 for validation without affecting production behavior.

---

## New Files Created

### 1. `lib/cortex/classify/shadowCompare.ts` (~85 lines)

**Purpose:** Shadow comparison logger that runs V2 alongside V1 and logs disagreements.

**Key Exports:**
- `compareClassifications()` - Compares V1 and V2 results
- `logShadowComparison()` - Logs disagreements with full context
- `runShadowIfEnabled()` - Entry point called from cortexDecide.ts

**Comparison Logic:**
```typescript
interface ComparisonResult {
  agree: boolean;
  v1Type: string;
  v2Type: string;
  v1Mode: string;
  v2Mode: string;
  reason: string;
}
```

**Logging Strategy:**
- Only logs **disagreements** to reduce noise
- Includes: input, v1Result, v2Result, timestamp
- Uses `[ShadowCompare]` prefix for easy filtering

---

### 2. `lib/cortex/classify/classifyWithFlag.ts` (~95 lines)

**Purpose:** Feature flag wrapper that routes to V1 or V2 based on flags.

**Key Exports:**
- `classifyWithFlag()` - Main entry point for flagged classification
- `isV2Enabled()` - Checks FF_CLASSIFY_V2
- `isShadowEnabled()` - Checks FF_CLASSIFY_V2_SHADOW
- `mapV1ToOutput()` - Normalizes V1 result to common format
- `mapV2ToOutput()` - Normalizes V2 result to common format

**Common Output Format:**
```typescript
interface ClassifyOutput {
  type: string;
  subtype: string | null;
  confidence: number;
  mode: 'auto' | 'chips' | 'confirm';
  chipOptions?: string[];
  source: 'v1' | 'v2';
}
```

---

## Modified Files

### `lib/cortex/cortexDecide.ts`

**Changes Made:**

1. **Added Imports:**
```typescript
import { FF_CLASSIFY_V2, FF_CLASSIFY_V2_SHADOW } from '@/lib/env';
import { classifyV2 } from './classify/classifyV2';
import { runShadowIfEnabled, V1Result } from './classify/shadowCompare';
```

2. **Added Shadow Comparison Block (before final return):**
```typescript
// ── Shadow Comparison for V2 Validation ────────────────────────────────
// When shadow mode is enabled but V2 is not primary, run V2 in parallel
// for comparison logging without affecting production behavior
if (FF_CLASSIFY_V2_SHADOW && !FF_CLASSIFY_V2) {
  const v1Result: V1Result = {
    type: final.type,
    subtype: final.subtype ?? null,
    confidence: final.confidence,
    mode: final.mode,
  };
  runShadowIfEnabled(input, v1Result);
}
```

---

## Feature Flag Matrix

| FF_CLASSIFY_V2 | FF_CLASSIFY_V2_SHADOW | Behavior |
|----------------|----------------------|----------|
| off (default)  | on (default)         | V1 runs, V2 shadow logs disagreements |
| off            | off                  | V1 only, no shadow |
| on             | any                  | V2 runs as primary |

---

## Test Results

### All Tests Passing

```
classifyV2.test.ts:     46 passed
cortexDecide tests:     15 passed (integration verified)
```

**Test Categories:**
- Layer 0: Gibberish Gate (4 tests)
- Layer 1: Explicit Commands (4 tests)
- Layer 2: Clear Habits (5 tests)
- Layer 3: Clear Todos (5 tests)
- Layer 4: Clear Journals (3 tests)
- Layer 5: Clear Ideas (3 tests)
- Layer 6: Chips (3 tests)
- Layer 7: Log-General Default (3 tests)
- Critical test cases from proposal (16 tests)

---

## Shadow Mode Benefits

1. **Safe Rollout:** V2 runs without affecting users
2. **Validation:** Logs help identify where V2 differs from V1
3. **Low Overhead:** Only logs disagreements, not every classification
4. **Easy Toggle:** Single flag to switch V2 to primary

---

## Rollout Plan

### Phase 1: Shadow Mode (Current)
- `FF_CLASSIFY_V2=off`, `FF_CLASSIFY_V2_SHADOW=on`
- Monitor logs for disagreements
- Validate V2 makes better decisions

### Phase 2: Gradual Rollout
- Enable `FF_CLASSIFY_V2=on` for internal testers
- Monitor user feedback and error rates

### Phase 3: Full Rollout
- Enable `FF_CLASSIFY_V2=on` for all users
- Keep shadow mode available for debugging

---

## Files in Phase 4 (Combined)

| File | Lines | Purpose |
|------|-------|---------|
| `lib/cortex/classify/detectHedging.ts` | 69 | Hedging detection |
| `lib/cortex/classify/classifyV2.ts` | 268 | 8-layer cascade |
| `lib/cortex/classify/shadowCompare.ts` | 85 | Shadow comparison |
| `lib/cortex/classify/classifyWithFlag.ts` | 95 | Feature flag wrapper |
| `lib/cortex/classify/__tests__/classifyV2.test.ts` | 227 | Unit tests |

---

## Integration Points

```
cortexDecide.ts
    │
    ├── V1 classification (existing)
    │       │
    │       ▼
    │   buildResult()
    │       │
    │       ▼
    │   [if shadow enabled]
    │       │
    │       ├── runShadowIfEnabled()
    │       │       │
    │       │       ▼
    │       │   classifyV2()
    │       │       │
    │       │       ▼
    │       │   compareClassifications()
    │       │       │
    │       │       ▼
    │       │   [log if disagree]
    │       │
    │       ▼
    └── return final (V1 result unchanged)
```

---

## Commit Ready

Phase 4b is complete and ready for commit:
- ✅ shadowCompare.ts created
- ✅ classifyWithFlag.ts created
- ✅ cortexDecide.ts integration complete
- ✅ All tests passing
- ✅ TypeScript compiles (pre-existing errors in other files)
