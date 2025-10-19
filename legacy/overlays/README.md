# Legacy Overlays - Phase 6

## Overview
This directory contains the archived Phase 6 overlay system, preserved for rollback safety and reference.

**Status:** Deprecated (Replaced by UnifiedCreateOverlay in Phase 7)  
**Maintained:** Yes (for rollback purposes)  
**Last Updated:** December 2024

---

## Files

### `ManualAddOverlay.tsx`
The original Phase 6 create/edit overlay component.

**Features:**
- Tab-based interface (Habits, To-Dos, Journal, Catch-all)
- Edit mode support
- Basic field validation
- Space assignment
- Frequency selection

**Deprecation Notice:**
This component has been replaced by `UnifiedCreateOverlay` which provides:
- Type pills instead of tabs
- Subtype chips for habits and notes
- AI freeform mode
- Consistent UX across all screens
- Better TypeScript support

---

## Feature Flag System

The app uses `EXPO_PUBLIC_UNIFIED_OVERLAY` feature flag to control which overlay system is active.

### Current Configuration
- **Default:** `true` (UnifiedCreateOverlay active)
- **Location:** `.env.local` or environment variables
- **Scope:** Runtime switchable (no rebuild required)

---

## Rollback Instructions

If issues arise with the UnifiedCreateOverlay, you can safely roll back to the legacy system.

### Quick Rollback (Feature Flag)

**Step 1:** Set the feature flag to `false`

Edit `.env.local`:
```bash
EXPO_PUBLIC_UNIFIED_OVERLAY=false
```

**Step 2:** Restart the Metro bundler
```bash
# Kill existing bundler
pkill -f "expo start"

# Start with clean cache
npx expo start -c
```

**Step 3:** Reload the app
- Press `r` in the Metro terminal, OR
- Shake device → "Reload"

**Result:** App now uses legacy ManualAddOverlay

### Verification Steps

After rolling back, verify:

1. **Create Flow:**
   - Open HubScreen
   - Tap "Add More" button
   - Verify ManualAddOverlay appears (tab interface)
   - Create a habit and verify it saves

2. **Edit Flow:**
   - Tap on an existing habit/todo
   - Verify edit mode opens correctly
   - Update fields and save

3. **Today Screen:**
   - Navigate to Today tab
   - Tap "Add habit or to-do"
   - Verify legacy overlay opens

4. **Space Detail:**
   - Open a space
   - Tap the + FAB
   - Verify legacy overlay opens with space context

### Permanent Rollback (Code)

If the feature flag rollback isn't sufficient, you can revert the code changes:

**Step 1:** Revert the migration commits
```bash
# Check recent commits
git log --oneline -10

# Revert the unified overlay migration
git revert 6380169  # refactor(overlay): migrate all screens to UnifiedCreateOverlay
git revert 64d759d  # feat(overlay): implement UnifiedCreateOverlay

# Or use interactive rebase
git rebase -i HEAD~5
```

**Step 2:** Resolve any conflicts
- Keep legacy imports: `ManualAddOverlay` from `legacy/overlays/`
- Keep legacy state: `overlayVisible`, `editMode`, `editItem`
- Keep legacy handlers: `handleManualAddSubmit`

**Step 3:** Remove unified overlay files (optional)
```bash
rm -rf components/overlay/
rm hooks/useUnifiedOverlayController.ts
rm hooks/useOverlayController.ts
rm components/FeatureFlaggedOverlay.tsx
```

**Step 4:** Update ESLint config
```javascript
// eslint.config.js - Remove legacy import restrictions
{
  files: ['app/tabs/**', 'app/screens/**'],
  rules: {
    'no-restricted-imports': 'off', // Allow legacy imports
  },
}
```

**Step 5:** Test thoroughly
- Run `npm run typecheck`
- Run `npm run lint`
- Run `npm test`
- Manual QA on all screens

---

## Adapter Layer

The feature flag system includes adapter components for seamless switching:

### `hooks/useOverlayController.ts`
Feature-flagged hook that delegates to either:
- `useUnifiedOverlayController()` when flag is `true`
- `useLegacyOverlayController()` when flag is `false`

**API (identical for both):**
```typescript
const overlayController = useOverlayController();

// Create
overlayController.openCreate({ type: 'habit', spaceId: '123' });

// Edit
overlayController.openEdit({ record, spaceId: '123' });

// Close
overlayController.close();
```

### `components/FeatureFlaggedOverlay.tsx`
Conditional renderer that shows:
- `<UnifiedCreateOverlay>` when flag is `true`
- `<ManualAddOverlay>` when flag is `false`

**Props (unified interface):**
```typescript
<FeatureFlaggedOverlay
  visible={overlayController.state.visible}
  mode={overlayController.state.mode}
  initialEntity={overlayController.state.initialEntity}
  initialSpaceId={overlayController.state.initialSpaceId}
  onClose={overlayController.close}
  onSaved={handleOverlaySaved}
/>
```

---

## Known Issues with Legacy Overlay

If you roll back to the legacy system, be aware of these limitations:

### 1. Missing Habit Subtypes
- Legacy overlay doesn't support habit subtypes (start_habit, break_habit, routine)
- Subtype field will be `null` for habits created in legacy mode
- Existing habits with subtypes can be edited but subtype won't show

### 2. No AI Freeform Mode
- Legacy overlay doesn't have AI freeform mode
- Catch-all tab is still available but less sophisticated

### 3. Edit Mode Limitations
- Legacy edit mode in FeatureFlaggedOverlay adapter is simplified
- May not fully populate all fields
- Recommendation: Use direct `ManualAddOverlay` if heavy editing needed

### 4. Type Safety
- Legacy overlay uses `ManualAddPayload` type instead of `CreateRecordInput`
- Requires adapter layer to convert between formats
- Some type information may be lost in conversion

### 5. Space Context
- Legacy overlay may not properly inherit space context in all scenarios
- Verify space assignment after creating items

---

## Migrating Back to Unified (After Rollback)

If you rolled back and want to return to the unified overlay:

**Step 1:** Set feature flag to `true`
```bash
# .env.local
EXPO_PUBLIC_UNIFIED_OVERLAY=true
```

**Step 2:** Restart bundler
```bash
npx expo start -c
```

**Step 3:** Reload app

No code changes needed - the adapter layer handles everything!

---

## Maintenance

### When to Use Legacy Overlay
- Critical bugs in UnifiedCreateOverlay
- Performance issues with unified system
- Need time to debug without blocking users
- Testing/comparison purposes

### When to Use Unified Overlay
- Normal operation (default)
- New features require unified system
- Better UX desired
- Habit subtypes needed

### Deprecation Timeline
- **Phase 7 (Current):** Both systems maintained
- **Phase 8 (Future):** Legacy overlay marked for removal
- **Phase 9+:** Legacy overlay removed (after stable unified system)

---

## Support

### Questions?
- Check `UNIFIED_OVERLAY_MIGRATION.md` for migration details
- Check `REPO_CONTRACTS_NORMALIZATION.md` for data layer details
- Check tests in `__tests__/` for usage examples

### Reporting Issues
When reporting issues, include:
1. Feature flag value (`EXPO_PUBLIC_UNIFIED_OVERLAY`)
2. Overlay type (unified vs legacy)
3. Screen where issue occurred
4. Steps to reproduce
5. Expected vs actual behavior

### Feature Requests
New overlay features should target UnifiedCreateOverlay, not legacy.

---

## Technical Details

### Legacy Overlay Props
```typescript
interface ManualAddOverlayProps {
  visible: boolean;
  mode?: 'create' | 'edit';
  defaultTab?: 'habits' | 'todos' | 'journal' | 'catchall';
  itemId?: string;
  initialType?: 'habit' | 'todo' | 'note';
  initialSubtype?: string;
  initialValues?: Partial<AppRecord>;
  isSheet?: boolean;
  onClose: () => void;
  onSubmit?: (payload: ManualAddPayload) => void | Promise<void>;
  onSaved?: () => void;
}
```

### Unified Overlay Props
```typescript
interface UnifiedCreateOverlayProps {
  visible: boolean;
  mode: 'create' | 'edit';
  initialEntity?: {
    type: EntityType | null;
    id?: string;
    subtype?: string | null;
  };
  initialSpaceId?: string | null;
  onClose: () => void;
  onSaved?: (result: { type: string; id: string }) => void;
}
```

---

## Code Examples

### Using Legacy Overlay Directly
```typescript
import { ManualAddOverlay } from '../../legacy/overlays/ManualAddOverlay';

function MyScreen() {
  const [overlayVisible, setOverlayVisible] = useState(false);

  const handleSubmit = async (payload: ManualAddPayload) => {
    // Handle submission
    setOverlayVisible(false);
  };

  return (
    <>
      <Button onPress={() => setOverlayVisible(true)}>Add Item</Button>
      
      <ManualAddOverlay
        visible={overlayVisible}
        defaultTab="habits"
        onClose={() => setOverlayVisible(false)}
        onSubmit={handleSubmit}
      />
    </>
  );
}
```

### Using Feature-Flagged Overlay
```typescript
import { useOverlayController } from '../../hooks/useOverlayController';
import { FeatureFlaggedOverlay } from '../../components/FeatureFlaggedOverlay';

function MyScreen() {
  const overlayController = useOverlayController();

  return (
    <>
      <Button onPress={() => overlayController.openCreate({ type: 'habit' })}>
        Add Habit
      </Button>
      
      <FeatureFlaggedOverlay
        visible={overlayController.state.visible}
        mode={overlayController.state.mode}
        initialEntity={overlayController.state.initialEntity}
        initialSpaceId={overlayController.state.initialSpaceId}
        onClose={overlayController.close}
        onSaved={handleOverlaySaved}
      />
    </>
  );
}
```

---

**Last Updated:** December 2024  
**Maintained By:** Gremly Development Team  
**Status:** Active (Rollback Support)
