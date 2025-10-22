# CI Fix: Pending Tests Exclusion for PR #17

**Date**: January 2025  
**Branch**: `phase-10/cortex-on`  
**Commit**: `a28c0a7`  
**Status**: ✅ **FIXED & PUSHED**

---

## Problem

CI was failing with async errors in `__tests__/pending/hub.ds.test.tsx`:

```
FAIL __tests__/pending/hub.ds.test.tsx
  ● Test suite failed to run
  ● Hub DS Screen › renders filter chips and search input
    
Error in @babel/runtime/helpers/asyncToGenerator.js
```

The test was looking for testIDs that don't exist:
- `tab-all` ❌ (doesn't exist)
- `tab-catch-all` ❌ (doesn't exist)

Current implementation uses:
- `tab-habits` ✅
- `tab-to-dos` ✅  
- `tab-journal` ✅
- `tab-notes` ✅
- `tab-people` ✅

---

## Root Cause

**Two issues**:

### 1. CI Override of testPathIgnorePatterns

The `jest.config.js` correctly excludes pending tests:
```javascript
testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/pending/']
```

But the CI workflow was **overriding** this with its own pattern:
```yaml
--testPathIgnorePatterns='__tests__/(today\.ds|today\.grouping)\.test\.tsx'
```

When you pass `--testPathIgnorePatterns` on the CLI, it **replaces** (not appends) the config value, so pending tests were being run.

### 2. Outdated Test Expectations

The pending tests reference an old UI structure with different tabs:
- Old: All, Habits, To-Dos, Journal, Catch-All
- Current: Habits, To-Dos, Journal, Notes, People

---

## Solution Applied

### 1. Updated CI Workflow (`.github/workflows/ci.yml`)

**Before**:
```yaml
--testPathIgnorePatterns='__tests__/(today\.ds|today\.grouping)\.test\.tsx'
```

**After**:
```yaml
--testPathIgnorePatterns='/node_modules/|__tests__/pending/|__tests__/(today\.ds|today\.grouping)\.test\.tsx'
```

This ensures pending tests are excluded in CI, matching the intent of jest.config.js.

### 2. Updated Test to Match Current Implementation

Fixed `__tests__/pending/hub.ds.test.tsx` line 175:

**Before** (checking all at once):
```typescript
await waitFor(() => {
  expect(screen.getByTestId('tab-all')).toBeTruthy();  // ❌ doesn't exist
  expect(screen.getByTestId('tab-habits')).toBeTruthy();
  expect(screen.getByTestId('tab-to-dos')).toBeTruthy();
  expect(screen.getByTestId('tab-journal')).toBeTruthy();
  expect(screen.getByTestId('tab-catch-all')).toBeTruthy();  // ❌ doesn't exist
  expect(screen.getByTestId('hub-search')).toBeTruthy();
});
```

**After** (individual checks, correct testIDs):
```typescript
// Current implementation uses: Habits, To-Dos, Journal, Notes, People
await waitFor(() => {
  expect(screen.getByTestId('tab-habits')).toBeTruthy();
});

await waitFor(() => {
  expect(screen.getByTestId('tab-to-dos')).toBeTruthy();
});
// ... and so on
```

**Why separate waitFor blocks?**
- Better error isolation (know exactly which element fails)
- Handles async rendering more reliably
- Matches testing-library best practices

---

## Why "Pending" Tests?

The `__tests__/pending/` directory contains:
1. Tests for features not yet implemented
2. Tests for old UI that needs updating
3. Tests that are flaky or need refactoring

They're excluded by design to not block CI while allowing developers to work on them.

---

## Verification

✅ **Local tests pass**: 550 tests, 59 skipped  
✅ **TypeScript compilation**: Clean  
✅ **ESLint**: No new warnings  
✅ **Committed**: `a28c0a7`  
✅ **Pushed**: To `origin/phase-10/cortex-on`

---

## Expected CI Result

The CI should now:
1. ✅ Skip all tests in `__tests__/pending/`
2. ✅ Run 550 active tests successfully
3. ✅ Show green checkmark on PR #17
4. ✅ Allow merge to main

---

## Remaining Pending Test Issues

The pending directory has other references to `tab-catch-all` (8 occurrences):
- Line 305
- Line 356  
- Line 358
- Line 460

These tests need updating when the pending tests are reactivated, but they won't run in CI now.

---

## Monitor CI

Check CI status:
- **PR #17**: https://github.com/woolmerjames-coder/Gremly-mob2/pull/17  
- **Latest commit**: https://github.com/woolmerjames-coder/Gremly-mob2/commit/a28c0a7

Expected completion: ~2 minutes

---

## Summary of All Fixes for PR #17

| Issue | Commit | Status |
|-------|--------|--------|
| Import paths (./utils → ../utils) | `9a08066` | ✅ Fixed |
| CI running pending tests | `a28c0a7` | ✅ Fixed |
| Outdated test expectations | `a28c0a7` | ✅ Fixed |

**Status**: ✅ **READY TO MERGE** (once CI completes)
