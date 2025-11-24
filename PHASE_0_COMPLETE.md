# Phase 0 Complete: Master Classifier Spec + Golden Tests

## Summary

Phase 0 establishes the **canonical specification** for Mind Drop classification with comprehensive golden tests. No existing runtime behavior was changed - this phase purely defines the desired behavior for future migration.

## What Was Created

### 1. Master Classifier Specification (`lib/cortex/intents/masterClassifierSpec.ts`)

**Core Type:**
```typescript
type MasterCategory =
  | 'todo'
  | 'habit'
  | 'log_journal'
  | 'log_idea'
  | 'log_general'
  | 'unsorted';
```

**Pure Heuristic Functions:**
- `isTodoLike(text)` - Detects actionable tasks via imperative verbs + time-bound patterns
- `isHabitLike(text)` - Detects recurring behavior via recurrence/behavior change/tracking patterns
- `looksLikeJournal(text)` - Detects personal reflections via first-person emotions + reflective language
- `looksLikeIdea(text)` - Detects creative thoughts via explicit markers + speculative language
- `hasRealWords(text)` - Filters gibberish/keyboard mash
- `getPreferredMasterCategoryFromTextOnly(text)` - Pure decision function (no I/O, no AI)

**Key Characteristics:**
- ✅ Pure functions (no I/O, no network, no database)
- ✅ Fully testable in isolation
- ✅ Clear priority ordering (todo > habit > journal > idea > log_general > unsorted)
- ✅ Heavy bias toward `log_general` over `unsorted` for meaningful content

### 2. Sacred Golden Test Suite (`lib/cortex/intents/__tests__/masterClassifierSpec.test.ts`)

**149 tests covering:**
- Gibberish detection (14 tests)
- Todo detection (18 tests)
- Habit detection (17 tests)
- Journal detection (17 tests)
- Idea detection (17 tests)
- Full classification (66 tests across 6 categories)

**Test Categories:**
```
✓ TODOS → "todo" (10 golden examples)
✓ HABITS → "habit" (8 golden examples)
✓ LOG - JOURNAL → "log_journal" (7 golden examples)
✓ LOG - IDEA → "log_idea" (9 golden examples)
✓ LOG - GENERAL → "log_general" (7 golden examples)
✓ UNSORTED → "unsorted" (8 golden examples)
✓ Edge cases and priority ordering (6 tests)
```

## Design Decisions

### Priority Order
1. **Todo** - Most specific (actionable tasks)
2. **Habit** - Recurring behaviors
3. **Journal** - Personal reflections/emotions
4. **Idea** - Creative thoughts/brainstorms
5. **Log General** - Default for meaningful content
6. **Unsorted** - Reserved for true gibberish only

### Key Patterns

**Todo Patterns:**
- Imperative verbs at start: `call`, `email`, `buy`, `schedule`, `book`, etc.
- Time-bound: `tomorrow`, `at 3pm`, `by Friday`, `on Saturday`
- **Passive time excluded:** `closes at 5pm`, `lands at 3:45` (informational, not actionable)

**Habit Patterns:**
- Recurrence: `daily`, `every morning`, `3x per week`, `Mondays`
- Behavior change: `quit smoking`, `stop eating`, `start running`
- Tracking: `track mood daily`, `log sleep every night`
- Routines: `morning routine`, `before bed`, `after work`

**Journal Patterns:**
- First-person emotions: `I feel`, `I'm feeling`, `I'm so`
- Reflective: `can't stop thinking`, `today was`, `had a panic attack`
- Emotional adjectives: `overwhelmed`, `anxious`, `grateful`, `proud`

**Idea Patterns:**
- Explicit: `App idea:`, `Feature idea:`, `Business idea:`
- Speculative: `What if we`, `We could`, `Maybe we should`, `Could build`
- Exploratory: `Potential solution`, `Design concept`, `Imagine if`

**Gibberish Detection:**
- Pure numbers: `123`
- Pure symbols: `@@@@@`, `...`
- Repeated characters: `xxx`, `aaa`
- Keyboard mash: `asdfghjkl`, `qwertyuiop`
- Repeated words: `test test test`

## Test Results

```
Test Suites: 1 passed, 1 total
Tests:       149 passed, 149 total
Time:        0.564 s
```

All tests passing ✅

## Edge Cases Handled

1. **Time keywords in journal entries:**
   - `"I'm anxious about tomorrow"` → `todo` (time keyword wins)
   - `"Feeling anxious about the presentation"` → `log_journal` (no time keyword)

2. **Mixed todo/habit patterns:**
   - `"Call mom every Sunday"` → `todo` (imperative verb wins)
   - `"Exercise daily"` → `habit` (no imperative verb)

3. **Passive vs. active time:**
   - `"Coffee shop closes at 5pm"` → `log_general` (passive, not actionable)
   - `"Meeting with team at 2pm"` → `todo` (active appointment)

4. **Idea vs. journal overlap:**
   - `"I'm feeling we could try a new approach"` → `log_idea` (speculative pattern stronger)

## Next Steps (Future Phases)

Phase 0 is **complete and locked**. Future phases will:

1. **Phase 1:** Migrate existing classifiers to use master spec
   - Update `classifyIntentWithAI.ts` to use `MasterCategory`
   - Update `canonicalIntent.ts` to leverage pure heuristics
   - Update `getEffectiveLogSubtype.ts` to align with `log_journal`/`log_idea`/`log_general`

2. **Phase 2:** AI integration layer
   - Combine heuristics + AI confidence scores
   - Apply `MASTER_CLASSIFIER_THRESHOLDS`
   - Implement confidence-based fallbacks

3. **Phase 3:** Gradual rollout
   - Feature flag for new classifier
   - A/B testing
   - Metrics validation

## Files Created

- ✅ `lib/cortex/intents/masterClassifierSpec.ts` (350 lines)
- ✅ `lib/cortex/intents/__tests__/masterClassifierSpec.test.ts` (310 lines)

## Files NOT Changed (Phase 0)

- ❌ `lib/cortex/intents/classifyIntentWithAI.ts` (unchanged)
- ❌ `lib/cortex/intents/canonicalIntent.ts` (unchanged)
- ❌ `lib/cortex/intents/intentRules.ts` (unchanged)
- ❌ `lib/logs/getEffectiveLogSubtype.ts` (unchanged)

Phase 0 establishes the spec without disrupting existing behavior. ✨
