# Theme Tag Enrichment Implementation

## Overview

Theme tags provide canonical categorization for Mind Drop entities (todos, habits, logs) by automatically adding high-level theme tags (e.g., `#exercise`, `#work`, `#health`) based on pattern matching in the entity's text content.

This is implemented as a post-processing step in BackgroundPrefill, operating after AI tag merging and quality filtering, without touching Phase 1-3 Mind Drop overlay behavior or the Supabase schema.

## Implementation

### Core Module: `lib/tags/themes.ts`

**Key Components:**
- `THEME_RULES`: Array of theme definitions with patterns
- `applyThemeTags(text, tags)`: Pure function that enriches tags based on text content

**Theme Rules:**
1. **#exercise** - Matches: running, gym, cardio, yoga, swimming, fitness, training, hiking, cycling, biking
2. **#work** - Matches: work, meeting, deadline, presentation, client, boss, project, office, report, conference
3. **#health** - Matches: doctor, dentist, therapy, meds, health, sick, appointment, medical, checkup, hospital, clinic
4. **#finance** - Matches: tax, budget, money, bank, pay, bill, invoice, accountant, finance
5. **#home** - Matches: clean, cleaning, laundry, grocery, repair, maintenance, plumber, electrician, household

**Behavior:**
- Only adds theme tags if patterns match in the source text
- Case-insensitive pattern matching
- Prevents duplicates (case-insensitive check)
- Preserves all existing tags
- Returns deduplicated list

### Integration Point: `lib/minddrop/backgroundPrefill.ts`

**For Todos (two code paths):**
```typescript
// After merging AI tags and existing tags
const effectiveTags = ...;

// Apply theme enrichment
const text = rawSentence ?? aiTitle ?? fullTodo.body ?? '';
const withThemeTags = applyThemeTags(text, effectiveTags);
const finalTags = applyTagQualityFilter(withThemeTags);

if (finalTags.length > 0) {
  updatePayload.tags = finalTags;
}
```

**For Habits:**
```typescript
// After merging AI tags and existing tags
const effectiveHabitTags = ...;

// Apply theme enrichment
const text = rawSentence ?? aiTitle ?? '';
const withThemeTags = applyThemeTags(text, effectiveHabitTags);
const finalHabitTags = applyTagQualityFilter(withThemeTags);

if (finalHabitTags.length > 0) {
  updatePayload.tags = finalHabitTags;
}
```

**Processing Order:**
1. Initial tags created from user input (buildFallbackTags)
2. Quality filter applied (removes junk tokens)
3. Entity created in Supabase
4. BackgroundPrefill runs AI enrichment
5. AI tags merged with existing tags
6. **Theme tags applied** ← New step
7. Final quality filter applied
8. Tags persisted to Supabase

## Examples

### Running Habit
**Input:** "Start running every morning"
**Initial tags:** `["#running"]`
**AI tags:** `["running", "morning routine"]`
**Final tags:** `["#running", "#exercise"]` ← Theme tag added

### Work Presentation Todo
**Input:** "Finish work presentation for client"
**Initial tags:** `["#presentation"]`
**AI tags:** `["presentation", "client"]`
**Final tags:** `["#presentation", "#client", "#work"]` ← Theme tag added

### Dentist Appointment
**Input:** "Book dentist appointment"
**Initial tags:** `["#appointment", "#dentist"]`
**AI tags:** `["appointment", "dentist"]`
**Final tags:** `["#appointment", "#dentist", "#health"]` ← Theme tag added

### Work Stress (Quality Filter Integration)
**Input:** "Work stuff has been a lot lately"
**Initial tags:** `["#has", "#lately"]` (junk)
**AI tags:** `["has", "been", "lot", "lately", "stuff"]` (all junk)
**Final tags:** `["#work"]` ← Junk filtered, theme tag added

## Testing

### Unit Tests: `lib/tags/__tests__/themes.test.ts`
- 34 tests covering all 5 themes
- Case-insensitive matching
- Deduplication behavior
- Edge cases (empty text, multiple themes, etc.)

### Integration Tests: `__tests__/minddrop.theme.tags.integration.test.ts`
- 13 tests simulating BackgroundPrefill flow
- Habit theme enrichment (running, gym, yoga)
- Todo theme enrichment (work, health, finance, home)
- Quality filter integration
- Multiple themes
- No duplicate themes

**Test Results:** 76/76 tests passing across all tag modules

## No Breaking Changes

✅ **Phase 1-3 Mind Drop overlay behavior:** Unchanged (81/81 overlay tests passing)
✅ **Supabase schema:** No changes required
✅ **Conversion logic:** Unchanged (unsorted → todo/habit/log still works)
✅ **Tag quality filtering:** Still applies (junk tags blocked)
✅ **BackgroundPrefill freeze flags:** Still work (no re-running AI)

## File Changes

**New Files:**
- `lib/tags/themes.ts` (160 lines) - Theme tag module
- `lib/tags/__tests__/themes.test.ts` (181 lines) - Unit tests
- `__tests__/minddrop.theme.tags.integration.test.ts` (226 lines) - Integration tests

**Modified Files:**
- `lib/minddrop/backgroundPrefill.ts`
  - Added import: `import { applyThemeTags } from '../tags/themes';`
  - Integrated theme tag enrichment into todos (2 code paths)
  - Integrated theme tag enrichment into habits (1 code path)

**Total Impact:** ~567 lines added (including tests), localized to BackgroundPrefill

## Design Principles

1. **Pure Functions:** `applyThemeTags()` has no side effects, just text + tags → enriched tags
2. **Fail-Safe:** Empty text or no matches = no changes to tags
3. **Non-Invasive:** Adds to existing tags, never removes (except quality filter)
4. **Opinionated:** Small, curated list of themes (5 total)
5. **Composable:** Works with quality filter and AI tag merging
6. **No Schema Changes:** Operates purely in application layer
7. **Backward Compatible:** No changes to existing Mind Drop flows

## Future Extensions

If needed, theme rules can be extended by:
1. Adding new theme objects to `THEME_RULES`
2. Adding patterns to existing themes
3. Creating user-configurable themes (future enhancement)

Keep themes small and opinionated for best results.
