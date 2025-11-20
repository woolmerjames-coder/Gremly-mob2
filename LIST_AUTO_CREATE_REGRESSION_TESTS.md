# List Auto-Creation Regression Test Suite

## Overview
Comprehensive test coverage to prevent regression of list auto-creation fixes.

## Issue Background
Lists like `"- eggs - milk - cereal"` were experiencing multiple bugs:
1. ❌ Not being detected by list heuristic (only newline-separated patterns worked)
2. ❌ Being classified as Todos instead of Logs
3. ❌ Showing timestamp + mood UI (incorrect for lists)
4. ❌ AI-generated titles reverting to raw text on save

## Fix Summary
Enhanced list detection with inline pattern support and strengthened auto-creation logic.

## Test Coverage

### 1. List Heuristics Unit Tests
**File:** `lib/cortex/policy/__tests__/listHeuristics.test.ts`

**Tests Added:**
- ✅ `should detect grocery list with high confidence`
  - Verifies `"- eggs - milk - cereal"` is detected
  - Score >= 0.7 (triggers auto-create)
  
- ✅ `should work with extra whitespace`
  - Handles `"-  eggs  -  milk  -  cereal"`
  - Tolerant of inconsistent spacing
  
- ✅ `should handle mixed case items`
  - Works with `"- Eggs - MILK - Cereal"`
  
**Total:** 17 passing tests

### 2. Cortex Decision Integration Tests
**File:** `lib/cortex/__tests__/cortexDecide.list.autoCreate.test.ts`

**Tests Added:**
- ✅ `should auto-create inline lists as notes (not todos)`
  - Verifies list heuristic overrides AI classification
  - Mode = 'auto' (no chips needed)
  - Action type = 'create.note' (not create.todo)
  
- ✅ `should handle newline-separated lists`
  - Works with traditional `"- eggs\n- milk\n- cereal"`
  - Auto-creates as note
  
- ✅ `should require 3+ items for strong auto-creation`
  - 2 items → score 0.7
  - 3 items → score 0.8
  - Both trigger auto-mode
  
- ✅ `should give higher scores for longer lists`
  - 3 items → score 0.8
  - 6+ items → score 0.9
  - Confidence increases with length
  
- ✅ `should handle lists with extra whitespace`
  - Tolerant of formatting variations
  
- ✅ `should mark canonicalSubtype as list`
  - Metadata includes `canonicalSubtype: 'list'`
  - Canonical hint source: 'list-heuristic'

**Total:** 6 passing tests

### 3. Updated Existing Tests
**File:** `lib/cortex/__tests__/cortexDecide.listHeuristic.test.ts`

**Test Updated:**
- ✅ `auto-creates strong list patterns (checkboxes) as notes`
  - Changed from 'ask' mode to 'auto' mode
  - Checkbox lists (score = 1.0) now auto-create
  - Rationale: Users shouldn't need chips for obvious lists

**Total:** 3 passing tests

## Test Execution

### Run All List Tests
```bash
npx jest --testPathPattern="(listHeuristics|cortexDecide)"
```

**Current Status:** ✅ 26/26 tests passing

### Run Individual Suites
```bash
# List heuristics only
npx jest lib/cortex/policy/__tests__/listHeuristics.test.ts

# Cortex decision tests only
npx jest lib/cortex/__tests__/cortexDecide.list.autoCreate.test.ts
```

## Behavior Verified

### Inline List Detection
**Input:** `"- eggs - milk - cereal"`

**Expected:**
- List heuristic score: 0.8
- Mode: auto
- Action: create.note
- Subtype: list
- UI: No timestamp/mood display

### Newline List Detection
**Input:**
```
- eggs
- milk
- cereal
```

**Expected:**
- List heuristic score: 1.0
- Mode: auto
- Action: create.note
- Subtype: list

### Checkbox List Detection
**Input:**
```
- [ ] Pack passport
- [ ] Charge camera
- [ ] Print tickets
```

**Expected:**
- List heuristic score: 1.0
- Mode: auto
- Action: create.note
- Subtype: list

## Scoring System

### Inline Lists
- 2 items: 0.7 (base score)
- 3 items: 0.8
- 4 items: 0.9
- 5+ items: 0.9+ (capped at 1.0)

Formula: `0.7 + (items - 2) * 0.1`

### Newline Lists
- Score = match_ratio (matches / total_lines)
- 100% match (all lines are list items) → score 1.0

### Threshold for Auto-Create
- **Strong lists:** score >= 0.7 → auto-create as note
- **Weak lists:** score 0.5-0.7 → show chips for confirmation

## Integration Points

### 1. List Detection
- `lib/cortex/policy/listHeuristics.ts`
- Enhanced with inline pattern matching

### 2. Cortex Classification
- `lib/cortex/cortexDecide.ts`
- Strong lists override AI classification
- Auto-create without chips

### 3. Overlay Logic
- `components/overlay/UnifiedOverlayV2.tsx`
- Tag priority checks
- Title preservation
- No journal fallback

### 4. BackgroundPrefill
- `app/screens/CatchAllNotepad.tsx`
- AI generates titles and tags
- #list tag auto-added

## Regression Prevention

These tests prevent regression of:

1. **List Detection:** Inline patterns must be recognized
2. **Classification Override:** Heuristic must override AI when strong
3. **Auto-Create Behavior:** No chips for obvious lists
4. **Subtype Marking:** Lists must be marked with subtype: 'list'
5. **Score Calculation:** Consistent scoring across patterns
6. **Whitespace Tolerance:** Formatting variations handled

## Commits

1. `c43443f` - test: Add comprehensive regression tests for list auto-creation
2. `88451d8` - test: Update cortexDecide listHeuristic test for auto-create behavior

## Branch
`mind-drop-overlay-properfix`

## Status
✅ All tests passing  
✅ No regressions detected  
✅ Comprehensive coverage achieved
