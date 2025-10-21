# CI Test Fix - Heap Out of Memory

## Problem
GitHub Actions CI tests were **crashing with heap memory exhaustion**, NOT timing out:

```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
<--- Last few GCs --->
[2256:0x8eb5320] 520322 ms: Scavenge 5988.5 (6177.5) -> 5984.3 (6177.5) MB
Aborted (core dumped)
Error: Process completed with exit code 134.
```

Tests were consuming more than 6GB of RAM and crashing before completion.

## Root Cause
Jest test suite was accumulating memory without releasing it:
- Running 54 test suites sequentially without cleanup
- Module caches building up across test files
- React component trees not being garbage collected
- 6GB heap limit insufficient for full test suite in CI environment

## Solutions Implemented

### 1. Increased Heap Limit (`.github/workflows/ci.yml`)
```yaml
- name: Test
  run: npm test -- --ci --runInBand --maxWorkers=1 --forceExit --logHeapUsage
  timeout-minutes: 15  # Increased from 10 to allow for larger heap
  env:
    NODE_OPTIONS: --max-old-space-size=8192  # 8GB instead of 6GB
```

**Changes:**
- Increased heap from 6GB → 8GB
- Added `--logHeapUsage` for visibility into memory consumption
- Added explicit `NODE_OPTIONS` env var for CI (overrides package.json)

### 2. Enable Manual Garbage Collection (`package.json`)
```json
{
  "test": "NODE_OPTIONS='--max-old-space-size=6144 --expose-gc' jest ..."
}
```

**Changes:**
- Added `--expose-gc` flag to enable `global.gc()` calls
- Allows manual triggering of garbage collection between tests

### 3. Jest Memory Management (`jest.config.js`)
```javascript
{
  bail: 1,                          // Exit on first failure
  maxConcurrency: 1,                // One test at a time
  workerIdleMemoryLimit: '512MB',   // NEW: Kill workers using too much memory
  cache: false,                     // NEW: Disable cache to reduce memory
  // ... existing config
}
```

**Changes:**
- `workerIdleMemoryLimit: '512MB'` - Restart workers that use too much memory
- `cache: false` - Disable Jest's transformation cache (uses disk instead of RAM)

### 4. Aggressive Global Cleanup (`__tests__/setup/console.silence.ts`)
```typescript
afterEach(() => {
  // Clear all timers to prevent hanging
  jest.clearAllTimers();
  jest.useRealTimers();
  
  // NEW: Memory management
  jest.clearAllMocks();  // Clear mock caches
  
  // NEW: Force garbage collection if available (CI)
  if (global.gc) {
    global.gc();
  }
});
```

**Changes:**
- Added `jest.clearAllMocks()` to clear mock function caches
- Added `global.gc()` calls to trigger garbage collection after each test
- This runs after every single test (100+ times)

## Expected Behavior

### Before
- ❌ Tests crash with "JavaScript heap out of memory"
- ❌ Exit code 134 (SIGABRT - out of memory)
- ❌ Tests stop partway through suite (~15-20 test files)
- ❌ No visibility into memory consumption

### After
- ✅ Tests complete full suite (54 test files)
- ✅ Heap usage logged for each test file
- ✅ Automatic garbage collection between tests
- ✅ Workers restart if memory exceeds 512MB idle
- ✅ Clear error messages if OOM still occurs

## Testing the Fix

### Local Validation
```bash
# Run tests with CI flags locally
NODE_ENV=test npm test -- --ci --runInBand --maxWorkers=1 --forceExit
```

### CI Validation
1. Push changes to branch
2. Check GitHub Actions tab
3. Watch CI test step complete within 10 minutes
4. Green checkmark ✅ means success

## Troubleshooting

### If Tests Still Crash with OOM

**Option 1: Increase Heap Further**
```yaml
env:
  NODE_OPTIONS: --max-old-space-size=10240  # Try 10GB
```

**Option 2: Split Test Suite**
```yaml
- name: Test (Part 1)
  run: npm test -- __tests__/lib/**

- name: Test (Part 2)  
  run: npm test -- __tests__/components/**
```

**Option 3: Check for Memory Leaks**
```bash
# Run with heap profiling
npm test -- --logHeapUsage --verbose
```

Look for:
- Test files that use >500MB
- Memory not being released between test suites
- Large mock data structures not being cleaned up

### If Tests Pass Locally But Fail in CI

**CI environments have less memory:**
- Local: Often 16-32GB available
- GitHub Actions: ~7GB available
- Need aggressive cleanup for CI

**Debug differences:**
```bash
# Run locally with CI settings
NODE_OPTIONS='--max-old-space-size=8192 --expose-gc' \
  npm test -- --ci --runInBand --maxWorkers=1 --logHeapUsage
```

## Files Modified

1. `.github/workflows/ci.yml` - Increased heap to 8GB, added heap logging
2. `jest.config.js` - Added worker memory limit and disabled cache
3. `__tests__/setup/console.silence.ts` - Added mock cleanup and GC calls
4. `package.json` - Added `--expose-gc` flag to test script

## Commits

**Hash**: `6dfe0e3` - Initial timeout/cleanup fixes (later found to be wrong diagnosis)  
**Hash**: `a0235c0` - **Actual fix**: Heap memory management and aggressive GC

## Related Issues

- **Original Symptom**: Tests "stalling" in CI
- **Actual Problem**: Out of memory crash (exit code 134)
- **MascotIcon tests**: Still skipped (reanimated mocking issue)
- **Test Failures**: 3 failures in `unified-overlay.test.tsx` (unrelated to memory)

## Next Steps

1. ✅ Monitor CI runs to ensure tests complete without OOM
2. 🔄 If successful, merge to main
3. 🔄 Investigate 3 failing tests in `unified-overlay.test.tsx` (separate issue)
4. 🔄 Set up proper reanimated mocking for skipped tests (future)
5. 🔄 Consider splitting test suite if 8GB is still insufficient (future)

## Memory Budget Breakdown

**Total Available (CI)**: ~7GB  
**Heap Limit**: 8GB (will use swap if needed)  
**Per-Worker Idle Limit**: 512MB  
**Expected Peak Usage**: ~5-6GB (with aggressive GC)

---

**Status**: ✅ Deployed to GitHub (commit a0235c0)  
**CI Link**: https://github.com/woolmerjames-coder/Gremly-mob2/actions  
**Branch**: `phase-8/relationships-and-people-linking`

## Key Insight

The original symptom was "tests stalling" but the **actual problem was memory exhaustion**. The tests weren't hanging - they were crashing with exit code 134 (SIGABRT) due to heap overflow. The fix required:

1. **More memory** (6GB → 8GB)
2. **Better cleanup** (clear mocks, manual GC)
3. **Memory visibility** (--logHeapUsage)
4. **Worker limits** (restart if using >512MB idle)

Always check exit codes! `134` = out of memory, not timeout.
