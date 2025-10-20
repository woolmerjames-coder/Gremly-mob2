# Manual QA Checklist

**Purpose:** This checklist covers functionality that is skipped in automated tests due to UI timing issues in the CI environment. All items should be manually verified before production releases.

**When to Use:** 
- Before merging to main/production
- After any UI/UX changes
- When CI passes but you want extra confidence

---

## Pre-Release QA Checklist

### 🎯 **Critical Path** (Must verify every release)

#### 1. Catch-All Notepad (`catchall.notepad.test.tsx` - 9 tests skipped)

**Location:** Hub → Catch-All Tab (or dedicated Catch-All screen if exists)

- [ ] **Guided Mode - Basic Entry**
  - Open Catch-All notepad
  - Verify "Guided" mode is selected by default
  - Enter text: "Test note in guided mode"
  - Press Submit
  - Verify thinking animation appears
  - Verify note saves successfully
  - Verify textarea clears after save

- [ ] **Free Mode - Quick Entry**
  - Switch to "Free" mode
  - Verify Free mode button is highlighted/selected
  - Enter text: "Quick free form note"
  - Press Submit
  - Verify note saves immediately (no thinking animation)
  - Verify textarea clears after save

- [ ] **Mode Switching**
  - Switch from Guided → Free
  - Verify visual indicator updates
  - Switch from Free → Guided
  - Verify visual indicator updates

- [ ] **Submit Button State**
  - Clear textarea completely
  - Verify Submit button is disabled when empty
  - Type any text
  - Verify Submit button becomes enabled

- [ ] **List Formatting (Guided Mode)**
  - In Guided mode, activate "Bullets" toolbar button
  - Type: "First item" and press Enter
  - Type: "Second item"
  - Verify bullet formatting is applied (or auto-formatted on save)

- [ ] **Data Verification**
  - After saving a note, check Hub → Notes tab
  - Verify saved note appears
  - Verify it has label "catchall" (if visible)
  - Open note details
  - Verify `ai_placed: false` (if visible in UI or dev tools)
  - Verify `space_id: null` (unassigned)

---

#### 2. Hub - Item Editing (`hub.edit.test.tsx` - 4 tests skipped)

**Location:** Hub screen → Any tab with items

- [ ] **Open Edit Modal - Habit**
  - Navigate to Hub → Habits tab
  - Tap on any habit item
  - Verify edit modal/overlay opens
  - Verify habit data is pre-filled correctly

- [ ] **Open Edit Modal - Todo**
  - Navigate to Hub → Todos tab
  - Tap on any todo item
  - Verify edit modal/overlay opens
  - Verify todo data is pre-filled correctly

- [ ] **Edit and Save**
  - Open any item for editing
  - Modify the name/title field
  - Save the changes
  - Verify modal closes
  - Verify updated item appears in list with new data
  - Verify `ai_placed: false` is set after manual edit (dev check)

- [ ] **Edit Modal - Note**
  - Navigate to Hub → Notes tab
  - Tap on any note
  - Verify note displays with correct testID structure
  - Verify can edit/view note content

---

#### 3. Hub - Search & Empty States (`hub.search.test.tsx` - 3 tests skipped)

**Location:** Hub screen with search bar

- [ ] **Empty State - Empty Tab**
  - Navigate to a tab with no items (or delete all items)
  - Verify empty state message appears
  - Verify message is appropriate ("No habits yet", "No todos", etc.)

- [ ] **Empty State - Journal Tab**
  - Navigate to Journal tab (if empty)
  - Verify journal-specific empty state appears

- [ ] **Search Clear on Tab Switch**
  - Enter search text in search bar
  - Verify items are filtered
  - Switch to a different tab
  - Verify search is cleared (or appropriately maintained)
  - Switch back to original tab
  - Verify search behavior is correct

---

### 🔔 **Important** (Should verify for major releases)

#### 4. Today Screen (`today.ds.test.tsx` - 4 tests skipped)

**Location:** Today tab (bottom navigation)

- [ ] **Habits Section Display**
  - Navigate to Today screen
  - Verify habits section appears with correct testID
  - Verify habits due today are displayed
  - Verify habit names/titles are visible and correct

- [ ] **Todos Section Display**
  - Verify todos section appears with correct testID
  - Verify todos due today are displayed
  - Verify todo names/titles are visible and correct

- [ ] **Empty State - No Items Due**
  - Clear all items due today (or test on new account)
  - Verify empty state message appears
  - Verify message is encouraging/appropriate

---

#### 5. Overlay - Save Flows (`unified-overlay-comprehensive.test.tsx` - 8 tests skipped)

**Location:** Manual Add overlay (+ button)

- [ ] **Todo with Due Date/Time**
  - Open Manual Add overlay
  - Select "Todo" type
  - Enter name: "Test todo with due date"
  - Set due_date to today
  - Set due_time to specific time (e.g., 3:00 PM)
  - Save
  - Verify todo is created
  - Verify due_date and due_time are saved correctly

- [ ] **Journal with Mood**
  - Open Manual Add overlay
  - Select "Journal" type
  - Select a mood (e.g., "Ecstatic")
  - Enter journal entry text
  - Save
  - Verify journal entry is created
  - Verify mood is saved correctly

- [ ] **Journal - Validation**
  - Open Manual Add overlay
  - Select "Journal" type
  - Do NOT select mood
  - Enter entry text
  - Verify Save button is DISABLED
  - Select a mood
  - Verify Save button becomes ENABLED

- [ ] **Formatting Toggle**
  - Open Manual Add overlay for Note
  - Enter text in body field
  - Toggle "Bullets" formatting
  - Verify formatting is applied (or indicator shows active)
  - Save
  - Verify note has formatting applied

- [ ] **Person Entry**
  - Open Manual Add overlay
  - Select "Person" type
  - Enter name: "Test Person"
  - Enter notes in body field
  - Apply formatting if available
  - Save
  - Verify person is created with notes

---

#### 6. Overlay - Edit Mode (`unified-overlay.test.tsx` - 2 tests skipped)

**Location:** Edit any existing item

- [ ] **Edit Habit - AI Button Hidden**
  - Create or select an AI-placed habit
  - Open for editing
  - Verify AI classification button is hidden (or disabled)
  - Make changes and save
  - Verify changes are persisted

- [ ] **Edit Todo**
  - Open any todo for editing
  - Verify in edit mode (not create mode)
  - Modify todo details
  - Save
  - Verify changes are applied

---

### 📝 **Nice to Have** (Verify when relevant)

#### 7. Overlay - Validation Hints (`overlay-core.test.tsx` - 2 tests skipped)

**Location:** Manual Add overlay

- [ ] **Validation Hints - Invalid Data**
  - Open Manual Add overlay
  - Select "Habit" type
  - Leave name field empty
  - Try to save (or check if validation hint appears)
  - Verify error message/hint appears
  - Fill in name field
  - Verify error message disappears

- [ ] **Validation Hints - All Types**
  - Test validation hints for:
    - Todo (missing name)
    - Habit (missing name or frequency)
    - Journal (missing mood or entry)
  - Verify appropriate error messages appear

---

#### 8. Validation & Toast (`validation-save-button.test.tsx` - 1 test skipped)

**Location:** Any save operation

- [ ] **Toast Notification**
  - Create any item (todo, habit, note, etc.)
  - Save successfully
  - Verify toast notification appears
  - Verify message says "Saved to the Hub" (or similar)
  - Verify toast disappears after timeout

---

## Data Integrity Checks

### After completing above tests, verify in Hub:

- [ ] **All Created Items Appear**
  - Check Hub → All tabs
  - Verify every item created during testing appears
  - Verify items are in correct tabs

- [ ] **Data Accuracy**
  - Open several edited items
  - Verify changes were persisted correctly
  - Verify no data corruption

- [ ] **Filtering Works**
  - Use search to find created items
  - Verify search returns correct results
  - Test tag filtering if available
  - Test scope filtering if available

---

## Test Account Setup

**Recommended:** Use a dedicated test account for QA

1. **Create Test Account:** `qa-test@example.com`
2. **Populate with Sample Data:**
   - 5-10 habits (some due today, some not)
   - 5-10 todos (some due today, some not)
   - 5-10 notes (some from catch-all, some manual)
   - 3-5 journal entries
   - 2-3 people

3. **Keep Test Data Varied:**
   - AI-placed items (from AI classification)
   - Manually added items
   - Items with different frequencies
   - Items with/without due dates
   - Items with/without reminders

---

## Known Issues / Acceptable Deviations

### Why These Tests Are Skipped:

All skipped tests have **timeout issues in CI environment** due to:
- Component rendering delays in test environment
- Modal opening animations
- waitFor() timing issues
- React Native Testing Library limitations

### What's Still Covered by Automated Tests:

✅ **Business Logic:** 200+ passing tests
✅ **Data Operations:** 100+ passing tests  
✅ **Form Fields:** 50+ passing tests
✅ **Validation:** 50+ passing tests

**This checklist covers the ~33 UI timing tests that are skipped.**

---

## Checklist Usage

### Before Each Release:

1. **Run Full Automated Test Suite**
   ```bash
   npm test
   ```
   Verify: All test suites pass (with expected skips)

2. **Run This Manual QA Checklist**
   - Mark each item as you test
   - Note any failures or issues
   - Fix issues before release

3. **Document Results**
   - Date tested: ________________
   - Tester: ________________
   - Build/Commit: ________________
   - All items passed: ☐ Yes ☐ No
   - Issues found: ________________

---

## Quick Reference: What's Skipped vs Tested

| Functionality | Automated Tests | Manual QA |
|---------------|----------------|-----------|
| **Data validation** | ✅ Tested | Optional |
| **Save/update logic** | ✅ Tested | Optional |
| **Business rules** | ✅ Tested | Optional |
| **UI rendering** | ❌ Skipped | ✅ Required |
| **Modal opening** | ❌ Skipped | ✅ Required |
| **Empty states** | ❌ Skipped | ✅ Required |
| **Toast notifications** | ❌ Skipped | ✅ Required |
| **Animations** | ❌ Skipped | ⚠️ Nice to have |

---

## Automation Future

### Potential Improvements:

1. **E2E Testing with Detox/Maestro**
   - Could automate these manual checks
   - Would run on real devices/simulators
   - More reliable than Jest + RNTL for UI

2. **Increase Test Timeouts**
   - Could restore some skipped tests
   - Trade-off: Slower CI runs

3. **Mock Heavy Components**
   - Could speed up some tests
   - Trade-off: Less realistic testing

**For now: Manual QA is the most reliable approach for these UI flows.**

---

## Contact

Questions about this checklist? See:
- `docs/TEST_COVERAGE_ANALYSIS.md` - Full analysis of test coverage
- `docs/test-skipping-summary.md` - History of skipped tests
- GitHub Issues - Report any QA findings

