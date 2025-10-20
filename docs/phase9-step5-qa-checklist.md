# Phase 9 Step 5 — QA Checklist

**Feature:** Today v2 — Suggestions, Copy Variants & Analytics  
**Version:** v0.4.0  
**Date:** 2025-01-15

---

## Pre-QA Setup

### Environment Configuration

- [ ] Copy `.env.example` to `.env` if not already present
- [ ] Set feature flags:
  ```bash
  EXPO_PUBLIC_TODAY_SUGGESTIONS=on
  EXPO_PUBLIC_TODAY_CELEBRATION=on
  ```

### Dev Override (Optional)

To force a specific time window for testing:

```bash
# Test morning greeting/suggestions
EXPO_PUBLIC_DEBUG_TODAY_TIMEWINDOW=morning

# Test midday greeting/suggestions
EXPO_PUBLIC_DEBUG_TODAY_TIMEWINDOW=midday

# Test evening greeting/suggestions
EXPO_PUBLIC_DEBUG_TODAY_TIMEWINDOW=evening
```

Restart Expo after changing env vars.

---

## Functional Testing

### 1. Copy Variants

**Objective:** Verify that copy rotates deterministically based on day-of-year

#### Greeting Variants
- [ ] Open Today screen, note the greeting message
- [ ] Change device date to tomorrow, restart app
- [ ] Verify greeting text changes (should cycle through 3 variants)
- [ ] Test all 3 time windows (morning, midday, evening) using `EXPO_PUBLIC_DEBUG_TODAY_TIMEWINDOW`

#### Subline Variants
- [ ] Open Today screen, note the subline text below greeting
- [ ] Change device date, restart app
- [ ] Verify subline text changes (should cycle through 3 variants per time window)

#### Toast Variants
- [ ] Complete a habit, note the toast message
- [ ] Complete another habit, verify toast message rotates
- [ ] Complete a todo, verify todo-specific toast
- [ ] Complete journal entry (if available), verify journal-specific toast

### 2. Suggestions Engine

**Objective:** Verify smart suggestions appear based on heuristics

#### Journal Nudge
- [ ] Open Today in **evening** window (`EXPO_PUBLIC_DEBUG_TODAY_TIMEWINDOW=evening`)
- [ ] Ensure journal hasn't been completed today
- [ ] Verify "Reflect on your day" suggestion appears
- [ ] Tap suggestion, verify journal overlay opens

#### Prep Nudge
- [ ] Open Today in **evening** window
- [ ] Ensure at least 1 todo exists in week view (7-day window)
- [ ] Verify "Prep for tomorrow" suggestion appears
- [ ] Tap suggestion, verify todo overlay opens with space name prefilled

#### Easy Habit Nudge
- [ ] Create a habit with `difficulty: 'easy'`
- [ ] Ensure habit is **not** completed today
- [ ] Open Today screen
- [ ] Verify habit suggestion appears with CTA "Start small: [habit name]"
- [ ] Tap suggestion, verify habit overlay opens with habit name prefilled

#### Suggestion Cap
- [ ] Ensure conditions exist for >3 suggestions (journal + prep + multiple easy habits)
- [ ] Open Today screen
- [ ] Verify **at most 3 suggestions** appear

### 3. Feature Flags

**Objective:** Verify feature flags control visibility

#### Suggestions Flag
- [ ] Set `EXPO_PUBLIC_TODAY_SUGGESTIONS=off`
- [ ] Restart app
- [ ] Open Today screen
- [ ] Verify **no suggestions appear** in Today Suggestions section

- [ ] Set `EXPO_PUBLIC_TODAY_SUGGESTIONS=on`
- [ ] Restart app
- [ ] Verify suggestions **do appear** (if heuristics are met)

#### Celebration Flag
- [ ] Set `EXPO_PUBLIC_TODAY_CELEBRATION=off`
- [ ] Restart app
- [ ] Complete a habit or todo
- [ ] Verify **no celebration overlay** appears

- [ ] Set `EXPO_PUBLIC_TODAY_CELEBRATION=on`
- [ ] Restart app
- [ ] Complete a habit or todo
- [ ] Verify **celebration overlay appears** with toast

### 4. Analytics Events

**Objective:** Verify analytics events are emitted (check dev console or analytics tool)

- [ ] Open Today screen → Verify `TodayViewOpened` event
- [ ] Complete a habit → Verify `TodayCompleteHabit` event
- [ ] Complete a todo → Verify `TodayCompleteTodo` event
- [ ] Undo a completion (via celebration overlay) → Verify `TodayUndoCompletion` event
- [ ] Accept a suggestion → Verify `TodaySuggestionAccept` event with type (journal/todo/habit)

---

## Accessibility Testing

### Reduced Motion

**Objective:** Verify animations respect reduced-motion preferences

- [ ] Enable "Reduce Motion" in device accessibility settings (iOS: Settings → Accessibility → Motion → Reduce Motion)
- [ ] Restart app
- [ ] Complete a habit → Verify no "pop" animation on card
- [ ] Complete a todo → Verify no "pop" animation on card
- [ ] Open celebration overlay → Verify modal uses `animationType='none'` (no fade)
- [ ] Toggle mascot wave → Verify no wave animation plays
- [ ] Expand/collapse Today section → Verify no spring animation

---

## Edge Cases

### Time Window Boundaries

- [ ] Test at 11:59 AM (morning → midday boundary)
- [ ] Test at 4:59 PM (midday → evening boundary)
- [ ] Verify greeting/subline update correctly after boundary

### Empty States

- [ ] Test with **no habits** → Verify easy habit suggestion doesn't appear
- [ ] Test with **no todos** → Verify prep suggestion doesn't appear
- [ ] Test in **morning** → Verify journal suggestion doesn't appear (evening only)

### Suggestion Accept with Missing Data

- [ ] Delete all todos, accept prep suggestion → Verify overlay opens gracefully with fallback
- [ ] Delete habit, accept habit suggestion → Verify overlay opens gracefully

---

## Regression Testing

**Objective:** Ensure Phase 9 Step 5 changes don't break existing functionality

- [ ] Test manual add flow (Habit, Todo, Journal) via `+` FAB
- [ ] Test habit completion without suggestions enabled
- [ ] Test todo completion without celebration enabled
- [ ] Test mascot animations (wave, tick)
- [ ] Test debug refresh button (if `JEST_WORKAROUND=1`)

---

## Performance

- [ ] Open Today screen with 10+ habits/todos → Verify no lag
- [ ] Scroll Today sections → Verify smooth 60fps
- [ ] Toggle suggestions on/off → Verify instant re-render

---

## Sign-Off

### Automated Tests

- [ ] Run `npm test` → Verify **39/39 tests pass**
- [ ] Run `npm run typecheck` → Verify no TypeScript errors
- [ ] Run `npm run lint` → Verify no linting errors

### Manual QA

- [ ] All functional tests pass
- [ ] All accessibility tests pass
- [ ] All edge cases handled
- [ ] No regressions found

### Approvals

**QA Lead:** ________________ **Date:** ________  
**Product Owner:** ________________ **Date:** ________  

---

## Notes

**Known Limitations (Phase 9 Step 5):**
- `streakCount` always returns 0 (Phase 10: Habit History)
- `hasJournalToday` always false (Phase 10: Journal Entries)
- `weekTodos` returns empty array (Phase 11: Week View)

**Future Enhancements (Phase 12):**
- Long-press context menu on cards
- Confetti/Lottie animation in celebration overlay
- Advanced suggestion heuristics (time-based, streak-based)
