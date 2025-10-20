# Overlay Wiring Complete

## Overview
All type pills in `UnifiedCreateOverlay` are now properly wired to render their respective field components and call the correct save/update methods.

## Implementation Summary

### 1. Type Pills → Field Components

**AI Mode** (when toggled on):
- Shows freeform text input
- Saves as catchall Note with AI classification

**Structured Mode** (type pills selected):
- ✅ `type='habit'` → `HabitFields`
- ✅ `type='todo'` → `TodoFields`
- ✅ `type='journal'` → `JournalFields`
- ✅ `type='note'` → `NoteFields`
- ✅ `type='person'` → `PersonFields`

### 2. Person Integration (Latest Changes)

#### Added Imports
```typescript
import { PersonFields, type PersonDetailsState } from './fields/PersonFields';
```

#### State Variables
```typescript
const [personName, setPersonName] = useState('');
const [personDetails, setPersonDetails] = useState<PersonDetailsState>({
  email: '',
  dates: [],
  notes: '',
  notesFormatting: null,
  reminders: [],
  spaceId: null,
  tags: [],
});
```

#### PersonFields Rendering
```tsx
{selectedType === 'person' && (
  <PersonFields
    name={personName}
    onNameChange={setPersonName}
    details={personDetails}
    onDetailsChange={setPersonDetails}
    disabled={false}
  />
)}
```

#### Person Save Logic (Create Mode)
```typescript
if (selectedType === 'person') {
  const personInput = {
    display_name: personName,
    email: personDetails.email || null,
    dates: personDetails.dates.length > 0 ? personDetails.dates.map(d => ({
      date: d.date,
      label: d.label,
    })) : null,
    notes: personDetails.notes || null,
    notes_fmt: personDetails.notesFormatting || null,
    reminders: personDetails.reminders.length > 0 ? personDetails.reminders : null,
    space_id: personDetails.spaceId || null,
    tags: personDetails.tags.length > 0 ? personDetails.tags : null,
  };
  const result = await repo.createPerson(personInput);
  onSaved?.({ type: 'person', id: result.id });
  showToast('Saved to the Hub.');
  handleClose();
  return;
}
```

#### Person Update Logic (Edit Mode)
```typescript
if (selectedType === 'person') {
  const personPatch = {
    display_name: personName,
    email: personDetails.email || null,
    dates: personDetails.dates.length > 0 ? personDetails.dates.map(d => ({
      date: d.date,
      label: d.label,
    })) : null,
    notes: personDetails.notes || null,
    notes_fmt: personDetails.notesFormatting || null,
    reminders: personDetails.reminders.length > 0 ? personDetails.reminders : null,
    space_id: personDetails.spaceId || null,
    tags: personDetails.tags.length > 0 ? personDetails.tags : null,
  };
  const result = await repo.updatePerson(initialEntity.id, personPatch);
  onSaved?.({ type: 'person', id: result.id });
  showToast('Saved to the Hub.');
  handleClose();
  return;
}
```

#### Reset Form
```typescript
setPersonName('');
setPersonDetails({
  email: '',
  dates: [],
  notes: '',
  notesFormatting: null,
  reminders: [],
  spaceId: null,
  tags: [],
});
```

### 3. Save Method Routing

**Person (Separate Table)**:
- Create: `repo.createPerson(personInput)` → `people` table
- Update: `repo.updatePerson(id, personPatch)` → `people` table
- Delete: `repo.deletePerson(id)`

**Other Entities (AppRecord)**:
- Create: `repo.create(input)` → `records` table
- Update: `repo.update({ id, patch })` → `records` table
- Delete: `repo.delete(id)`

### 4. Validation

All entities have required field validation:
- **Habit**: name required
- **Todo**: name + due date required
- **Journal**: date + entry + mood required
- **Note**: body required
- **Person**: name (display_name) required

## Files Modified

### `components/overlay/UnifiedCreateOverlay.tsx`
- Added `PersonDetailsState` import
- Added `personDetails` state with full structure
- Removed old `personEmail` state (now in details)
- Updated PersonFields rendering with details props
- Added Person-specific create logic using `createPerson`
- Added Person-specific update logic using `updatePerson`
- Removed Person case from `buildCreateInput` (no longer stores as Note)
- Removed Person case from `buildUpdatePatch` (uses updatePerson directly)
- Updated resetForm to reset personDetails

## Testing Status

### Compilation
✅ UnifiedCreateOverlay.tsx - No errors
✅ PersonFields.tsx - No errors

### Manual Testing Checklist
- [ ] Person pill creates new person
- [ ] Person save with name only
- [ ] Person save with all optional fields (email, dates, notes, reminders, space, tags)
- [ ] Person edit loads existing data
- [ ] Person update modifies existing person
- [ ] Multi-date support (add/remove/label selection)
- [ ] Date label chips (Birthday/Anniversary/Moving/Custom)
- [ ] Notes formatting toggle
- [ ] Reminders integration
- [ ] Space and tags in "Add details"

### Unit Tests
- [ ] Create person-fields.test.tsx (planned)
- [ ] Test PersonFields rendering
- [ ] Test validation (name required)
- [ ] Test date management
- [ ] Test label selection
- [ ] Test save/update flows

## Next Steps

1. **Run Migration**: Apply `20250123000005_phase7_people_extras.sql` to add Person columns
2. **Manual Testing**: Verify Person create/edit in app
3. **Unit Tests**: Create comprehensive tests for PersonFields
4. **Integration Tests**: Verify Person CRUD with Supabase
5. **Documentation**: Update user docs with Person features

## Known Issues

None - All compilation errors resolved.

## Technical Notes

### Why Person Uses Separate Methods

Person entities are stored in the `people` table (not `records`), so they require dedicated CRUD methods:
- `createPerson()` instead of `create()`
- `updatePerson()` instead of `update()`
- `deletePerson()` instead of `delete()`

This allows Person to have a different schema with Person-specific fields like `dates_json`, `notes_fmt`, etc.

### PersonDate Type

Important dates use a custom type with label categorization:
```typescript
interface PersonDate {
  id: string;
  date: string; // ISO date (YYYY-MM-DD)
  label: 'birthday' | 'anniversary' | 'moving' | 'custom';
}
```

Stored in database as `dates_json` JSONB column, mapped to `dates` array in app.

### FormattingToggle & RemindersList Reuse

Person reuses existing shared components:
- `FormattingToggle` for notes formatting (bullets/numbers/checkboxes)
- `RemindersList` for check-in reminders

This maintains UI consistency across entities (Note, Person, etc.).

---

**Status**: ✅ Complete
**Date**: 2025-01-23
**Phase**: 4 - Person Implementation + Overlay Wiring
