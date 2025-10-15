# Test Skipping & GitHub Issue - Summary

**Date:** October 15, 2025  
**Branch:** feat/models-cortex-interfaces  
**Status:** ✅ COMPLETE

---

## 🎯 Objective

Skip two failing React Native rendering tests that are unrelated to Phase 3 data layer work, and create a GitHub issue to track fixing the Jest + React Native test runtime.

---

## ✅ Actions Completed

### 1. Renamed Failing Test Files

**Before:**
- `__tests__/Button.test.tsx`
- `__tests__/Tabs.test.tsx`

**After:**
- `__tests__/Button.skip.test.tsx`
- `__tests__/Tabs.skip.test.tsx`

### 2. Added TODO Comments

Both files now have at the top:
```tsx
// TODO(james): Unskip after RN test runtime is stabilized (see issue #1).
```

### 3. Updated Jest Configuration

**File:** `jest.config.js`

**Added to `testPathIgnorePatterns`:**
```javascript
'.*\\.skip\\.test\\.(ts|tsx|js)$'
```

This regex pattern excludes any test file with `.skip.test.` in its name.

### 4. Created Issue Documentation

**File:** `docs/github-issue-rn-test-runtime.md`

Complete GitHub issue template with:
- Problem description
- Steps to reproduce
- Root cause analysis
- Proposed solution (4-part fix)
- Acceptance criteria
- Additional context

**Proposed Issue Title:**
```
Unskip RN rendering tests — stabilize Jest + RN runtime
```

---

## 📊 Test Results

### Before Changes
```bash
npm test
# Result: 4 passed, 2 failed (Button, Tabs)
# Exit code: 1 ❌
```

### After Changes
```bash
npm test
# Result: 4 passed, 4 total
# Exit code: 0 ✅
```

### Full CI
```bash
npm run ci  # lint + typecheck + test
# Result: All checks pass ✅
# Exit code: 0 ✅
```

---

## 🔍 Root Cause of Test Failures

**Error:**
```
SyntaxError: Cannot use import statement outside a module
```

**Cause:**
1. React Native uses ESM imports
2. NativeWind imports React Native modules
3. Jest's Node environment doesn't transform these modules
4. Missing `transformIgnorePatterns` configuration
5. Missing proper Jest preset for React Native/Expo

**Not a Phase 3 Issue:**
- All Phase 3 data layer tests pass (schemas, repo, heuristic engine)
- This is a test infrastructure/configuration issue
- Components themselves work fine in the app

---

## 🛠️ Proposed Fix (from GitHub Issue)

### 1. Update `jest.config.js`
- Use `jest-expo` preset
- Add proper `transformIgnorePatterns` for RN modules
- Add `moduleNameMapper` for CSS mocks
- Add setup file reference

### 2. Create `jest.setup.js`
- Mock `react-native-reanimated`
- Mock `NativeAnimatedHelper`
- Mock NativeWind if needed

### 3. Use `@testing-library/react-native`
- Already installed in project
- Provides proper RN component rendering utilities
- Update tests to use `render()` from testing library

### 4. Update `babel.config.js`
- Add test environment configuration
- Include CommonJS transform plugin for tests

---

## 📁 Files Modified

### Modified (3 files)
1. `__tests__/Button.skip.test.tsx` - Added TODO comment
2. `__tests__/Tabs.skip.test.tsx` - Added TODO comment
3. `jest.config.js` - Added skip pattern to `testPathIgnorePatterns`

### Created (2 files)
4. `docs/github-issue-rn-test-runtime.md` - GitHub issue template
5. `docs/test-skipping-summary.md` - This file

---

## 📋 Jest Config Changes

**Before:**
```javascript
testPathIgnorePatterns: [
  '/node_modules/',
  '<rootDir>/__tests__/pending/',
],
```

**After:**
```javascript
testPathIgnorePatterns: [
  '/node_modules/',
  '<rootDir>/__tests__/pending/',
  '.*\\.skip\\.test\\.(ts|tsx|js)$',
],
```

---

## 🎯 Why This Approach

### ✅ Pros of Skipping
1. **Unblocks Phase 3** - Data layer work can proceed without test failures
2. **CI Passes** - All checks now green
3. **Documented** - Issue template created with full solution
4. **Traceable** - TODO comments reference issue number
5. **Reversible** - Easy to unskip when runtime is fixed

### ⚠️ Tradeoffs
1. Temporarily reduced test coverage for design system components
2. Relies on manual testing for Button/Tabs components
3. Must remember to unskip later (mitigated by TODO comments)

---

## 🚀 Next Steps

### To Fix (Future Work)
1. Create actual GitHub issue using the template in `docs/github-issue-rn-test-runtime.md`
2. Implement 4-part solution from issue
3. Verify tests pass
4. Rename `.skip.test.tsx` back to `.test.tsx`
5. Remove skip pattern from `jest.config.js`
6. Update TODO comments to mark as resolved

### Priority
**Medium** - Not blocking Phase 3 work, but should be addressed before Phase 4 (Supabase integration) to ensure full test coverage.

---

## 📝 Manual Testing Required

Since Button and Tabs tests are skipped, ensure manual testing:

### Button Component
- [ ] Renders with different variants (primary, secondary, outline, ghost)
- [ ] Responds to press events
- [ ] Shows correct styles (mint colors, rounded corners)
- [ ] Works with icons

### Tabs Component
- [ ] Renders tab list correctly
- [ ] Active tab highlighted
- [ ] Tab switching works
- [ ] Content panels display properly

---

## ✅ Verification Checklist

- [x] Failing tests renamed to `.skip.test.tsx`
- [x] TODO comments added with issue reference
- [x] Jest config updated to exclude skip files
- [x] All tests pass (`npm test`)
- [x] All CI checks pass (`npm run ci`)
- [x] GitHub issue template created
- [x] Documentation updated
- [x] No Phase 3 files modified

---

**All tasks complete!** Phase 3 data layer has clean test suite, and RN test runtime fix is fully documented for future work. ✅
