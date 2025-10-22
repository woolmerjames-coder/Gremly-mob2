# Pending Tests Import Path Fix

**Date**: January 2025  
**Issue**: CI failing on PR #97 (phase-10/cortex-on branch)  
**Branch Fixed**: `fix/unified-overlay-edit-mode`

---

## Problem

CI on PR #97 shows 3 failing test suites in `__tests__/pending/`:
- `hub.ds.test.tsx`
- `hub.edit.test.tsx`  
- `catchall.notepad.test.tsx`

**Error**: `Cannot find module './utils/renderWithProviders'`

---

## Root Cause

These test files are in the `__tests__/pending/` subdirectory, but were importing from:
```typescript
import { renderWithProviders } from './utils/renderWithProviders';  // ❌ WRONG
```

Since they're in a subdirectory, the correct path should be:
```typescript
import { renderWithProviders } from '../utils/renderWithProviders';  // ✅ CORRECT
```

---

## Fix Applied

### Files Fixed
1. `__tests__/pending/hub.ds.test.tsx` - Line 9
2. `__tests__/pending/hub.edit.test.tsx` - Line 9
3. `__tests__/pending/catchall.notepad.test.tsx` - Line 2

### Changes
```diff
- import { renderWithProviders, screen, waitFor, fireEvent } from './utils/renderWithProviders';
+ import { renderWithProviders, screen, waitFor, fireEvent } from '../utils/renderWithProviders';
```

---

## Important Notes

### Local vs CI Behavior

**Locally**: These tests are IGNORED via `jest.config.js`:
```javascript
testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/pending/']
```

**On CI (PR #97)**: Tests are being run, which suggests either:
1. The PR #97 branch doesn't have pending tests in ignore patterns
2. The CI explicitly runs them
3. The ignore pattern isn't working in CI environment

### Status on Different Branches

| Branch | Status | Notes |
|--------|--------|-------|
| `fix/unified-overlay-edit-mode` | ✅ Fixed | Import paths corrected in commits `98bd65e` and `8c2edd9` |
| `phase-10/cortex-on` (PR #97) | ❌ Failing | Still has old import paths |
| `main` | ❓ Unknown | Need to check if issue exists there |

---

## Next Steps

### Option 1: Merge fix into PR #97
```bash
# Switch to phase-10/cortex-on branch
git checkout phase-10/cortex-on

# Cherry-pick the fix commit
git cherry-pick 8c2edd9

# Push to trigger CI rerun
git push
```

### Option 2: Apply fix directly to PR #97 branch
```bash
# Switch to the branch
git checkout phase-10/cortex-on

# Make the same changes to the 3 files
# Change ./utils to ../utils in imports

# Commit and push
git add __tests__/pending/*.tsx
git commit -m "fix(tests): correct import paths in pending tests"
git push
```

### Option 3: Keep tests ignored
If these tests aren't meant to run in CI, ensure `jest.config.js` has:
```javascript
testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/pending/']
```

And CI doesn't override this configuration.

---

## Verification

To test if the fix works locally (bypassing ignore):
```bash
NODE_ENV=test npx jest __tests__/pending/hub.ds.test.tsx --testPathIgnorePatterns="/node_modules/" 
```

---

## Related Commits

- `8c2edd9` - Fixed import paths on fix/unified-overlay-edit-mode branch
- `44e35ed` - Previous attempt to fix import paths on phase-10/cortex-on (incomplete)

---

**Recommendation**: Cherry-pick commit `8c2edd9` into the `phase-10/cortex-on` branch to fix PR #97's CI failures.
