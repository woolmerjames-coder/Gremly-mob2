# Tag Extraction v3 Implementation - Ready to Use

## ✅ What's Been Created

1. **`lib/tags/extractTags.ts`** - New deterministic tag extractor
   - Function: `extractMeaningfulTags(rawText: string, subtype?: string)`
   - Returns: `string[]` of lowercase slug tags
   - Follows all specification rules (nouns only, no verbs/adjectives, max 6 tags)

2. **`__tests__/tag.extraction.v3.test.ts`** - Comprehensive test suite
   - Tests all example scenarios from the spec
   - Verifies exclusion rules
   - Tests people/places/topics extraction
   - Tests emotion handling
   - Tests prioritization

## 🔧 Integration Status

The new extractor is **ready but not yet integrated**. It's currently:
- ✅ Implemented and tested
- ✅ Exports `extractMeaningfulTags` function
- ❌ Not yet used in UnifiedOverlayV2.tsx
- ❌ Not yet used in CatchAllNotepad.tsx  
- ❌ Not yet replacing `buildFallbackTags` calls

## 📋 Next Steps - Integration Instructions

### Option 1: Manual Integration (Recommended for Control)

You need to update the following files:

#### 1. **components/overlay/UnifiedOverlayV2.tsx**

**Add import at top:**
```typescript
import { extractMeaningfulTags } from '../../lib/tags/extractTags';
```

**Find and replace tag extraction calls:**

Currently uses `buildFallbackTags()` or AI-based extraction. Replace with:
```typescript
// OLD (example):
const tags = buildFallbackTags(currentText, 'note', 'journal');

// NEW:
const subtype = determineSubtype(currentText); // journal, list, idea, catchall
const tags = extractMeaningfulTags(currentText, subtype);
```

**Key locations to update:**
- `handleResuggestTags` callback (line ~2043)
- Any AI tag generation/suggestion logic
- Mind Drop tag initialization

**Preserve existing logic:**
- ✅ Keep `normalizeTag` / `filterAndNormalizeTags` wrappers
- ✅ Keep `stickyTags` + `tombstones` logic (tags_meta)
- ✅ Keep `filterHabitTags` for habit single-word limit
- ✅ Keep `mergeLogTags` for emotion prioritization
- ✅ Respect `tagsDirty` flag (don't overwrite user edits)

#### 2. **app/screens/CatchAllNotepad.tsx**

**Add import:**
```typescript
import { extractMeaningfulTags } from '../../lib/tags/extractTags';
```

**Replace `buildFallbackTags` calls:**

Find instances like:
```typescript
const tags = buildFallbackTags(cleanedText, 'note', 'journal');
```

Replace with:
```typescript
const tags = extractMeaningfulTags(cleanedText, 'journal');
```

**Locations (estimated from grep results):**
- Line ~2221: Journal tag extraction
- Line ~2610: Note fallback tags
- Line ~2719: Generic fallback tags

### Option 2: Copilot Chat Instructions

If you want Copilot Chat to do the integration automatically:

**Open `components/overlay/UnifiedOverlayV2.tsx` in VS Code, then paste into Copilot Chat:**

```
You are updating the tag extraction logic to use the new deterministic extractor.

Instructions:
1. Import extractMeaningfulTags from ../../lib/tags/extractTags
2. Replace ALL AI-based tag suggestions and buildFallbackTags calls with extractMeaningfulTags(currentText, subtype)
3. Determine subtype from context:
   - Use 'journal' for reflective/emotional text
   - Use 'list' for list-like text (detect with LIST_LINE_REGEX or similar)
   - Use 'idea' for ideation text
   - Default to undefined

4. Ensure these still work:
   - normalizeTag / filterAndNormalizeTags wrappers
   - stickyTags + tombstones (tags_meta)
   - filterHabitTags for habits (single-word limit)
   - mergeLogTags for emotion prioritization in logs
   - tagsDirty flag (don't overwrite user-edited tags)
   - manually added tags
   - tombstoned tags

5. Mind Drop → Todo/Habit mappings still apply filterHabitTags rules

6. Make the smallest possible change - only replace tag extraction, don't refactor other logic

7. After updating, verify existing tag tests still pass
```

Then repeat for `app/screens/CatchAllNotepad.tsx`.

## 🧪 Testing

After integration, run:

```bash
npm test -- tag.extraction.v3.test.ts
npm test -- tag.quality.test.ts
npm test -- minddrop.tag.quality.integration.test.ts
```

All existing tag tests should still pass.

## 📊 Expected Behavior After Integration

### Before (with buildFallbackTags):
```
Input: "Sarah mentioned the coffee place on Oak Street"
Tags: ["@OakStreet", "*journal", "#street", "#amazing", "#coffee", "#everywhere"]
```

### After (with extractMeaningfulTags):
```
Input: "Sarah mentioned the coffee place on Oak Street"  
Tags: ["sarah", "coffee", "oak-street"]
```

**Key improvements:**
- ✅ No more generic verbs (#mentioned, #amazing)
- ✅ People extracted correctly (sarah vs @OakStreet)
- ✅ Multi-word places handled (oak-street)
- ✅ Only meaningful nouns

### Example Scenarios:

| Input | Old Tags | New Tags |
|-------|----------|----------|
| "Feeling overwhelmed about work presentation" | `["*journal", "#overwhelmed", "#figure", "#know"]` | `["presentation", "overwhelmed"]` |
| "Need to buy milk and eggs" | `["*list", "#maya", "#batteries", "#greek"]` | `["milk", "eggs", "groceries"]` |
| "Start running every morning" | `["#running", "#start", "#every", "#morning"]` | `["running", "morning"]` |

## 🚨 Important Notes

1. **Don't break existing features:**
   - Habit tag filtering (single-word limit)
   - Log emotion tag prioritization  
   - Sticky tags + tombstones
   - Tag dirty tracking

2. **The new extractor is deterministic:**
   - No AI calls
   - No network requests
   - Instant, local extraction
   - Consistent results

3. **Backwards compatibility:**
   - Old tags in database stay unchanged
   - Only new entries use new extraction
   - Existing tests should pass

## 📝 Summary

- ✅ **Created**: `extractMeaningfulTags` function
- ✅ **Tested**: Comprehensive test suite
- ❌ **Not yet integrated**: Needs manual update to use it
- 📋 **Next**: Follow integration instructions above

The new tag extractor is ready to use. Choose Option 1 (manual) for precise control, or Option 2 (Copilot Chat) for automated integration.
