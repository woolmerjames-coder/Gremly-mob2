# Error Handling Strategy

## Problem
CI tests were failing because error handling wasn't comprehensive enough. When the Cortex engine failed, errors would propagate up instead of returning deterministic fallback responses that tests could assert on.

## Root Cause Analysis

### The Failure Chain
1. **Primary path**: `cortexDecide()` calls `createCortexEngine().classify()`
2. **First fallback**: If cortexDecide fails, call `tryDirectWorkerCall()`
3. **Second fallback**: If worker call fails, return safe fallback
4. **Problem**: Tests mock the engine to reject, expecting pipeline to handle it gracefully

### What Was Missing
- `tryDirectWorkerCall()` had its own catch block returning "Break that down for me?"
- The outer pipeline catch was wrapping the wrong call
- No consistent fallback message across all failure paths
- Test expectations: `mode='ask'`, `actions=[]`, text contains "Let's explore"

## Solution: Three-Layer Error Handling

### Layer 1: cortexDecide() Try/Catch
```typescript
try {
  raw = await cortexDecide(input, ctx);
} catch (error) {
  // Log and proceed to Layer 2
}
```

### Layer 2: tryDirectWorkerCall() Try/Catch
```typescript
try {
  // Attempt direct worker call with full context
  raw = await tryDirectWorkerCall(input, ctx, fallbackContext);
} catch (fallbackError) {
  // Log both errors and proceed to Layer 3
}
```

### Layer 3: Ultimate Fallback
```typescript
// Both cortexDecide and tryDirectWorkerCall failed
return {
  mode: 'ask',
  actions: [],
  suggestions: [],
  replyText: "Let's explore that together — I couldn't analyze that automatically.",
  explanation: undefined,
  confidence: 0,
};
```

### Internal Worker Fallback
`tryDirectWorkerCall()` also has its own internal fallback:
```typescript
// Inside tryDirectWorkerCall catch block
return {
  actions: [],
  mode: 'ask',
  replyText: "Let's explore that together — I couldn't analyze that automatically.",
  suggestions: [],
  explanation: undefined,
  confidence: 0,
  meta: { fallback: 'exploration', workerFallback: true },
};
```

## Standardized Fallback Response

**All failure paths now return the SAME deterministic response:**

```typescript
{
  mode: 'ask',               // Never auto, always ask user
  actions: [],               // No actions when engine fails
  suggestions: [],           // No suggestions
  replyText: "Let's explore that together — I couldn't analyze that automatically.",
  explanation: undefined,    // No explanation (avoids "Catch-All" leakage)
  confidence: 0,            // Zero confidence for failures
}
```

### Why This Message?
- ✅ Contains "Let's explore" (test requirement)
- ✅ No "Catch-All" copy (test requirement)
- ✅ User-friendly and conversational
- ✅ Sets expectation that manual exploration is needed
- ✅ Aligns with brand voice (supportive, collaborative)

## Test Coverage

### Key Test: `conversation.rules.test.ts`
```typescript
it('suppresses catch-all explanation when engine fails', async () => {
  // Mock engine to throw error
  createCortexEngine.mockReturnValue({
    classify: jest.fn().mockRejectedValue(new Error('Engine error')),
  });

  const result = await runConversationPipeline({ text: 'test' }, mockContext);

  expect(result.actions).toEqual([]);
  expect(result.mode).toBe('ask');
  expect(`${result.explanation ?? ''} ${result.replyText ?? ''}`.trim())
    .toContain("Let's explore");
  expect(result.explanation).not.toMatch(/Catch-?All/i);
  expect(result.replyText).not.toMatch(/Catch-?All/i);
});
```

## Best Practices Going Forward

### 1. **Catch Errors at the Right Level**
- ❌ Don't let errors bubble up to React components
- ✅ Catch at the pipeline level
- ✅ Return deterministic fallbacks that satisfy UI contracts

### 2. **Log for Debugging, Don't Throw**
```typescript
catch (error) {
  console.error('[CORTEX] Engine failed:', error.message);
  // Return fallback instead of throwing
  return SAFE_FALLBACK;
}
```

### 3. **Standardize Fallback Messages**
- Define constants for fallback responses
- Use the same message across all failure paths
- Match test expectations exactly

### 4. **Test All Failure Paths**
```typescript
// Test primary path failure
it('handles cortexDecide failure', ...);

// Test secondary path failure  
it('handles worker call failure', ...);

// Test complete failure (both paths)
it('handles complete engine failure', ...);
```

### 5. **Avoid Cascading Catches**
- ❌ Don't have multiple catch blocks that re-throw
- ✅ Each catch should return a safe fallback
- ✅ Outer catches should handle "both failed" scenario

## Error Handling Checklist

When adding new async operations to pipelines:

- [ ] Wrap in try/catch
- [ ] Log error with context for debugging
- [ ] Return deterministic fallback matching UI contract
- [ ] Add test that mocks the operation to fail
- [ ] Verify test assertions match fallback response
- [ ] Document expected behavior in comments
- [ ] Use standard fallback message when appropriate

## Example: Adding New Pipeline Step

```typescript
// ❌ Bad: No error handling
const result = await newRiskyOperation();

// ✅ Good: Comprehensive error handling
let result;
try {
  result = await newRiskyOperation();
} catch (error) {
  console.error('[CORTEX] newRiskyOperation failed:', {
    error: error.message,
    input: input.text?.substring(0, 50),
    context: { userId: ctx.userId, spaceId: ctx.spaceId },
  });
  
  // Return safe fallback that satisfies downstream expectations
  result = {
    // ... standardized fallback fields
  };
}
```

## Files Impacted

### Primary Changes
- `lib/cortex/pipelines/conversation.ts` (Lines 485-537)
  - Added nested try/catch around `tryDirectWorkerCall`
  - Standardized fallback message in both locations
  - Added comprehensive error logging

### Test Files
- `__tests__/cortex/conversation.rules.test.ts`
  - Validates engine failure handling
  - Ensures no "Catch-All" copy leaks
  - Checks for "Let's explore" in fallback

## Monitoring & Debugging

### Production Logs to Watch
```typescript
console.error('[CORTEX] Engine failed completely, returning exploration fallback:', {
  primaryError: error.message,
  fallbackError: fallbackError.message,
});
```

### Development Logs
```typescript
if (__DEV__) {
  console.log('[CORTEX] cortexDecide failed, trying direct worker call', error);
}
```

### Telemetry Points
- Track frequency of engine failures
- Monitor which error types are most common
- Alert if failure rate exceeds threshold
- Log user context when failures occur

## Related Commits

- `4c73831` - Fix engine failure fallback message
- `47e4600` - Fix ChatBubble animation tests
- `9fcf5d7` - Fix smalltalk suppression logic
- `2b8684a` - Fix hub notes filter timing
- `270329d` - Add TypeScript defensive checks

## Summary

**Key Principle**: Every async operation that could fail should have a try/catch that returns a deterministic fallback matching the expected response contract.

**Result**: Tests no longer fail due to unexpected error propagation. CI is more stable because error paths are explicitly handled and tested.

**User Impact**: When the AI engine fails, users see a friendly "Let's explore that together" message instead of errors or confusing "Catch-All" copy.
