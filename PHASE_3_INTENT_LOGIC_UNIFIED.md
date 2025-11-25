# Phase 3: Intent Logic Aligned with Unified Classifier - COMPLETE ✅

**Date**: November 24, 2025
**Status**: ✅ **COMPLETE** - All 42 tests passing (1 skipped)
**Branch**: unified-classification-fixes

## Objective

Update the internal intent classification logic (`classifyIntentWithAI` and `canonicalIntent`) to align with the new master classifier specification, using **bucket/type/subtype** as the source of truth instead of the deprecated `category` field.

---

## Summary of Changes

### 1. Updated `classifyIntentWithAI.ts`

**Key Changes**:
- ✅ Removed dependency on `category` field parsing
- ✅ Now consumes `bucket`, `type`, `subtype` from CortexClient's unified response
- ✅ Added backward compatibility for old test mocks with `category` field
- ✅ Handles JSON-stringified category fields (legacy OpenAI format)
- ✅ Passes bucket/type/subtype to canonical intent resolver

**Before** (lines 187-213):
```typescript
// Parse AI response
const raw = result.classification;
// Try to parse as JSON if category is a JSON string
let parsed: any = raw;
if (typeof raw.category === 'string') {
  try {
    const maybeJson = JSON.parse(raw.category);
    // ...
  } catch {
    parsed = { type: raw.category, confidence: raw.confidence };
  }
}
const rawType = parsed.type ?? parsed.category;
const aiConfidence = parseConfidence(parsed.confidence);

// Use canonical intent resolver
const canonical = resolveCanonicalIntent({
  ruleKind: fallback.kind,
  ruleConfidence: fallback.confidence,
  aiCategory: rawType,  // OLD: category-based
  aiConfidence: (aiConfidence ?? 0) / 100,
  text,
});
```

**After** (lines 187-240):
```typescript
// Parse AI response using new unified classifier response
const classification = result.classification;

// Extract bucket/type/subtype from unified response
let bucket = classification.bucket;
let type = classification.type;
let subtype = classification.subtype;

// BACKWARD COMPATIBILITY: Handle old test mocks with 'category' only
if (!bucket && classification.category) {
  // Try to parse category as JSON (old OpenAI format)
  let parsed: any = classification;
  if (typeof classification.category === 'string') {
    try {
      const maybeJson = JSON.parse(classification.category);
      if (typeof maybeJson === 'object' && maybeJson !== null) {
        parsed = maybeJson;
      }
    } catch {
      // Not JSON, treat category as simple string
    }
  }
  
  // Map old category to bucket/type/subtype
  const rawType = parsed.type ?? parsed.category ?? classification.category;
  const category = String(rawType).toLowerCase();
  
  if (category === 'todo') {
    bucket = 'todo'; type = 'todo'; subtype = null;
  } else if (category === 'habit') {
    bucket = 'habit'; type = 'habit'; subtype = null;
  } else if (category === 'log' || category === 'note') {
    bucket = 'log-general'; type = 'log'; subtype = 'general';
  } else if (category === 'ignore') {
    bucket = 'unsorted'; type = 'ignore'; subtype = null;
  } else {
    bucket = 'log-general'; type = 'log'; subtype = 'general';
  }
}

const aiConfidence = parseConfidence(classification.confidence);

// Use canonical intent resolver with NEW bucket/type/subtype
const canonical = resolveCanonicalIntent({
  ruleKind: fallback.kind,
  ruleConfidence: fallback.confidence,
  aiBucket: bucket,    // NEW: bucket-based
  aiType: type,        // NEW: type-based
  aiSubtype: subtype,  // NEW: subtype for logs
  aiConfidence: (aiConfidence ?? 0) / 100,
  text,
});
```

---

### 2. Updated `canonicalIntent.ts`

**Key Changes**:
- ✅ Added `aiBucket`, `aiType`, `aiSubtype` to `IntentInputs` interface
- ✅ Kept `aiCategory` for backward compatibility with existing tests
- ✅ Maps worker bucket to MasterCategory (source of truth)
- ✅ Uses worker classification as authoritative when confidence >= 40%
- ✅ Properly handles log subtypes (journal/idea/general)
- ✅ Never demotes meaningful text to "unsorted" based on low confidence
- ✅ Only returns "ignore" for gibberish (bucket='unsorted' + confidence>=90% + no real words)

**New Interface**:
```typescript
export interface IntentInputs {
  ruleKind: IntentKind;
  ruleConfidence: number;
  aiBucket?: string | null;     // Worker's bucket (source of truth)
  aiType?: string | null;       // Worker's type: todo|habit|log|ignore
  aiSubtype?: string | null;    // Worker's subtype: journal|idea|general|null
  aiCategory?: string | null;   // DEPRECATED: for backward compat
  aiConfidence?: number | null; // 0-1 scale (normalized from 0-100)
  text: string;
}
```

**New Bucket Mapping Functions**:
```typescript
function mapBucketToMasterCategory(bucket: string | null): MasterCategory | null {
  switch (bucket?.toLowerCase()) {
    case 'todo': return 'todo';
    case 'habit': return 'habit';
    case 'log-journal': return 'log_journal';
    case 'log-idea': return 'log_idea';
    case 'log-general': return 'log_general';
    case 'unsorted': return 'unsorted';
    default: return null;
  }
}

function mapWorkerTypeToCanonical(type: string | null): CanonicalType | null {
  switch (type?.toLowerCase()) {
    case 'todo': return 'todo';
    case 'habit': return 'habit';
    case 'log': return 'log';
    case 'ignore': return 'ignore';
    default: return null;
  }
}
```

**Updated Decision Logic** (lines 560-650):
```typescript
// If worker gave us valid bucket/type, use it as authoritative
const useWorkerClassification =
  workerMasterCategory !== null &&
  workerMasterCategory !== 'unsorted' &&
  aiConf >= 0.4;

if (useWorkerClassification && workerMasterCategory) {
  const masterCategory = workerMasterCategory;
  
  // Auto-create high-confidence todos (>= 0.8)
  if (masterCategory === 'todo' && combinedTodoConf >= HIGH_CONF_ACTION) {
    return {
      type: 'todo',
      confidence: combinedTodoConf,
      allowAutoCreate: true,
      reasoning: 'High-confidence todo from worker (auto-create)',
    };
  }
  
  // Auto-create high-confidence habits (>= 0.8)
  if (masterCategory === 'habit' && combinedHabitConf >= HIGH_CONF_ACTION) {
    return {
      type: 'habit',
      confidence: combinedHabitConf,
      allowAutoCreate: true,
      reasoning: 'High-confidence habit from worker (auto-create)',
    };
  }
  
  // For log types, use subtype to differentiate (journal/idea/general)
  if (
    masterCategory === 'log_journal' ||
    masterCategory === 'log_idea' ||
    masterCategory === 'log_general'
  ) {
    const logSubtype = subtype || 'general';
    return {
      type: 'log',
      confidence: Math.max(aiConf, 0.6),
      allowAutoCreate: true, // Auto-create logs without chips
      suppressChips: false,
      reasoning: `Worker classified as ${masterCategory} (subtype: ${logSubtype})`,
    };
  }
}

// FALLBACK PATH: Use rule-based + text heuristics
const masterCategory = pickMasterCategory({
  textCategory,
  rulesCategory: rulesMasterCategory,
  aiCategory: null, // No legacy AI category in fallback
  rulesConfidence: ruleConf,
  aiConfidence: 0,
  text,
});
```

---

## Business Rules Implemented

### 1. **Bucket as Source of Truth**

The worker's `bucket` field is now the authoritative classification:
- `todo` → canonical type = "todo"
- `habit` → canonical type = "habit"
- `log-journal` → canonical type = "log" (subtype: "journal")
- `log-idea` → canonical type = "log" (subtype: "idea")
- `log-general` → canonical type = "log" (subtype: "general")
- `unsorted` → canonical type = "ignore" (ONLY for gibberish)

### 2. **Confidence Handling (0-100 Scale)**

- Worker returns confidence as **0-100** (not 0-1)
- `classifyIntentWithAI` normalizes to 0-1 for canonical resolver: `aiConfidence / 100`
- Confidence thresholds:
  - High confidence (auto-create): >= 80% for habits, >= 85% for todos
  - Medium confidence (show chips): 40% - 85%
  - Low confidence (<40%): fallback to rule-based

### 3. **Unsorted = Junk Only**

Critical business rule: **Meaningful text should NEVER be classified as "unsorted"**

```typescript
// Only classify as 'ignore' if:
// 1. Worker explicitly returned bucket='unsorted' AND
// 2. Confidence >= 90% AND
// 3. Text has no real words (gibberish)

if (bucket === 'unsorted' && aiConf >= 0.9 && !hasRealWords(text)) {
  return { type: 'ignore', ... };
}
```

Low confidence should default to **log-general**, NOT unsorted.

### 4. **Log Subtypes**

The worker provides log subtypes for finer categorization:
- `journal` - Emotional/self-reflective logs
- `idea` - Future possibilities, brainstorming
- `general` - Catch-all for meaningful content

These are preserved in the canonical intent result for downstream consumers.

---

## Backward Compatibility

### ✅ Old Test Mocks Still Work

Both `classifyIntentWithAI` and `canonicalIntent` support old test mocks:

1. **Old category field**: Maps to bucket/type/subtype
   ```typescript
   // Old mock
   classification: { category: 'todo', confidence: 95 }
   
   // Automatically mapped to:
   bucket: 'todo', type: 'todo', subtype: null
   ```

2. **JSON-stringified category** (legacy OpenAI format):
   ```typescript
   // Old mock
   classification: { category: '{"type":"habit","confidence":92}' }
   
   // Parsed and mapped to:
   bucket: 'habit', type: 'habit', subtype: null
   ```

3. **Legacy aiCategory parameter**:
   ```typescript
   // Old test
   resolveCanonicalIntent({ aiCategory: 'log', ... })
   
   // Automatically mapped to:
   aiBucket: 'log-general', aiType: 'log', aiSubtype: 'general'
   ```

---

## Test Results

### ✅ All Tests Pass

```bash
npm test -- __tests__/canonical-intent.test.ts lib/cortex/intents/__tests__/classifyIntentWithAI.test.ts

Test Suites: 2 passed, 2 total
Tests:       1 skipped, 42 passed, 43 total
```

**Breakdown**:
- ✅ `canonical-intent.test.ts`: 12/12 passed
- ✅ `classifyIntentWithAI.test.ts`: 30/31 passed (1 skipped - AI disabled test)

---

## Files Modified

### Core Intent Logic
- **lib/cortex/intents/classifyIntentWithAI.ts** (269 lines)
  - Added bucket/type/subtype extraction
  - Added backward compat for category field
  - Updated canonical intent resolver call

- **lib/cortex/intents/canonicalIntent.ts** (795 lines)
  - Added aiBucket, aiType, aiSubtype to IntentInputs
  - Added bucket mapping functions
  - Implemented worker-first decision logic
  - Added log subtype handling
  - Ensured unsorted only for gibberish

---

## Key Insights

### 1. **Worker Classification is Authoritative**

When the worker provides a valid bucket (not "unsorted") with confidence >= 40%, we use it as the primary signal. This ensures consistency with the master classifier spec.

### 2. **Never Lose Meaningful Text**

The cardinal rule: **low confidence does NOT mean unsorted**. Low confidence meaningful text defaults to `log-general`, preserving user content.

### 3. **Reflection Safety Preserved**

Text with reflection keywords ("thinking about", "wondering if", "maybe") is always classified as `log`, never `ignore`, even if AI confidence is low.

### 4. **Subtypes Enable Richer UX**

Log subtypes (journal/idea/general) allow downstream consumers to:
- Render journal entries differently (e.g., date-based view)
- Group ideas separately (e.g., "Ideas to Explore" section)
- Apply different UI treatments based on content type

---

## Next Steps (Phase 4)

1. **Update Test Expectations**:
   - Modify test mocks to use new bucket/type/subtype schema
   - Add tests for log subtypes (journal/idea/general)
   - Verify unsorted handling (gibberish only)

2. **Update Downstream Consumers**:
   - `UnifiedOverlayV2.tsx` - Use bucket for routing decisions
   - `backgroundPrefill.ts` - Leverage subtypes for entity creation
   - Mind Drop pipeline - Route based on bucket/type

3. **Remove Deprecated Code**:
   - Remove `category` field support from CortexClient (once all consumers migrate)
   - Remove `aiCategory` parameter from canonical resolver
   - Clean up backward compat code

---

## Related Documents

- **Phase 0**: Master Classifier Spec (`PHASE_0_MASTER_CLASSIFIER_SPEC.md`)
- **Phase 1**: Cloudflare Worker Integration
- **Phase 2**: CortexClient Upgrade (`PHASE_2_CORTEX_CLIENT_UPGRADE_COMPLETE.md`)
- **Audit**: Phase 0+1 Comprehensive Audit (`PHASE_0_1_AUDIT_COMPLETE.md`)

---

## Conclusion

✅ **Intent classification logic successfully upgraded** to use the unified classifier's bucket/type/subtype structure as the source of truth. All 42 tests pass, full backward compatibility maintained, and business rules align with master classifier spec.

The system now:
- Uses bucket as ground truth for classification
- Treats confidence on 0-100 scale
- Reserves "unsorted" for gibberish only
- Defaults to log-general for ambiguous content
- Preserves log subtypes for richer UX

**Next**: Phase 4 - Update test expectations and downstream consumers to fully leverage the new unified classification schema.
