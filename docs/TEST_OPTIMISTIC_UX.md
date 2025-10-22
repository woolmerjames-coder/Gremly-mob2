# Test Suite: Optimistic Thinking UX

**Phase 10**: Tests for deliberate 1s "Thinking…" UX with optimistic capture + background classification

## Test Files Created

### 1. `__tests__/overlay.minThink.optimistic.test.tsx`

Comprehensive tests for the optimistic thinking flow in UnifiedCreateOverlay.

#### Test Coverage

**Case A: Fast AI (< 1s)**
```typescript
it('should wait >=1000ms, save with classification, toast "Added to Hub", and close')
```
- Mocks AI response completing in 100ms
- Verifies overlay waits at least 1000ms (deliberate thinking UX)
- Expects repo.create called with `ai_placed: true`, `why_string: 'AI classified'`
- Expects toast: "Added to Hub"
- Expects overlay closes

**Case B: Slow AI (>= 1s)**
```typescript
it('should wait ~1000ms, optimistic save, toast "Delivered to Hub — sorting in background", close, then background classify')
```
- Mocks AI response taking 2000ms (never resolves initially)
- Verifies overlay waits ~1000ms then saves optimistically
- Expects repo.create called with `ai_placed: false`, `why_string: 'Pending classification'`
- Expects toast: "Delivered to Hub — sorting in background"
- Expects overlay closes immediately (doesn't wait for AI)
- Later resolves AI and expects repo.update with `ai_placed: true`, `why_string: 'AI classified (background)'`

**Case C: AI Error**
```typescript
it('should optimistic save, toast "Delivered to Hub — sorting in background", and mark as failed in background')
```
- Mocks AI throwing error
- Verifies optimistic save happens
- Expects background update with `ai_placed: false`, `why_string: 'Classification failed'`

```typescript
it('should handle AI timeout in background')
```
- Mocks AI that never resolves
- Fast-forwards 5100ms (background timeout)
- Expects repo.update with `why_string: 'Classification timeout'`

**Edge Cases**
```typescript
it('should handle AI disabled flag correctly')
```
- Sets EXPO_PUBLIC_DISABLE_AI='on'
- Verifies no AI call made
- Expects immediate save with `ai_placed: false`, `why_string: 'Manual - AI disabled'`

```typescript
it('should prevent double submit with submitting guard')
```
- Presses save button twice rapidly
- Expects repo.create called only once

**Analytics Logs**
```typescript
it('should log [UX] analytics events')
```
- Verifies console.log called with:
  - `[UX] capture_submitted` with `{ mode: 'ai' }`
  - `[UX] capture_saved` with `{ path: 'catchall', aiStatus: 'classified'|'pending' }`
  - `[UX] capture_closed`

#### Test Setup

**Mocks Required:**
- `useRepo` → mockRepo with create/update methods
- `useCortex` → mockCortex with classify method
- `useAuth` → mockAuth with userId
- `useTheme` → mockTheme with colors
- `callComplete` from CortexClient → mockable AI call
- env helpers → getOptimisticFlag(), getMinThinkMs(), getBgTimeoutMs(), getEnv()
- `lucide-react-native` → React Native View components
- `Platform.OS` → 'android'
- `ToastAndroid.show` → jest.fn()

**Timing Control:**
- Tests use `jest.useFakeTimers()` for slow AI cases
- Use `act()` wrapper for state updates
- Use `waitFor()` for async assertions
- Fast-forward timers with `jest.advanceTimersByTime(ms)`

### 2. `__tests__/cortex.queue.test.ts`

Placeholder tests for future CortexQueue implementation.

#### Purpose

Defines the API contract for a future `lib/cortex/queue.ts` module that would handle:
- **Deduplication**: Same itemId enqueued multiple times = single AI call
- **Event Emissions**: Emits 'cortex:classified' on success, 'cortex:failed' on error/timeout
- **Retry Logic**: Exponential backoff with configurable maxRetries
- **Queue Management**: Ability to clear queue, check size, handle concurrent enqueues

#### Test Structure

**Single-Flight Deduplication**
- Enqueue same itemId multiple times → single call
- Enqueue different itemIds → independent processing

**Event Emissions**
- Success → emit 'cortex:classified' with { itemId, classification }
- Error → emit 'cortex:failed' with { itemId, error }
- Timeout → emit 'cortex:failed' with { itemId, error: 'timeout' }

**Retry Logic**
- Retry failed classifications up to maxRetries
- Emit 'cortex:failed' after exhausting retries
- Use exponential backoff between retries (1s, 2s, 4s, etc.)

**Queue Management**
- Clear queue
- Report queue size
- Handle concurrent enqueues safely

#### Current Implementation

Currently, background classification happens inline in UnifiedCreateOverlay via `setTimeout`:

```typescript
setTimeout(async () => {
  try {
    const finalResult = await Promise.race([aiPromise, bgTimeout]);
    if (finalResult?.ok) {
      await repo.update({ id, patch: { ai_placed: true, ... } });
    } else {
      await repo.update({ id, patch: { ai_placed: false, ... } });
    }
  } catch (error) {
    await repo.update({ id, patch: { ai_placed: false, ... } });
  }
}, 0);
```

A dedicated queue would provide:
- Better deduplication across multiple saves
- Centralized retry logic
- Event-based architecture for UI updates
- Observability (queue size, pending items)

## Running Tests

### Run Optimistic UX Tests
```bash
NODE_ENV=test npm test -- __tests__/overlay.minThink.optimistic.test.tsx
```

**Known Issues:**
- Complex mocking requirements for Platform, ToastAndroid, lucide-react-native
- Modal component Platform.OS detection requires careful setup
- Tests may need adjustment if run individually vs with full suite

### Run Queue Tests (Placeholders)
```bash
NODE_ENV=test npm test -- __tests__/cortex.queue.test.ts
```

**Status:** ✅ All 11 tests pass (placeholder implementations)

## Test Assertions Reference

### Toast Messages
```typescript
expect(ToastAndroid.show).toHaveBeenCalledWith('Added to Hub', ToastAndroid.SHORT);
expect(ToastAndroid.show).toHaveBeenCalledWith('Delivered to Hub — sorting in background', ToastAndroid.SHORT);
```

### Repo Calls
```typescript
// Fast path
expect(mockRepo.create).toHaveBeenCalledWith(
  expect.objectContaining({
    type: 'note',
    subtype: 'catchall',
    body: 'buy milk',
    ai_placed: true,
    why_string: 'AI classified',
  }),
);

// Slow path (optimistic)
expect(mockRepo.create).toHaveBeenCalledWith(
  expect.objectContaining({
    ai_placed: false,
    why_string: 'Pending classification',
  }),
);

// Background update (success)
expect(mockRepo.update).toHaveBeenCalledWith({
  id: 'test-item-123',
  patch: {
    ai_placed: true,
    why_string: 'AI classified (background)',
  },
});

// Background update (failure)
expect(mockRepo.update).toHaveBeenCalledWith({
  id: 'test-item-123',
  patch: {
    ai_placed: false,
    why_string: 'Classification failed',
  },
});
```

### Analytics Logs
```typescript
expect(consoleLogSpy).toHaveBeenCalledWith(
  '[UX] capture_submitted',
  expect.objectContaining({ mode: 'ai' }),
);

expect(consoleLogSpy).toHaveBeenCalledWith(
  '[UX] capture_saved',
  expect.objectContaining({
    path: 'catchall',
    aiStatus: expect.stringMatching(/classified|pending|failed|disabled/),
  }),
);

expect(consoleLogSpy).toHaveBeenCalledWith('[UX] capture_closed');
```

### Timing Assertions
```typescript
const t0 = Date.now();
// ... trigger save
const elapsed = Date.now() - t0;
expect(elapsed).toBeGreaterThanOrEqual(1000); // Deliberate 1s minimum
```

### Event Emissions (Future Queue)
```typescript
const classifiedSpy = jest.fn();
eventBus.on('cortex:classified', classifiedSpy);

// ... trigger classification

expect(classifiedSpy).toHaveBeenCalledWith({
  itemId: 'item-1',
  classification: { type: 'todo' },
});
```

## Test Maintenance

### When to Update Tests

1. **Toast copy changes**: Update expected toast messages
2. **why_string changes**: Update expected repo.create/update payloads
3. **Timing changes**: Update minThink/bgTimeout mock values
4. **Analytics events**: Add new [UX] log assertions
5. **Queue implementation**: Replace placeholder tests with real queue tests

### Adding New Test Cases

**Template:**
```typescript
it('should [behavior description]', async () => {
  jest.useFakeTimers(); // If testing timing

  // Mock dependencies
  const mockCallComplete = jest.spyOn(CortexClient, 'callComplete');
  mockCallComplete.mockImplementation(/* ... */);

  const onClose = jest.fn();
  const onSaved = jest.fn();

  // Render overlay
  const { getByTestId } = renderWithProviders(
    <UnifiedCreateOverlay visible={true} mode="create" onClose={onClose} onSaved={onSaved} />,
  );

  // Trigger action
  await act(async () => {
    // ... user interactions
  });

  // Advance timers if needed
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });

  // Assertions
  await waitFor(() => {
    expect(/* ... */).toHaveBeenCalled();
  });

  jest.useRealTimers(); // Cleanup
});
```

## CI/CD Integration

### Test Commands

**Run all tests:**
```bash
NODE_ENV=test npm test
```

**Run with coverage:**
```bash
NODE_ENV=test npm test -- --coverage
```

**Run specific suite:**
```bash
NODE_ENV=test npm test -- __tests__/overlay.minThink.optimistic.test.tsx
```

### Expected Failures

Currently, `overlay.minThink.optimistic.test.tsx` may fail due to:
- Platform.OS mocking complexity
- Modal component initialization
- Async timing in test environment

These tests serve as a **specification** for the expected behavior. Once the mocking issues are resolved, they will provide comprehensive coverage of the optimistic UX flow.

## Future Work

1. **Resolve Platform.OS mocking**: Investigate why Platform mock doesn't work with Modal component
2. **Simplify test setup**: Extract common mocking into test utils
3. **Add integration tests**: Test full flow from button press to database update
4. **Implement CortexQueue**: Convert placeholder tests to real tests
5. **Add EventBus tests**: Test event emissions for background classification updates

---

**Status:** 
- ✅ cortex.queue.test.ts: 11/11 tests passing (placeholders)
- ⏸️ overlay.minThink.optimistic.test.tsx: Tests written but need mocking fixes
- 📝 Tests serve as **specification** for optimistic UX behavior

**Related Docs:**
- `docs/OPTIMISTIC_THINKING_UX.md` - Implementation details
- `docs/ANALYTICS_UX_COPY_TWEAKS.md` - UX copy and analytics logs
