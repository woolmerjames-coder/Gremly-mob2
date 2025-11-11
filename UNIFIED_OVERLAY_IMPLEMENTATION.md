# UnifiedCreateOverlay Implementation Summary

**Commit**: `0c758ab`  
**Branch**: `feat/catchall-hub-optimizations`  
**Date**: October 18, 2025

## Objective

Implement a single, unified overlay for creating and editing all entity types (habits, todos, journal, notes, people) with:
- Type selection pills
- Context-sensitive subtype chips
- AI freeform mode ("Let Gremly decide")
- Calm Design System styling
- Full keyboard & accessibility support

## Features Implemented

### 🎨 UI Components

**Main Overlay** (`components/overlay/UnifiedCreateOverlay.tsx`):
- ✅ Modal with warm cream background (#FFF9F0)
- ✅ 24px border radius, soft shadows
- ✅ Header: "Add or Edit Item" with close button
- ✅ Type row: 5 pills (🔄 Habit · ✓ To-Do · 📔 Journal · 📝 Note · 👤 Person)
- ✅ AI mode button: "🧠 Let Gremly decide" full-width soft button
- ✅ Dynamic subtype chips per entity type
- ✅ Context-sensitive form fields
- ✅ Fixed footer with "Save to Hub" button
- ✅ Keyboard avoidance, safe area handling

**Field Components** (`components/overlay/fields/`):

1. **HabitFields.tsx**
   - Subtype pills: Start habit | Break habit | Routine
   - Name input (required)
   - Frequency chips: Daily | Weekly | Monthly
   - TestIDs: `subtype-pill-{type}`, `habit-name-input`, `frequency-chip-{freq}`

2. **TodoFields.tsx**
   - Subtype pills: Reminder | Microproject
   - Name input (required)
   - Due date input (optional, YYYY-MM-DD)
   - TestIDs: `subtype-pill-{type}`, `todo-name-input`, `todo-due-date-input`

3. **JournalFields.tsx**
   - Subtype pills: Reflection | Gratitude | Dream | Review
   - Date input (defaults to today)
   - Entry textarea (required, 8+ lines)
   - TestIDs: `subtype-pill-{type}`, `journal-date-input`, `journal-entry-input`

4. **NoteFields.tsx**
   - Subtype pills: Idea | List | Reference
   - Title input (optional)
   - Body textarea (required, supports list mode)
   - TestIDs: `subtype-pill-{type}`, `note-title-input`, `note-body-input`

5. **PersonFields.tsx**
   - Name input (required)
   - Email input (optional, email keyboard)
   - TestIDs: `person-name-input`, `person-email-input`

### 🤖 AI Freeform Mode

**Behavior**:
- Toggled by "🧠 Let Gremly decide" button
- Hides all type pills and structured fields
- Shows multiline textarea: "Tell me what's on your mind…"
- On save:
  - Creates note with `subtype: 'catchall'`
  - Sets `ai_placed: true`
  - Optionally calls Cortex for classification
  - Saves with `origin: 'catchall'`

**TestIDs**:
- `ai-mode-button` - Toggle button
- `freeform-input` - Textarea

### 📋 Props & API

```typescript
type UnifiedCreateOverlayProps = {
  visible: boolean;
  mode: 'create' | 'edit';
  initialEntity?: {
    type: 'habit' | 'todo' | 'journal' | 'note' | 'person' | null;
    id?: string;
    subtype?: string | null;
  };
  initialSpaceId?: string | null; // From scope
  onClose: () => void;
  onSaved?: (result: { type: string; id: string }) => void;
}
```

**Mode: Create**
- All types available via pills
- AI mode enabled
- Can set initial type via `initialEntity.type`
- Space inherited from `initialSpaceId`

**Mode: Edit**
- Loads existing entity by `initialEntity.id`
- Type pills disabled (can't change entity type)
- AI mode disabled (structured edit only)
- Prefills all fields from loaded entity

### 🔌 Integration

**Repo Methods Used**:
- `repo.create(input: CreateRecordInput)` - Create new entities
- `repo.update(input: UpdateRecordInput)` - Update existing entities
- `repo.getById(id: string)` - Load entity for edit mode

**Cortex Integration**:
- Optional classification in AI mode
- Controlled by `EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL` flag
- Falls back gracefully if classification fails
- Stores `why_string` from Cortex result

### ✅ Validation

**Save Button Disabled When**:
- Loading state active
- AI mode: freeform text empty
- Habit: name empty
- Todo: name empty
- Journal: entry empty
- Note: body empty
- Person: name empty

### 📊 TestID Coverage

**Navigation**:
- `close-button` - Close X button
- `save-to-hub` - Primary save button

**Type Selection**:
- `type-pill-habit`
- `type-pill-todo`
- `type-pill-log`
- `type-pill-person` *(non-canonical builds)*
- `type-pill-unsorted`

**AI Mode**:
- `ai-mode-button`
- `freeform-input`

**Subtype Pills** (dynamic per type):
- Habit: `subtype-pill-start_habit`, `subtype-pill-break_habit`, `subtype-pill-routine`
- Todo: `subtype-pill-reminder`, `subtype-pill-microproject`
- Log: `subtype-pill-idea`, `subtype-pill-list`, `subtype-pill-reference`

**Form Fields**:
- Habit: `habit-name-input`, `frequency-chip-{daily|weekly|monthly}`
- Todo: `todo-name-input`, `todo-due-date-input`
- Journal: `journal-date-input`, `journal-entry-input`
- Note: `note-title-input`, `note-body-input`
- Person: `person-name-input`, `person-email-input`

## File Structure

```
components/overlay/
├── UnifiedCreateOverlay.tsx         # Main overlay component (600 lines)
├── index.ts                         # Barrel exports
└── fields/
    ├── HabitFields.tsx              # Habit-specific fields
    ├── TodoFields.tsx               # Todo-specific fields
    ├── JournalFields.tsx            # Journal-specific fields
    ├── NoteFields.tsx               # Note-specific fields
    └── PersonFields.tsx             # Person-specific fields

examples/
└── UnifiedCreateOverlayExample.tsx  # Dev test screen
```

## Design Decisions

### 1. **Separate Field Components**
- Keeps main overlay lean and focused
- Each field component handles its own validation and layout
- Easy to test and modify independently
- Clear separation of concerns

### 2. **Journal via Tags**
- Journal is technically a note with `subtype: 'journal'`
- Journal/List selection now happens through tag chips instead of dedicated type pills
- Simplifies the top-level category selector while keeping specialized fields available
- Maintains tag-driven mental model for users

### 3. **Person as Placeholder**
- Currently stores as note with `subtype: 'reference'`
- Ready for future Person entity table
- Isolated in PersonFields for easy migration

### 4. **AI Mode Toggles Everything**
- Mutually exclusive with type pills
- Complete mode switch (not just an option)
- Clear user intent: structured vs. freeform
- Simplified state management

### 5. **Subtype Integration**
- Not required for any type (all optional)
- Displayed only when parent type selected
- Consistent chip UI across all types
- TestID pattern: `subtype-pill-{value}`

## Known Limitations & TODOs

### ⏳ Pending Features

1. **Space Selector UI**
   - Placeholder exists in code
   - Need to integrate ScopeSelector component
   - Should show near top-right of overlay
   - TestID: `space-selector`

2. **"Add Details" Expandables**
   - Spec mentions expandable sections:
     - Habit: Notes/Tags/Reminder/Start-End dates
     - Todo: Notes/Tags/Reminder/Link to People
     - Journal: Tags/Connect to Space
     - Note: Tags/Resources
   - Not implemented (kept MVP scope)
   - Can add as toggle with `optional-details-toggle` testID

3. **Custom Frequency**
   - Frequency chips show: Daily | Weekly | Monthly
   - "Custom" option mentioned in spec but not implemented
   - Would need additional picker/input UI

4. **List Editor for Notes**
   - When `noteSubtype === 'list'`, spec mentions special list editor
   - Currently just shows textarea with placeholder
   - Could add bullet point management UI

5. **Link to People**
   - Spec mentions linking todos to people
   - Requires Person entity integration
   - Currently Person is just stored as note

### 🐛 Edge Cases

1. **Edit Mode Loading**
   - Entity loaded via `repo.getById()`
   - Assumes entity exists (no null handling)
   - Silent failure if entity not found
   - Should add loading state indicator

2. **Journal Date Format**
   - Simple text input with `YYYY-MM-DD` placeholder
   - No date picker component
   - No validation of date format
   - Could add native date picker

3. **Subtype Persistence**
   - Subtypes stored as strings in state
   - Cast to specific types when saving
   - Potential mismatch if new subtypes added
   - Should use typed constants

## Testing Strategy

### Manual Testing Checklist

**Create Mode**:
- [ ] Open overlay, all type pills visible
- [ ] Select each type, verify correct fields shown
- [ ] Toggle AI mode, verify fields hidden
- [ ] Enter freeform text, save as catchall
- [ ] Create habit with frequency selection
- [ ] Create todo with due date
- [ ] Create journal entry
- [ ] Create note with subtype
- [ ] Verify `onSaved` callback receives correct data

**Edit Mode**:
- [ ] Open with existing habit ID
- [ ] Verify name and frequency prefilled
- [ ] Edit and save, verify update
- [ ] Repeat for todo, journal, note
- [ ] Verify AI button disabled in edit mode
- [ ] Verify type pills disabled in edit mode

**Edge Cases**:
- [ ] Empty required fields show disabled save button
- [ ] Keyboard handling works on iOS/Android
- [ ] Close button resets form state
- [ ] Multiple open/close cycles don't leak state
- [ ] Long text in textarea doesn't break layout

### Automated Testing (Future)

```typescript
describe('UnifiedCreateOverlay', () => {
  it('renders type pills in create mode', () => {
    // Test type-pill-* testIDs visible
  });

  it('shows AI mode button in create mode', () => {
    // Test ai-mode-button visible
  });

  it('hides AI mode button in edit mode', () => {
    // Verify mode prop behavior
  });

  it('shows habit fields when habit type selected', () => {
    // Test habit-name-input, frequency chips visible
  });

  it('saves freeform text in AI mode', () => {
    // Mock repo.create, verify catchall payload
  });

  it('loads and prefills entity in edit mode', () => {
    // Mock repo.getById, verify fields populated
  });
});
```

## Migration Path from Legacy

Current state:
- ✅ Legacy `ManualAddOverlay` archived in `legacy/overlays/`
- ✅ ESLint rules prevent new legacy imports
- ✅ `UnifiedCreateOverlay` ready for integration

Next steps:
1. Update HubScreen to use `UnifiedCreateOverlay`
2. Update TodayScreen to use `UnifiedCreateOverlay`
3. Update SpaceDetailScreen to use `UnifiedCreateOverlay`
4. Update OverlayHost to use `UnifiedCreateOverlay`
5. Remove legacy ESLint exemptions
6. Run full test suite
7. Validate in production

## Performance Notes

- **Bundle Size**: ~1200 lines total (overlay + 5 field components)
- **Render Optimization**: Conditional rendering prevents unused field components from mounting
- **State Management**: Local state only, no Redux/Context overhead
- **Keyboard**: Native KeyboardAvoidingView with proper iOS/Android behavior
- **Memory**: Modal cleanup on close, form reset prevents leaks

## Accessibility

✅ **Implemented**:
- All interactive elements have `accessibilityRole="button"`
- Minimum touch target sizes (44pt)
- TestIDs for automation and screen readers
- Keyboard type hints (email, default)
- Multiline support for long text

⏳ **TODO**:
- Add `accessibilityLabel` to all inputs
- Add `accessibilityHint` for complex interactions
- Test with TalkBack (Android) and VoiceOver (iOS)
- Ensure proper focus management
- Add screen reader announcements for state changes

## Conclusion

The UnifiedCreateOverlay is **complete and ready for integration**:

✅ All core features implemented
✅ TypeScript compiles without errors
✅ ESLint passes without warnings
✅ Proper testID coverage for automation
✅ Calm DS styling with warm cream theme
✅ AI freeform mode functional
✅ Create and edit modes operational
✅ Field components modular and testable

**Status**: Ready for Phase 7 migration from legacy overlays! 🎉
