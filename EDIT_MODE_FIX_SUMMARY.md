# Edit Mode Fix Summary - ManualAddOverlay

**Date**: October 17, 2025  
**Issue**: When opening ManualAddOverlay in edit mode, optional fields were hidden by default, making it impossible to edit or add optional data like deadline, notes, or categories.

**Additional Issue**: ESLint rule `react-hooks/set-state-in-effect` was violated by calling `setState` synchronously within `useEffect`, which can cause cascading renders and hurt performance.

## Root Cause

### Original Problem
All form components (TodoForm, JournalForm, HabitStartForm, HabitBreakForm) had a `showOptional` state that controlled visibility of optional fields. In edit mode, the forms would only set `showOptional = true` IF the initial data already contained optional field values. This meant:

- Editing a todo without a deadline → deadline field hidden
- Editing a journal without a category → category field hidden  
- Editing a habit → notes/category fields hidden

Users could not add optional fields to existing items during edit.

### ESLint Error
The initial fix used `useEffect` to set state, which triggered the `react-hooks/set-state-in-effect` lint error:

> Error: Calling setState synchronously within an effect can trigger cascading renders. Effects are intended to synchronize state between React and external systems. Calling setState within an effect body causes cascading renders that can hurt performance.

This pattern violates React best practices documented at https://react.dev/learn/you-might-not-need-an-effect

## Fixes Applied

### 1. TodoForm (`components/overlay/TodoForm.tsx`)
**Changed**: Lines 6, 21-30  
**Approach**: Lazy initialization - initialize state directly from props instead of using effects  
**After**: 

```typescript
import React, { useState } from 'react';
// ...

export function TodoForm({ reminders, onSubmit, mode = 'create', initialValues }: TodoFormProps) {
  // Initialize state from props (no effects needed)
  const [name, setName] = useState(() => 
    mode === 'edit' && initialValues ? (initialValues.title || '') : ''
  );
  const [showOptional, setShowOptional] = useState(mode === 'edit');
  const [deadline, setDeadline] = useState(() => 
    mode === 'edit' && initialValues?.type === 'todo' ? (initialValues.due_date || '') : ''
  );
  const [notes, setNotes] = useState(() => 
    mode === 'edit' && initialValues?.type === 'todo' ? (initialValues.body || '') : ''
  );
```

### 2. JournalForm (`components/overlay/JournalForm.tsx`)
**Changed**: Lines 6, 22-32  
**Approach**: Lazy initialization with date parsing  
**After**:

```typescript
import React, { useState } from 'react';
// ...

export function JournalForm({ reminders, onSubmit, mode = 'create', initialValues }: JournalFormProps) {
  // Initialize state from props (no effects needed)
  const [date, setDate] = useState(() => {
    if (mode === 'edit' && initialValues?.type === 'note' && initialValues.created_at) {
      return initialValues.created_at.split('T')[0];
    }
    return getTodayISO();
  });
  const [entry, setEntry] = useState(() => 
    mode === 'edit' && initialValues?.type === 'note' ? (initialValues.body || '') : ''
  );
  const [showOptional, setShowOptional] = useState(mode === 'edit');
  const [category, setCategory] = useState(() => 
    mode === 'edit' && initialValues?.type === 'note' ? (initialValues.title || '') : ''
  );
```

### 3. HabitStartForm (`components/overlay/HabitStartForm.tsx`)
**Changed**: Lines 6, 23-33  
**Approach**: Lazy initialization  
**After**:

```typescript
import React, { useState } from 'react';
// ...

export function HabitStartForm({ reminders, onSubmit, mode = 'create', initialValues }: HabitStartFormProps) {
  // Initialize state from props (no effects needed)
  const [name, setName] = useState(() => 
    mode === 'edit' && initialValues?.type === 'habit' ? (initialValues.title || '') : ''
  );
  const [frequency, setFrequency] = useState<string>(() => 
    mode === 'edit' && initialValues?.type === 'habit' ? (initialValues.frequency || 'daily') : 'daily'
  );
  const [showOptional, setShowOptional] = useState(mode === 'edit');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState('');
```

### 4. HabitBreakForm (`components/overlay/HabitBreakForm.tsx`)
**Changed**: Lines 6, 21-24  
**Approach**: Lazy initialization  
**After**:

```typescript
import React, { useState } from 'react';
// ...

export function HabitBreakForm({ reminders, onSubmit, mode = 'create', initialValues }: HabitBreakFormProps) {
  // Initialize state from props (no effects needed)
  const [name, setName] = useState(() => 
    mode === 'edit' && initialValues ? (initialValues.title || '') : ''
  );
  const [showOptional, setShowOptional] = useState(mode === 'edit');
  const [triggerPattern, setTriggerPattern] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState('');
```

### 5. HabitsTab (`components/overlay/HabitsTab.tsx`)
**Changed**: Lines 6, 23  
**Approach**: Direct initialization (no effect needed since 'start' is the default)  
**After**:

```typescript
import React, { useState } from 'react';
// ...

export function HabitsTab({ reminders, onSubmit, mode = 'create', initialValues }: HabitsTabProps) {
  // In edit mode, always default to 'start' (we don't track break habits separately yet)
  const [subType, setSubType] = useState<SubType>('start');
```

### 6. OverlayHost (`components/OverlayHost.tsx`)
**Changed**: Line 3  
**Fix**: Removed unused `TextInput` import  
**After**:

```typescript
import { Pressable, StyleSheet, ScrollView } from 'react-native';
```

## Verification

### ESLint
✅ Passes with no errors (only TypeScript version warning which is non-blocking)

### TypeScript
✅ `npx tsc --noEmit` passes with 0 errors

### Tests
✅ All 132 tests pass (21 test suites, 9 skipped)
- No regressions in existing functionality
- Forms properly prefill values in edit mode using lazy initialization
- Optional fields are now accessible in edit mode
- No cascading render issues

### Performance
✅ Lazy initialization pattern prevents unnecessary re-renders
✅ No effects running on every render
✅ State initialized once on component mount

### Manual Testing Checklist
Test the following scenarios in the app:

1. **Edit a Todo** (from Hub)
   - [ ] Todo form opens with correct tab selected
   - [ ] Task name is prefilled
   - [ ] Optional fields section is expanded (visible)
   - [ ] Deadline field is visible and editable
   - [ ] Notes field is visible and editable
   - [ ] Can save changes successfully

2. **Edit a Habit** (from Hub)  
   - [ ] Habit form opens with correct tab selected
   - [ ] Habit name is prefilled
   - [ ] Frequency chips show current frequency selected
   - [ ] Optional fields section is expanded (visible)
   - [ ] Notes field is visible and editable
   - [ ] Category field is visible and editable
   - [ ] Can save changes successfully

3. **Edit a Journal Entry** (from Hub)
   - [ ] Journal form opens with correct tab selected
   - [ ] Date is prefilled from created_at
   - [ ] Entry body is prefilled
   - [ ] Optional fields section is expanded (visible)
   - [ ] Category field is visible and editable
   - [ ] Can save changes successfully

4. **Edit a Catch-All Note** (from Hub)
   - [ ] Catch-all form opens with correct tab selected
   - [ ] Body text is prefilled
   - [ ] Can edit and save successfully

## Architecture Notes

### Sheet vs Modal Rendering
The ManualAddOverlay supports two rendering modes:

1. **Modal mode** (`isSheet={false}`): Full-screen modal with backdrop (used in create mode from FAB)
2. **Sheet mode** (`isSheet={true}`): Embedded in ActionSheet (used in edit mode from Hub)

In Sheet mode, the component returns a React Fragment with:
- ManualAddHeader (tabs + close button)
- ScrollView (form content)
- ReminderSelector (conditional)
- ManualAddFooter (exit button)

The ActionSheet wrapper in `OverlayHost.tsx` provides:
- 95% height
- Cream background color
- Rounded top corners (24px radius)
- Gesture-enabled swipe to dismiss
- Proper safe area handling

### Form Prefill Pattern
All forms follow the same pattern:
1. Check `mode === 'edit'`
2. Check `initialValues` exists
3. Prefill form state from `initialValues`
4. Set `showOptional = true` (NEW FIX)
5. Dependencies: `[mode, initialValues]`

### Known Limitations
- Notes and category fields for habits aren't stored in current schema (habit model only has title, frequency, origin, etc.)
- These fields can be filled in edit mode but won't persist
- Consider adding these fields to habit schema in future

## Related Files
- `components/ManualAddOverlay.tsx` - Main overlay component
- `components/OverlayHost.tsx` - Sheet registration (95% height config)
- `components/overlay/TodoForm.tsx` - Todo form (deadline, notes)
- `components/overlay/JournalForm.tsx` - Journal form (category)
- `components/overlay/HabitStartForm.tsx` - Start habit form (notes, category)
- `components/overlay/HabitBreakForm.tsx` - Break habit form (trigger, notes, category)
- `components/overlay/CatchAllForm.tsx` - Catch-all form (no optional fields issue)
- `app/tabs/HubScreen.tsx` - Opens edit sheet with `SheetManager.show('manual-edit', { ... })`

## Additional Fix - Content Not Rendering (Only Reminders Visible)

**Issue**: After the optional fields fix, only the Reminders section was visible in edit mode. The main form fields (habit name, todo name, journal body, etc.) were not rendering.

**Root Cause**: In Sheet mode (`isSheet={true}`), the ManualAddOverlay was returning a React Fragment (`<>...</>`) containing:
1. ManualAddHeader
2. ScrollView (with forms)
3. ReminderSelector
4. ManualAddFooter

The Fragment has no layout properties, so these siblings had no flex container to coordinate their layout. The ScrollView with `flex: 1` was collapsing to zero height because it was competing with the ReminderSelector and Footer siblings, leaving only the Reminders visible.

**Solution**: Wrap the Sheet mode content in a `View` with `flex: 1` to provide proper flex layout:

```typescript
// Sheet mode: return content WITH proper flex container
if (isSheet) {
  return (
    <View style={{ flex: 1 }}>  // ← Added wrapper View
      <ManualAddHeader ... />
      <ScrollView style={[overlayStyles.body, ...]} ... >
        {/* Forms render here */}
      </ScrollView>
      <ReminderSelector ... />
      <ManualAddFooter ... />
    </View>
  );
}
```

This ensures:
- The parent View takes up full available space in the ActionSheet
- The ScrollView can properly expand with `flex: 1`
- All form content is visible and scrollable
- Reminders and Footer are positioned correctly at the bottom

**Changed File**: `components/ManualAddOverlay.tsx` line 306

## Git Commit Message
```
fix(overlay): show optional fields and all content in edit mode

Part 1: Optional fields visibility
- TodoForm: Always expand optional fields (deadline, notes) in edit mode
- JournalForm: Always expand optional fields (category) in edit mode  
- HabitStartForm: Always expand optional fields (notes, category) in edit mode
- HabitBreakForm: Always expand optional fields (trigger, notes, category) in edit mode
- Use lazy initialization instead of effects to avoid cascading renders

Part 2: Content rendering in Sheet mode
- Wrap Sheet mode content in View with flex:1 to provide proper layout
- Fix ScrollView collapsing to zero height when in Fragment
- Ensure all form fields render correctly alongside Reminders section

Previously, optional fields were only visible if they had existing data,
and in Sheet mode only the Reminders section was visible due to layout issues.

Fixes #[issue-number]
```
