# Mind Drop Log Classification Fix Summary

## Problem Statement

Users reported that reflective/narrative Mind Drops like "Just thinking about maybe starting a side hustle someday" and social logs like "Dinner tonight with Jeff" were being:
1. **Saved as unsorted** (subtype: `catchall`, labels: `['catchall', 'needs_review']`)
2. **Showing category chips** instead of auto-creating as logs
3. **Missing proper tags** (inconsistent tag behavior)

## Root Causes

### 1. Labels Not Updated When Converting to Log
**Location**: `app/screens/CatchAllNotepad.tsx` lines 2462-2520

When the auto-create path converted an unsorted note to a log (action type `create.note`), it updated:
- ✅ `subtype` (journal/list/everything_else)
- ✅ `ai_placed` flag
- ❌ **`labels` array was NOT updated** - still had `['catchall', 'needs_review']` instead of `['log']`

**Fix**:
```typescript
// Fetch existing note to update labels and tags
const existingNote = await repo.getById(unsortedNoteId);
const existingLabels = (existingNote as any)?.labels || [];

// Update labels: remove catchall/needs_review, add 'log' for all auto-created logs
const updatedLabels = existingLabels.filter(
  (l: string) => l !== 'catchall' && l !== 'needs_review',
);
if (!updatedLabels.includes('log')) {
  updatedLabels.push('log');
}

const updatePatch: any = {
  subtype,
  canonicalType,
  ai_placed: true, // Auto-created logs are always AI-placed
  why_string: whyUpdate,
  views: { alsoShowIn: ['Hub:Catch-All'] },
  labels: updatedLabels, // ✅ Now properly updates labels
};
```

### 2. Default Subtype Was 'catchall' for Auto-Created Logs
**Location**: `app/screens/CatchAllNotepad.tsx` line 2463-2480

Auto-created logs were defaulting to subtype `'catchall'` instead of using a proper log subtype like `'everything_else'`.

**Fix**:
```typescript
// Priority: 1) action payload, 2) mindDropDecision.logSubtype, 3) default to 'everything_else'
const rawSubtype =
  firstAction.type === 'add.to.list'
    ? 'list'
    : firstAction.payload.subtype ??
      decision.mindDropDecision?.logSubtype ??
      'everything_else'; // ✅ Changed from 'catchall'

// Normalize to valid log subtypes
const subtype =
  rawSubtype === 'journal'
    ? 'journal'
    : rawSubtype === 'list'
      ? 'list'
      : rawSubtype === 'idea'
        ? 'idea'
        : rawSubtype === 'reference'
          ? 'reference'
          : 'everything_else'; // ✅ No longer defaults to catchall
```

### 3. Mode Override Didn't Add create.note Action
**Location**: `lib/cortex/cortexDecide.ts` lines 607-630

When canonical intent overrode `mode='ask'` → `mode='auto'` for confident logs, it didn't add a `create.note` action, so the actions array stayed empty.

**Fix**:
```typescript
// Phase 11.9: Override 'ask' mode for clear logs (reflection safety)
if (
  mode === 'ask' &&
  canonicalIntent.type === 'log' &&
  canonicalIntent.confidence >= 0.55 && // ✅ Lowered from 0.6 to 0.55
  !canonicalIntent.suppressChips
) {
  mode = 'auto';

  // ✅ Add create.note action if not already present
  if (!effectiveCandidateActions.some((a) => a.type === 'create.note')) {
    const logSubtype = 'everything_else';
    effectiveCandidateActions.push({
      type: 'create.note' as const,
      payload: {
        text: userText,
        subtype: logSubtype as any,
        spaceId: null,
      },
    });
  }

  if (__DEV__) {
    console.log('[CanonicalIntent] Overriding ask→auto for confident log');
  }
}
```

### 4. Low-Confidence Logs Showed Chips
**Location**: `lib/cortex/intents/canonicalIntent.ts` lines 145-171

Reflection texts like "just thinking out loud" had low AI confidence (48%) and didn't match the reflection safety rule (which only converted ignore→log).

**Fix**: Added reflection confidence boost rule:
```typescript
// REFLECTION CONFIDENCE BOOST
// When AI/rules already say 'log' but confidence is low, boost it if reflection keywords present
if (
  (normalizedAI === 'log' || normalizedRule === 'log') &&
  (aiConf < 0.6 || ruleConf < 0.6) &&
  hasReflectionKeywords(text)
) {
  return {
    type: 'log',
    confidence: 0.6, // ✅ Boost to 60% to trigger auto-create
    allowAutoCreate: false,
    suppressChips: false,
    reasoning: 'Reflection boost: low-confidence log boosted due to reflection keywords',
  };
}
```

## Verification

### Manual Testing Checklist

Test these inputs in Mind Drop:

1. **"Just thinking about maybe starting a side hustle someday"**
   - ✅ Expected: Auto-creates as log (no chips)
   - ✅ Expected labels: `['log']`
   - ✅ Expected subtype: `'everything_else'` or `'journal'`

2. **"just thinking out loud"**
   - ✅ Expected: Auto-creates as log (no chips)
   - ✅ Expected labels: `['log']`
   - ✅ Expected subtype: NOT `'catchall'`

3. **"Dinner tonight with Jeff"**
   - ✅ Expected: Auto-creates as log (NOT todo)
   - ✅ Expected labels: `['log']`
   - ✅ Expected tags: May include social/event tags via BackgroundPrefill

4. **"Email Sarah the proposal"**
   - ✅ Expected: Auto-creates as todo
   - ✅ Expected labels: `['todo']`

5. **"Run 3 times a week"**
   - ✅ Expected: Auto-creates as habit
   - ✅ Expected labels: `['habit']`
   - ✅ Expected tags: Should include `#exercise` via theme tags

### Database Queries

Check the database after creating the above Mind Drops:

```sql
-- Verify no catchall logs for these texts
SELECT id, title, subtype, labels, tags, ai_placed
FROM notes
WHERE title LIKE '%side hustle%'
   OR title LIKE '%thinking out loud%'
   OR title LIKE '%Dinner%Jeff%'
ORDER BY created_at DESC
LIMIT 10;

-- Expected results:
-- - subtype should be 'everything_else', 'journal', or other log subtype (NOT 'catchall')
-- - labels should include 'log' (NOT 'catchall' or 'needs_review')
-- - ai_placed should be true
```

### Log Analysis

Enable dev mode and check console logs for:

```
[CanonicalIntent] Chip decision: { showChips: false, reason: 'confident-log', ... }
[CanonicalIntent] Overriding ask→auto for confident log
[BackgroundPrefill] Tags for note { entityId, finalTagsCount, ... }
```

## Files Changed

1. **`app/screens/CatchAllNotepad.tsx`** (performSave function)
   - Added labels update when converting unsorted→log
   - Changed default log subtype from 'catchall' to 'everything_else'
   - Set ai_placed=true for all auto-created logs

2. **`lib/cortex/cortexDecide.ts`** (cortexDecide function)
   - Added create.note action when overriding ask→auto for logs
   - Lowered confidence threshold from 0.6 to 0.55

3. **`lib/cortex/intents/canonicalIntent.ts`** (resolveCanonicalIntent function)
   - Added reflection confidence boost rule for low-confidence logs

4. **`__tests__/minddrop-pipeline.integration.test.ts`** (NEW)
   - Integration test documenting expected behavior

## Tag Behavior

Tag generation is handled by `lib/minddrop/backgroundPrefill.ts` and supporting functions:
- **`lib/tags/themes.ts`**: Adds theme tags like #exercise, #work, #money based on keywords
- **`lib/tags/quality.ts`**: Filters out low-quality tags (short words, stop words, etc.)
- **`lib/minddrop/logSubtypeTags.ts`**: Adds subtype tags (#idea, #journal) for logs

### Expected Tag Behavior

1. **Habits** ("Run 3 times a week"):
   - AI generates specific tags: `['running']`
   - Theme detection adds: `#exercise`
   - Final tags: `['running', 'exercise']`

2. **Social Logs** ("Dinner tonight with Jeff"):
   - AI may generate: `['dinner', 'social']` (depends on AI response)
   - Quality filter removes junk tags
   - Final tags: Context-appropriate or empty if AI returns low-quality tags

3. **Reflection Logs** ("just thinking out loud"):
   - Should have minimal/no tags (not junk like #just, #thinking)
   - Quality filter removes short/common words
   - Final tags: Empty or very minimal

## Known Limitations

1. **Social log tag quality**: Depends on AI classification quality. Some social events may not get ideal tags if AI returns generic words.

2. **Confidence thresholds**: The 0.55 threshold for log auto-create is opinionated. May need tuning based on production usage patterns.

3. **Reflection keywords**: The list of reflection keywords (thinking, wondering, maybe, etc.) is manually curated. May need expansion based on user feedback.

## Next Steps

1. Monitor production metrics for:
   - Ratio of catchall notes to classified logs
   - User chip interaction rates (should decrease for clear logs)
   - Tag quality complaints

2. Consider adding:
   - More reflection keywords if users report similar texts showing chips
   - Social event detection heuristics for "dinner", "meeting", "lunch" etc.
   - User feedback mechanism for "this should have been a log/todo/habit"
