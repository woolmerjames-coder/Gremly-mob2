# ManualAddSheet → ManualAddOverlay Migration

## Summary

Successfully migrated from `ManualAddSheet` (ActionSheet-based) to `ManualAddOverlay` (Modal-based) across all production screens.

## Files Updated

### ✅ Production Files Migrated

1. **`app/tabs/TodayScreen.tsx`**
   - Changed from: `import { openManualAdd } from '../../components/ManualAddSheet'`
   - Changed to: `import { ManualAddOverlay } from '../../components/ManualAddOverlay'`
   - Added state: `const [overlayVisible, setOverlayVisible] = useState(false)`
   - Added handler: `handleManualAddSubmit(payload: ManualAddPayload)`
   - Changed button: `onPress={() => openManualAdd()}` → `onPress={() => setOverlayVisible(true)}`
   - Added component: `<ManualAddOverlay visible={overlayVisible} ... />`

2. **`app/tabs/HubScreen.tsx`**
   - Same migration as TodayScreen
   - Integrated ManualAddOverlay with Hub's item management

3. **`app/screens/SpaceDetailScreen.tsx`**
   - Same migration as TodayScreen
   - ManualAddOverlay automatically includes spaceId in submissions
   - Integrated with PlusFAB

4. **`components/OverlayHost.tsx`**
   - Removed: `import ManualAddSheet from './ManualAddSheet'`
   - Removed: `<ManualAddSheet />` from global render
   - Note: ManualAddOverlay is now managed locally in each screen

### ⚠️ Dev/Test Files (Not Updated Yet)

These files still reference ManualAddSheet but are dev-only or tests:

**Dev Playgrounds:**
- `app/dev/ManualAddDSPlayground.tsx`
- `app/dev/TodayDSPlayground.tsx`
- `app/dev/HubDSPlayground.tsx`

**Tests:**
- `__tests__/manual-add/ManualAddSheet.*.test.tsx` (multiple files)
- `__tests__/manual-add/habit.test.tsx`
- `__tests__/manual-add/todo.test.tsx`
- `__tests__/manual-add/journal.test.tsx`
- `__tests__/manual-add/catchall.test.tsx`
- `__tests__/manual-add/frequency.normalize.test.tsx`
- `__tests__/manual-add/no-debug.test.tsx`
- `__tests__/manual-add/tabs.test.tsx`

## API Changes

### Old API (ManualAddSheet)
```typescript
// Global helper function
import { openManualAdd } from '../../components/ManualAddSheet';
openManualAdd({ defaultTab: 'journal', spaceId: 'space_123' });

// Rendered globally in OverlayHost
<ManualAddSheet />
```

### New API (ManualAddOverlay)
```typescript
// Local state management
import { ManualAddOverlay } from '../../components/ManualAddOverlay';
import type { ManualAddPayload } from '../../app/schemas/manualAdd';

const [overlayVisible, setOverlayVisible] = useState(false);

const handleSubmit = async (payload: ManualAddPayload) => {
  switch (payload.type) {
    case 'habits':
      // Handle habit creation
      break;
    case 'todos':
      // Handle todo creation
      break;
    // ... etc
  }
};

<ManualAddOverlay
  visible={overlayVisible}
  defaultTab="habits"
  onClose={() => setOverlayVisible(false)}
  onSubmit={handleSubmit}
/>
```

## Benefits of Migration

### ✅ Better Features
- Reminders functionality (pinned section)
- Habit Start/Break distinction
- Optional fields with progressive disclosure
- More modular codebase (10 separate component files)

### ✅ Better Type Safety
- Discriminated union types for payloads
- Explicit form validation with Zod
- No `any` types in submission handlers

### ✅ Better Testing
- Comprehensive test coverage (22 passing tests in manualAddOverlay.ds.test.tsx)
- Individual form components can be tested separately

### ✅ Better Architecture
- Local state management (no global state)
- Callback-based (parent controls behavior)
- More flexible (can customize per screen)

## Next Steps

### Option 1: Keep ManualAddSheet for Legacy Support
- Leave ManualAddSheet in place
- Dev playgrounds continue using it
- Old tests continue passing
- Gradual migration of dev tools

### Option 2: Remove ManualAddSheet Completely
- Delete `components/ManualAddSheet.tsx`
- Delete all `__tests__/manual-add/ManualAddSheet.*.test.tsx` files
- Update dev playgrounds to use ManualAddOverlay
- Clean up completely

## Recommendation

**Option 2: Complete Removal**

Reasons:
1. All production code now uses ManualAddOverlay
2. ManualAddOverlay has better features and tests
3. Maintaining two similar components creates confusion
4. Dev playgrounds can easily be updated
5. Old tests can be replaced with new manualAddOverlay.ds.test.tsx

## Files to Delete

If we proceed with complete removal:

```
components/ManualAddSheet.tsx
__tests__/manual-add/ManualAddSheet.catchall.test.tsx
__tests__/manual-add/ManualAddSheet.habit.test.tsx
__tests__/manual-add/ManualAddSheet.journal.test.tsx
__tests__/manual-add/ManualAddSheet.render.test.tsx
__tests__/manual-add/ManualAddSheet.space-context.test.tsx
__tests__/manual-add/ManualAddSheet.todo.test.tsx
__tests__/manual-add/ManualAddSheet.visibility.test.tsx
__tests__/manual-add/tabs.test.tsx
__tests__/manual-add/habit.test.tsx
__tests__/manual-add/todo.test.tsx
__tests__/manual-add/journal.test.tsx
__tests__/manual-add/catchall.test.tsx
__tests__/manual-add/frequency.normalize.test.tsx
__tests__/manual-add/no-debug.test.tsx
```

## Migration Complete ✅

All production screens (Today, Hub, SpaceDetail) now use ManualAddOverlay!
