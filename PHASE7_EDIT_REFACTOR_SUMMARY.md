# Phase 7: Edit Refactor - Uniform UX with ManualAddOverlay

## Overview
Refactored the Hub item editing experience to reuse the existing `ManualAddOverlay` component in edit mode, replacing the custom `EditItemSheet`. This provides a consistent user experience where editing feels identical to manual add.

## Implementation Summary

### 1. Enhanced ManualAddOverlay with Edit Mode Support
**File:** `components/ManualAddOverlay.tsx`

**Changes:**
- Added props: `mode`, `initialType`, `initialSubtype`, `initialValues`, `itemId`, `onSaved`
- Added `useEffect` to automatically select the correct tab based on item type in edit mode
- Implemented edit mode submission logic in `handleSubmit`:
  - Detects `mode === 'edit'` and builds appropriate update payload
  - Calls `repo.update()` with `ai_placed: false` to mark item as user-decided
  - Preserves record origin and subtype
  - Shows success toast and closes overlay after save
- Passes mode and initialValues props to all child form components

**Key Code:**
```typescript
// Edit mode handling in handleSubmit
if (mode === 'edit' && itemId && initialType) {
  // Build type-specific update payload
  const updatePayload: UpdateRecordInput = { id: itemId, patch: { ... } };
  await repo.update(updatePayload);
  onSaved?.();
  handleClose();
  return;
}
```

### 2. Updated All Child Form Components for Edit Mode

#### TodoForm (`components/overlay/TodoForm.tsx`)
- Added `mode` and `initialValues` props
- `useEffect` prefills name, deadline, and notes from `initialValues` when `mode === 'edit'`
- Button label changes to "Save changes" with `testID="edit-save"` in edit mode

#### HabitStartForm (`components/overlay/HabitStartForm.tsx`)
- Added `mode` and `initialValues` props
- `useEffect` prefills habit name and frequency from `initialValues.title` and `initialValues.frequency`
- Button label changes to "Save changes" with `testID="edit-save"` in edit mode

#### HabitBreakForm (`components/overlay/HabitBreakForm.tsx`)
- Added `mode` and `initialValues` props
- `useEffect` prefills habit name from `initialValues.title`
- Button label changes to "Save changes" with `testID="edit-save"` in edit mode

#### JournalForm (`components/overlay/JournalForm.tsx`)
- Added `mode` and `initialValues` props
- `useEffect` prefills entry body, date (from `created_at`), and category from initialValues
- Button label changes to "Save changes" with `testID="edit-save"` in edit mode

#### CatchAllForm (`components/overlay/CatchAllForm.tsx`)
- Added `mode` and `initialValues` props
- `useEffect` prefills entry from `initialValues.body`
- Button label changes to "Save changes" with `testID="edit-save"` in edit mode

#### HabitsTab (`components/overlay/HabitsTab.tsx`)
- Added `mode` and `initialValues` props
- `useEffect` forces 'start' subtype in edit mode (habits only support "start" type for now)
- Passes props to `HabitStartForm` and `HabitBreakForm`

### 3. Registered Manual-Edit Sheet in OverlayHost
**File:** `components/OverlayHost.tsx`

**Changes:**
- Removed entire `EditItemSheet` component (270+ lines)
- Registered new `manual-edit` sheet that renders `ManualAddOverlay` in edit mode
- Passes `itemId`, `itemType`, `itemSubtype`, and full `initialValues` to overlay

**Key Code:**
```typescript
registerSheet('manual-edit', ({ sheetId, payload }) => (
  <ManualAddOverlay
    visible={true}
    mode="edit"
    initialType={payload.itemType}
    initialSubtype={payload.itemSubtype}
    itemId={payload.itemId}
    initialValues={payload.initialValues}
    onSaved={() => SheetManager.hide(sheetId)}
    onClose={() => SheetManager.hide(sheetId)}
  />
));
```

### 4. Updated HubScreen to Use Manual-Edit Sheet
**File:** `app/tabs/HubScreen.tsx`

**Changes:**
- Changed `handleItemPress` to call `SheetManager.show('manual-edit')` instead of `'edit-item'`
- Passes full item record as `initialValues` in payload

**Key Code:**
```typescript
await SheetManager.show('manual-edit', {
  payload: {
    itemId: item.id,
    itemType: item.type,
    itemSubtype: item.type === 'note' ? item.subtype : undefined,
    initialValues: item,
  },
});
```

### 5. Updated Tests
**File:** `__tests__/hub.edit.test.tsx`

**Changes:**
- Updated all test expectations from `'edit-item'` to `'manual-edit'`
- Added `initialValues` validation to payload expectations
- Updated comments to reflect new ManualAddOverlay-based architecture
- All 4 tests passing ✅

## Benefits

### User Experience
1. **Consistent UI**: Editing now uses the same interface as manual add, reducing cognitive load
2. **Feature Parity**: All manual add features (reminders, validation, classification) available in edit mode
3. **Visual Consistency**: Same tab navigation, field layouts, and styling

### Code Quality
1. **Reduced Duplication**: Eliminated 270+ lines of custom edit form code
2. **Single Source of Truth**: All form logic centralized in ManualAddOverlay and child forms
3. **Easier Maintenance**: Future form changes only need to be made once
4. **Better Type Safety**: Reuses existing TypeScript types and validation

### Developer Experience
1. **Simplified Architecture**: One overlay component instead of two separate sheets
2. **Clear Mode Distinction**: `mode` prop makes behavior explicit
3. **Testable**: Forms can be tested in both create and edit modes

## Technical Details

### Type Handling
- Used discriminated union narrowing for `Partial<AppRecord>` to safely access type-specific fields
- Edit mode update payloads include `type` field to satisfy TypeScript's discriminated unions
- Proper handling of optional fields (e.g., `due_date`, `body`, `title`)

### State Management
- `useEffect` hooks in child forms detect `mode === 'edit'` and prefill state from `initialValues`
- Parent `ManualAddOverlay` manages active tab based on `initialType`/`initialSubtype`
- Form state remains local to each child component

### Data Flow
```
HubScreen (user taps item)
  ↓
SheetManager.show('manual-edit', { payload })
  ↓
OverlayHost (registered sheet)
  ↓
ManualAddOverlay (mode='edit', initialValues=item)
  ↓
Child Form (prefills from initialValues)
  ↓
User edits and presses "Save changes"
  ↓
ManualAddOverlay.handleSubmit (calls repo.update)
  ↓
Sheet closes, HubScreen reloads
```

## Files Modified
1. `components/ManualAddOverlay.tsx` - Added edit mode support
2. `components/overlay/TodoForm.tsx` - Added prefill logic
3. `components/overlay/HabitStartForm.tsx` - Added prefill logic
4. `components/overlay/HabitBreakForm.tsx` - Added prefill logic
5. `components/overlay/JournalForm.tsx` - Added prefill logic
6. `components/overlay/CatchAllForm.tsx` - Added prefill logic
7. `components/overlay/HabitsTab.tsx` - Pass mode/initialValues to children
8. `components/OverlayHost.tsx` - Replaced EditItemSheet with manual-edit registration
9. `app/tabs/HubScreen.tsx` - Changed to use manual-edit sheet
10. `__tests__/hub.edit.test.tsx` - Updated test expectations

## Test Results
```
PASS  __tests__/hub.edit.test.tsx
  Hub Edit Item
    ✓ opens manual-edit sheet when habit row is pressed
    ✓ opens manual-edit sheet when todo row is pressed
    ✓ opens manual-edit sheet when note:list row is pressed
    ✓ verifies repo.update would be called with ai_placed:false on save

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

## Next Steps
- Consider adding edit mode to Spaces screen for editing items within a space
- Add edit history/changelog tracking
- Consider undo/redo functionality
- Add batch edit capabilities

## Notes
- Edit mode always sets `ai_placed: false` to indicate user has explicitly edited the item
- Origin field is preserved during edits
- Created timestamps remain unchanged; only `updated_at` is modified by Supabase
- Journal notes use `created_at` for the date field since `due_date` doesn't exist on Note type
