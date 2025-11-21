# Mind Drop Creation Refactor - Complete ✅

**Commit:** 45d1a4e  
**Date:** November 18, 2025  
**Phase:** 9 of 9 (Final architectural refactor)

## Overview

Completed major architectural refactor to **remove ALL title compaction and tag generation** from the Mind Drop creation path. All AI enrichment now happens exclusively in `UnifiedOverlayV2` on first edit via `OverlayPrefill`.

## Architecture Change

### Before
```
Mind Drop input → AI classifies intent → AI generates compact title + tags → 
Store enriched data in Supabase → User sees AI-enriched version
```

**Problems:**
- Inconsistent UX: some items show raw text, others show AI-enriched titles
- AI enrichment logic scattered across creation and edit paths
- User never sees original text they entered

### After
```
Mind Drop input → AI classifies intent → Store RAW text (title=fullText, tags=[]) → 
User sees raw text in Recent Drops → Opens overlay → AI enriches (compact title + tags)
```

**Benefits:**
- ✅ Consistent UX: user always sees raw text initially
- ✅ Centralized enrichment: all AI work in `UnifiedOverlayV2`
- ✅ Better control: enrichment happens when user explicitly edits
- ✅ Preserves original: raw text always available

## Changes Made

### 1. `buildCanonicalFromMindDrop.ts` - Major Refactor

**File header updated:**
```typescript
/**
 * IMPORTANT: Title + tags are owned by UnifiedOverlayV2. Do not enrich here.
 * 
 * This mapper creates provisional entities with RAW text only. No title compaction
 * or tag generation happens at creation time. All AI enrichment is deferred to 
 * UnifiedOverlayV2 via OverlayPrefill when the user first edits the item.
 */
```

**`compactTitle()` - Before:**
```typescript
function compactTitle(rawText: string, aiTitle?: string): string {
  if (aiTitle?.trim()) {
    return aiTitle.trim();
  }
  const firstLine = rawText.split('\n')[0].trim();
  if (firstLine.length <= 60) {
    return firstLine;
  }
  return firstLine.slice(0, 57) + '...';
}
```

**`compactTitle()` - After:**
```typescript
function compactTitle(rawText: string, aiTitle?: string): string {
  // DEPRECATED: aiTitle parameter kept for backwards compatibility but ignored
  // Title compaction is now owned by UnifiedOverlayV2
  // Return raw text as-is - no AI enrichment at creation time
  return rawText.trim();
}
```

**`buildCleanedTags()` - Before:**
```typescript
function buildCleanedTags(
  aiTags: string[] | null | undefined,
  rawText: string,
  kind: 'todo' | 'habit' | 'log',
): string[] {
  if (aiTags && aiTags.length > 0) {
    return filterAndNormalizeTags(aiTags);
  }
  const fallbackKind = kind === 'log' ? 'note' : kind;
  return buildFallbackTags(rawText, fallbackKind);
}
```

**`buildCleanedTags()` - After:**
```typescript
function buildCleanedTags(
  aiTags: string[] | null | undefined,
  rawText: string,
  kind: 'todo' | 'habit' | 'log',
): string[] {
  // Tag generation is now owned by UnifiedOverlayV2
  // Only preserve *journal system marker for narrative logs
  if (kind === 'log' && aiTags && aiTags.some((t) => t === '*journal' || t === 'journal')) {
    return ['*journal'];
  }
  // For all other cases, return empty - tags owned by UnifiedOverlayV2
  return [];
}
```

### 2. `CatchAllNotepad.tsx` - Updated Creation Flow

**Added 30-line architecture documentation:**
```typescript
/**
 * CatchAllNotepad.tsx - Mind Drop Input & Provisional Entity Creation
 *
 * ARCHITECTURE NOTE: Title + tags are owned by UnifiedOverlayV2. Do not enrich here.
 *
 * This screen handles Mind Drop text input and creates provisional entities (notes/todos/habits)
 * with RAW text only. No title compaction or tag generation happens at creation time.
 *
 * Flow:
 * 1. User enters text: "Book doctor appointment tomorrow at 2pm"
 * 2. AI classifies intent → determines it's a todo
 * 3. Create provisional todo:
 *    - title: "Book doctor appointment tomorrow at 2pm" (raw text, not compacted)
 *    - body: "Book doctor appointment tomorrow at 2pm" (full text)
 *    - tags: [] (empty - no AI tag generation at creation)
 *    - due_date: extracted date (if detected)
 * 4. User opens in UnifiedOverlayV2 for first edit
 * 5. UnifiedOverlayV2 runs OverlayPrefill:
 *    - Compacts title: "Book doctor appointment tomorrow at 2pm" → "Doctor Appointment"
 *    - Generates tags: [] → ['doctor', 'appointment', 'tomorrow']
 *
 * Title compaction and tag generation happen ONLY in UnifiedOverlayV2 via OverlayPrefill.
 * This ensures consistent UX: user sees full text initially, AI suggestions appear on first edit.
 */
```

**Updated todo creation (lines ~2330):**
```typescript
// Before:
const canonical = buildCanonicalFromMindDrop({
  kind: 'todo',
  rawText: trimmed,
  aiTitle: action.payload.title?.trim(),
  aiTags: combinedTags.length > 0 ? combinedTags : undefined,
});

// After:
const canonical = buildCanonicalFromMindDrop({
  kind: 'todo',
  rawText: trimmed,
  // aiTitle: removed - title compaction happens in UnifiedOverlayV2
  // aiTags: removed - tag generation happens in UnifiedOverlayV2
});
```

**Updated habit creation (lines ~2355):**
```typescript
// Before:
const canonical = buildCanonicalFromMindDrop({
  kind: 'habit',
  rawText: trimmed,
  aiTitle: action.payload.name?.trim(),
  aiTags: combinedTags.length > 0 ? combinedTags : undefined,
});

// After:
const canonical = buildCanonicalFromMindDrop({
  kind: 'habit',
  rawText: trimmed,
  // aiTitle: removed - title compaction happens in UnifiedOverlayV2
  // aiTags: removed - tag generation happens in UnifiedOverlayV2
});
```

**Updated log creation (lines ~2390):**
```typescript
// Before:
const canonical = buildCanonicalFromMindDrop({
  kind: 'log',
  rawText: trimmed,
  aiTitle: action.payload.text?.trim(),
  aiTags: combinedTags.length > 0 ? combinedTags : undefined,
});

// After:
const canonical = buildCanonicalFromMindDrop({
  kind: 'log',
  rawText: trimmed,
  // aiTitle: removed - title compaction happens in UnifiedOverlayV2
  aiTags: subtype === 'journal' ? ['*journal'] : undefined, // Preserve *journal system marker only
});
```

**Updated list note creation (lines ~2415):**
```typescript
// Before:
const listTags = combinedTags.length > 0
  ? combinedTags
  : buildFallbackTags(cleanedText, 'note', 'list');

mapped.push({
  bucket: 'notes',
  payload: {
    ...
    ...(listTags.length > 0 && { tags: listTags }),
  },
});

// After:
// Title + tags are owned by UnifiedOverlayV2. Do not enrich here.
// No tag generation at creation time - tags assigned in overlay on first edit

mapped.push({
  bucket: 'notes',
  payload: {
    ...
    // tags: removed - tag generation happens in UnifiedOverlayV2
  },
});
```

### 3. `convert_or_create_from_drop.sql` - Documentation

**Added header comment:**
```sql
-- Mind Drop RPC: convert_or_create_from_drop
-- Creates or reuses todos derived from Mind Drop items in an idempotent way
-- Archives the provisional Mind Drop note after conversion
--
-- IMPORTANT: Title + tags are owned by UnifiedOverlayV2. Do not enrich here.
-- This function copies title/name/body/tags from p_payload without modification.
-- All AI title compaction and tag generation happens in the overlay on first edit.
--
-- Requirements:
-- ✅ 1) Idempotent based on dropId
-- ✅ 2) Reuse existing todo if found by dropId
-- ✅ 3) Archive original Mind Drop note
-- ✅ 4) Return the final todo_id
-- ✅ 5) Extract due_date and due_time from p_payload.due_at
-- ✅ 6) Do NOT modify title/tags - copy from payload as-is
```

## Example: Before vs After

### User Input
```
"Book doctor appointment tomorrow at 2pm"
```

### Before (Old Flow)
1. Mind Drop classifies: todo
2. AI generates compact title: `"Doctor Appointment"`
3. AI generates tags: `['doctor', 'appointment', 'tomorrow']`
4. Store in Supabase:
   ```json
   {
     "title": "Doctor Appointment",
     "body": "Book doctor appointment tomorrow at 2pm",
     "tags": ["doctor", "appointment", "tomorrow"]
   }
   ```
5. User sees in Recent Drops: **"Doctor Appointment"** with chips: doctor, appointment, tomorrow

### After (New Flow)
1. Mind Drop classifies: todo
2. Store RAW text in Supabase:
   ```json
   {
     "title": "Book doctor appointment tomorrow at 2pm",
     "body": "Book doctor appointment tomorrow at 2pm",
     "tags": []
   }
   ```
3. User sees in Recent Drops: **"Book doctor appointment tomorrow at 2pm"** with no tag chips
4. User opens overlay for first edit
5. `OverlayPrefill` runs automatically:
   - Detects raw sentence: ✅ (title == body, no tags, ai_placed=true, origin='catchall')
   - Calls AI enrichment
   - Suggests title: `"Doctor Appointment at 2pm"`
   - Suggests tags: `['doctor', 'appointment', '2pm']`
   - Auto-applies AI suggestions
6. User sees enriched overlay with AI-suggested title and tags

## Verification

### Tests
All 69 overlay tests passing:
- ✅ `overlayMindDropEnhanced.test.tsx` - 34 tests (prefill detection)
- ✅ `overlayHabitTagReplacement.test.tsx` - 30 tests (generic tag replacement)
- ✅ `overlay.gateway.flag.test.tsx` - 3 tests (feature flags)
- ✅ `UnifiedCreateOverlay.conversions.test.tsx` - 2 tests (conversions)

### TypeScript
No TypeScript errors in modified files:
- ✅ `CatchAllNotepad.tsx` (4368 lines)
- ✅ `buildCanonicalFromMindDrop.ts` (149 lines)
- ✅ `convert_or_create_from_drop.sql` (SQL file)

### Behavior
Raw sentence detection still works correctly:
- `isRawSentenceTitle()` detects when title == body
- `OverlayPrefill` triggers automatically on first edit
- AI enrichment (title compaction + tag generation) happens in overlay
- User sees raw text → AI suggestions on edit

## What Gets Stored at Creation

### Todos
```typescript
{
  title: rawText.trim(),           // "Book doctor appointment tomorrow at 2pm"
  name: rawText.trim(),            // "Book doctor appointment tomorrow at 2pm"
  body: rawText.trim(),            // "Book doctor appointment tomorrow at 2pm"
  tags: [],                        // Empty - no AI tags
  canonical_type: 'todo',
  labels: ['todo'],
  ai_placed: true,
  why_string: 'Organized via Mind Drop',
  origin: 'catchall',
  drop_id: '...',
}
```

### Habits
```typescript
{
  title: rawText.trim(),           // "Start doing 15 minutes of yoga every morning"
  name: rawText.trim(),            // "Start doing 15 minutes of yoga every morning"
  notes: rawText.trim(),           // "Start doing 15 minutes of yoga every morning"
  tags: [],                        // Empty - no AI tags
  canonical_type: 'habit',
  labels: ['habit'],
  ai_placed: true,
  why_string: 'Organized via Mind Drop',
  origin: 'catchall',
  drop_id: '...',
}
```

### Logs (Journal)
```typescript
{
  title: rawText.trim(),           // "Feeling anxious after meeting but better after walk"
  body: rawText.trim(),            // "Feeling anxious after meeting but better after walk"
  tags: ['*journal'],              // Only system marker preserved
  canonical_type: 'log',
  labels: ['log'],
  ai_placed: true,
  why_string: 'Organized via Mind Drop',
  origin: 'catchall',
  drop_id: '...',
}
```

### List Notes
```typescript
{
  title: rawText.trim(),           // "Quick shopping list"
  body: rawText.trim(),            // "Quick shopping list"
  tags: [],                        // Empty - no AI tags
  canonical_type: 'list',
  labels: ['catchall'],
  ai_placed: true,
  why_string: 'Ideas/list capture',
  origin: 'catchall',
  drop_id: '...',
}
```

## Rationale

### Why This Change?

1. **Consistent UX**: User always sees what they typed initially
   - Before: some items showed AI-enriched titles, inconsistent
   - After: raw text always displayed in Recent Drops

2. **Centralized Logic**: All AI enrichment in one place
   - Before: buildCanonicalFromMindDrop + UnifiedOverlayV2 both did enrichment
   - After: UnifiedOverlayV2 owns all enrichment via OverlayPrefill

3. **Better Control**: Enrichment happens when user explicitly edits
   - Before: AI enrichment forced at creation, user never saw original
   - After: Raw text preserved, AI suggestions on first edit

4. **Cleaner Architecture**: Clear separation of concerns
   - Creation path: store raw data
   - Edit path: enrich with AI

### What Still Works?

- ✅ Mind Drop intent classification (todo/habit/log)
- ✅ Due date extraction for todos
- ✅ *journal marker preservation for logs
- ✅ Raw sentence detection in OverlayPrefill
- ✅ Automatic AI enrichment on first edit
- ✅ All existing prefill enhancements (Phases 1-8)

## Related Work

This refactor builds on previous phases:

- **Phase 1-4**: Unified rendering + prefill detection + tag handling
- **Phase 5**: SQL RPC due_at extraction
- **Phase 6**: Enhanced prefill detection + "Book" heuristic
- **Phase 7**: Generic habit tag replacement
- **Phase 8**: Log confirmation with canonical_type/labels
- **Phase 9**: THIS - Remove AI enrichment from creation path ✅

All previous enhancements remain active and working in UnifiedOverlayV2.

## Impact

### User Experience
- User enters: "Book doctor appointment tomorrow at 2pm"
- Mind Drop shows: "Book doctor appointment tomorrow at 2pm" (raw text)
- User opens overlay: AI suggests "Doctor Appointment at 2pm" + tags
- User gets AI help when they need it (on edit), not forced at creation

### Code Maintenance
- Simpler creation path: just store raw data
- All AI logic in UnifiedOverlayV2: easier to test and modify
- Clear ownership: creation stores, overlay enriches

### Future Extensions
- Easy to add more AI enrichment features in overlay
- Creation path stays simple and fast
- Can add user preferences: "always auto-apply" vs "suggest only"

## Files Modified

1. `lib/minddrop/buildCanonicalFromMindDrop.ts` - Major refactor (149 lines)
2. `app/screens/CatchAllNotepad.tsx` - Updated creation calls (4368 lines)
3. `supabase/migrations/20251110_convert_or_create_from_drop.sql` - Documentation

## Commit

```
commit 45d1a4e
Author: James Woolmer
Date: November 18, 2025

refactor: Remove title/tag AI enrichment from Mind Drop creation path

ARCHITECTURE CHANGE: Move all title compaction and tag generation from
Mind Drop creation (CatchAllNotepad) to edit flow (UnifiedOverlayV2).

All 69 overlay tests passing. No TypeScript errors.
```

## Status

✅ **COMPLETE** - Phase 9 of 9 finished
✅ All tests passing (69/69)
✅ No TypeScript errors
✅ Committed to git
✅ Architecture documented
