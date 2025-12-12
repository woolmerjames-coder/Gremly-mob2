# Classification Harness Manual Test Checklist

## Pre-requisites
- [ ] App running in dev mode (`npx expo start --dev-client`)
- [ ] `EXPO_PUBLIC_TEST_MODE=true` in `.env.local`
- [ ] Console/Metro logs visible

---

## A. Harness Script Validation

### 1. Run harness (heuristic only)
```bash
npm run harness:classify
```
- [ ] Script completes without crash
- [ ] Summary shows accuracy metrics
- [ ] `src/qa/failures.json` is created if failures exist
- [ ] Exit code is 1 if failures, 0 if all pass

### 2. Run harness with verbose
```bash
npm run harness:classify -- --verbose
```
- [ ] Each test case shows ✅ or ❌
- [ ] Failed tests show expected vs actual

### 3. Run harness with filter
```bash
npm run harness:classify -- --filter-tag edge-case --verbose
```
- [ ] Only edge-case tests run
- [ ] Count matches number of edge-case tests in dataset

---

## B. Boot Probe Validation

### 1. Fresh app boot
- [ ] Kill app completely
- [ ] Start app
- [ ] Check console for 3 `[TEST]` lines:
  - `TEST_CASE_START` with `case: "BOOT_TEST"`
  - `TEST_STEP` with `step: "mounted"`
  - `TEST_CASE_END` with `ok: true`

### 2. Filter boot logs
```bash
grep "\[TEST\]" run.log | grep BOOT_TEST
```
- [ ] Shows boot test events

---

## C. QA Runner Integration

### 1. Start a QA case programmatically
In console or via debug menu:
```javascript
import { QARunner } from './src/qa/QARunner';
QARunner.startCase('manual_test_1', { source: 'manual' });
```
- [ ] Console shows `[TEST] {"case":"manual_test_1"...TEST_CASE_START...}`

### 2. Submit a Mind Drop
- [ ] Type "Buy milk" and submit
- [ ] Console shows `[TEST] {...entity:created...}` step
- [ ] Entity ID is captured

### 3. End the case
```javascript
QARunner.endCase(true, { notes: 'worked' });
```
- [ ] Console shows `TEST_CASE_END` with `lastEntityId`

### 4. Timeout test
```javascript
QARunner.startCase('timeout_test');
// Don't submit anything for 15 seconds
```
- [ ] After 15s, console shows `entity_created_within_timeout: false`
- [ ] Case auto-ends with `ok: false`

---

## D. Invariant Checks

### 1. Submit various entries and check for warnings
- [ ] Submit "Buy milk" - no invariant warnings
- [ ] Submit "I feel grateful today" - no invariant warnings
- [ ] Submit "Meditate every day" - no invariant warnings

### 2. Check invariant logs
```bash
grep "\[INVARIANT" run.log
```
- [ ] No unexpected violations in normal usage

---

## E. Trace Observability

### 1. Check for trace events
```bash
grep "\[TRACE:" run.log
```
- [ ] Trace events appear for each submission (if trace logging enabled)

---

## F. SQL Audit Queries

### 1. Run audit queries in Supabase SQL Editor
Copy queries from `scripts/sql/classification_audit.sql` and run:
- [ ] Query 1 (todos with null title): Returns expected results
- [ ] Query 4 (has_list consistency): No false positives
- [ ] Query 6 (duplicates): No unexpected duplicates
- [ ] Query 10 (drop_id integrity): All recent items have drop_id

---

## G. Edge Cases to Test Manually

### 1. List detection
- [ ] "Things to buy:\n- eggs\n- milk\n- bread" → todo with `has_list: true`
- [ ] "Grocery list: eggs, milk, bread" → todo (may or may not detect list)

### 2. Date extraction
- [ ] "Call mom tomorrow" → todo (enrichment should add due date)
- [ ] "Meeting on Friday at 3pm" → todo with date

### 3. Habit vs Todo
- [ ] "Run" → todo (one-off)
- [ ] "Run every morning" → habit
- [ ] "I should run more" → todo (intent, not recurring)

### 4. Journal vs General log
- [ ] "I feel anxious" → journal
- [ ] "Met Jake for lunch" → general log
- [ ] "WiFi password: abc123" → general log

### 5. Idea detection
- [ ] "Idea: app for tracking mood" → idea
- [ ] "What if we automated reports?" → idea
- [ ] "Great idea!" → may or may not detect as idea

---

## Notes
- Run this checklist after any changes to classification logic
- Document failures in GitHub issues with test case ID
- Update `classification_golden.json` when fixing edge cases
