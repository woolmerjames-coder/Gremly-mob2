# To-Do Implementation Quick Reference

## Component API

### TodoFields Component

```typescript
import { TodoFields, type TodoDetailsState } from './components/overlay/fields/TodoFields';

// Required Props
<TodoFields
  name={string}                    // Required: Todo name
  onNameChange={(value) => void}   // Required: Name change handler
  dueDate={string | null}          // Required: Due date (YYYY-MM-DD or null)
  onDueDateChange={(value) => void} // Required: Due date change handler
  
  // Optional Props
  dueTime={string | null}          // Optional: Time due (HH:mm format)
  onDueTimeChange={(value) => void} // Optional: Time change handler
  details={TodoDetailsState}        // Optional: Additional details
  onDetailsChange={(details) => void} // Optional: Details change handler
  disabled={boolean}                // Optional: Disable all inputs
/>
```

### TodoDetailsState Type

```typescript
interface TodoDetailsState {
  reminders?: ReminderRow[];  // Array of reminder objects
  spaceId?: string | null;    // Space ID assignment
  notes?: string | null;      // Additional notes
  tags?: string[];            // Array of tag strings
}
```

## TestIDs

### Required Fields
- `todo-name` - Name input field
- `todo-due-date` - Due date input field

### Optional Fields
- `todo-due-time` - Time input field (when onDueTimeChange provided)
- `reminders-add` - Add reminder button (when details.reminders provided)

### Details Section
- `add-details-toggle` - Show/hide details toggle button
- `todo-notes` - Notes textarea
- `todo-space` - Space selector input
- `todo-tag-input` - Tag input field
- `todo-tag-add` - Add tag button
- `todo-tag-chip-{tag}` - Individual tag chip (e.g., `todo-tag-chip-Work`)

## Database Schema

### New Todo Columns
```sql
name               text NOT NULL           -- Primary field (replaces title)
due_time           text NULL               -- HH:mm format with check constraint
reminders_json     jsonb NULL              -- ReminderRow[] array
subtype            text NULL               -- 'reminder' or 'microproject' (AI-only)
notes              text NULL               -- Additional notes
tags               jsonb NULL              -- String array for categories
```

### Migration File
`supabase/migrations/20250123000002_phase7_todos_extras.sql`

## Repo Interface Changes

### CreateRecordInput
```typescript
{
  type: 'todo',
  name: string,                             // Required
  title?: string,                           // Backwards compatibility
  due_date?: string | null,
  due_time?: string | null,                 // HH:mm format
  reminders?: any[],                        // ReminderRow[]
  notes?: string | null,
  tags?: string[] | null,
  subtype?: 'reminder' | 'microproject' | null, // AI-only
  space_id?: string | null,
  // ... other common fields
}
```

## Validation Rules

### Required
- ✅ `name` must be non-empty string
- ✅ `due_date` must be provided (string or valid date)

### Optional
- `due_time` - If provided, must match HH:mm format (validated in schema)
- `reminders` - Array of ReminderRow objects (validated by RemindersList)
- `notes` - Any string
- `tags` - Array of non-empty strings (no duplicates)
- `subtype` - Never set by UI, only by backend AI

## Usage Example

```typescript
const [name, setName] = useState('');
const [dueDate, setDueDate] = useState<string | null>(null);
const [dueTime, setDueTime] = useState<string | null>(null);
const [details, setDetails] = useState<TodoDetailsState>({});

<TodoFields
  name={name}
  onNameChange={setName}
  dueDate={dueDate}
  onDueDateChange={setDueDate}
  dueTime={dueTime}
  onDueTimeChange={setDueTime}
  details={details}
  onDetailsChange={setDetails}
/>

// Validation
const isValid = name.trim() && dueDate;

// Save
await repo.create({
  type: 'todo',
  name,
  title: name,                    // Backwards compatibility
  due_date: dueDate,
  due_time: dueTime || null,
  reminders: details.reminders || undefined,
  notes: details.notes || null,
  tags: details.tags || null,
  space_id: details.spaceId || null,
});
```

## Key Differences from Old API

### Before (Old TodoFields)
```typescript
<TodoFields
  name={string}
  onNameChange={fn}
  dueDate={string}              // Was required string
  onDueDateChange={fn}
  subtype={string}              // Had subtype chips
  onSubtypeChange={fn}
/>
```

### After (New TodoFields)
```typescript
<TodoFields
  name={string}
  onNameChange={fn}
  dueDate={string | null}       // Now nullable
  onDueDateChange={fn}
  dueTime={string | null}       // NEW: Separate time field
  onDueTimeChange={fn}
  details={TodoDetailsState}    // NEW: Consolidated optional fields
  onDetailsChange={fn}
/>
// NO subtype props - AI-only feature
```

## Testing

Run TodoFields tests:
```bash
npm test -- todo-fields.test.tsx
```

Expected: **28/28 tests passing**

## Files Changed

### Core Implementation
- `lib/types.ts` - Todo interface
- `lib/schemas.ts` - todoZ and todoInsertSchema
- `lib/repo/IRepo.ts` - CreateRecordInput
- `lib/repo/memory.ts` - create method
- `lib/repo/supabase.ts` - mapTodoFromDb + create method
- `components/overlay/fields/TodoFields.tsx` - Complete rewrite
- `components/overlay/UnifiedCreateOverlay.tsx` - Integration

### Database
- `supabase/migrations/20250123000002_phase7_todos_extras.sql`

### Tests
- `__tests__/todo-fields.test.tsx` - 28 tests

## Notes

- **No Subtype Chips**: Subtype is AI-only, never shown in UI
- **Reminders Reused**: Uses existing RemindersList component
- **Backwards Compatible**: `title` field kept for old data
- **Validation**: Both name AND due_date required for save
- **Migration Safe**: Backfills `name` from `title` before making NOT NULL
