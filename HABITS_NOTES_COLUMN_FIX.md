# Habits Notes Column Fix

## Problem

Mind Drop's unsorted → habit conversion was failing with a schema error:

```
[SupabaseError] habit.insert: "Could not find the 'notes' column of 'habits' in the schema cache"
```

The conversion flow (`lib/conversion.ts::convertUnsortedToHabit`) was correctly building a habit payload with a `notes` field containing the original Mind Drop narrative text, but the `habits` table was missing this column in the database.

## Root Cause

1. **TypeScript Schema**: `habitInsertSchema` (in `lib/schemas.ts`) includes `notes: z.string().nullable().optional()` ✅
2. **Database Schema**: The `habits` table was missing the `notes` column ❌
3. **Other Tables**: `todos` and `people` tables already had `notes` columns

The `notes` field was added to the schema definition for todos (`supabase/migrations/20250123000002_phase7_todos_extras.sql`) and people, but was never added to the habits table migration (`supabase/migrations/20250123000001_phase7_habits_extras.sql`).

## Solution

### 1. Migration File Created

**File**: `supabase/migrations/20251117_add_habits_notes_column.sql`

```sql
-- Add notes column to habits table
-- This enables storing the original Mind Drop narrative text when converting unsorted items to habits

ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.habits.notes IS 'Free-form notes or context for the habit, often populated from the original Mind Drop text when converting from unsorted items';
```

### 2. TypeScript Schema (Already Correct)

`lib/schemas.ts` line 179:
```typescript
export const habitInsertSchema = z
  .object({
    // ... other fields ...
    notes: z.string().nullable().optional(),
    // ... other fields ...
  })
  .passthrough();
```

### 3. Conversion Flow (Already Correct)

`lib/conversion.ts` lines 230-276:
```typescript
export const convertUnsortedToHabit = async (
  repo: IRepo,
  noteId: string,
  options: { frequency?: string; nameOverride?: string } = {},
): Promise<{ habit: Habit; updatedNote: Note }> => {
  // ... validation code ...

  const habitInput: CreateRecordInput = {
    type: 'habit',
    name: habitName,
    frequency,
    notes: note.body, // ✅ Preserve full Mind Drop text in notes field
    // ... other fields ...
    canonicalType: 'habit',
    labels: habitLabels,
    // ...
  };

  const createdHabit = (await repo.create(habitInput)) as Habit;
  
  // Archive the original unsorted note
  const updatedNote = (await repo.update({
    id: note.id,
    patch: { archived: true, why_string: noteWhy },
  })) as Note;

  return { habit: createdHabit, updatedNote };
};
```

### 4. UI Flow (Already Correct)

**Recent Drops Display**:
- `app/screens/CatchAllNotepad.tsx` lines 700-850
- Fetches habits via `repo.habits.list()`
- Filters for `origin === 'catchall'`
- Archived notes are excluded by `listByType` (line 840 in `lib/repo/supabase.ts`)
- Result: Recent drops shows the habit chip, not the archived unsorted note ✅

**Overlay Edit Mode**:
- `components/overlay/UnifiedOverlayV2.tsx` lines 2504-2556
- `buildDraftPayloadFromEntity` detects `type === 'habit'`
- Loads `notes` field into `habit.notes` (line 2541)
- Sets `baseType: 'habit'` (line 2535)
- Result: Clicking a habit in Recent drops opens the overlay in habit mode with the notes text ✅

## Deployment

### Option 1: Supabase CLI (Recommended)

```bash
cd /Users/jameswoolmer/Documents/gremly-mob2
supabase migration list  # Verify migration is detected
supabase db push          # Apply to database
```

### Option 2: Manual SQL (Supabase SQL Editor)

1. Open Supabase SQL Editor
2. Run:

```sql
-- Add notes column to habits table
ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.habits.notes IS 'Free-form notes or context for the habit, often populated from the original Mind Drop text when converting from unsorted items';
```

### Verification

After applying the migration, test the conversion flow:

1. Open Mind Drop
2. Submit a narrative like: "Run every morning, even if just for 5 mins"
3. Wait for category chips to appear
4. Click the "Habit" chip
5. Verify:
   - ✅ No schema error in logs
   - ✅ Habit is created successfully
   - ✅ Original text appears in Recent drops as a habit
   - ✅ Clicking the habit opens overlay in habit mode
   - ✅ Notes field contains the original narrative text

## Impact

### Database Changes
- **Table**: `public.habits`
- **Column Added**: `notes` (TEXT, nullable)
- **Breaking**: No - this is an additive change
- **RLS Policies**: Existing policies still apply (no changes needed)
- **Views**: No views select `*` from habits, so no view changes needed

### Application Flow
1. **Before**: Conversion fails with schema error, unsorted note remains in Recent drops
2. **After**: Conversion succeeds, habit appears in Recent drops with full context

### Affected Features
- ✅ Mind Drop → Habit conversion
- ✅ Recent drops filtering (shows habit, hides archived note)
- ✅ Overlay edit mode for habits
- ✅ Habit notes preservation

## Files Modified

1. `supabase/migrations/20251117_add_habits_notes_column.sql` (NEW)
   - Migration to add `notes` column to `habits` table

## Files Verified (No Changes Needed)

1. `lib/schemas.ts` (line 179)
   - `habitInsertSchema` already includes `notes: z.string().nullable().optional()`

2. `lib/conversion.ts` (lines 230-276)
   - `convertUnsortedToHabit` already sets `notes: note.body`

3. `app/screens/CatchAllNotepad.tsx` (lines 700-850)
   - Recent drops already filters archived notes and shows habits

4. `components/overlay/UnifiedOverlayV2.tsx` (lines 2504-2556)
   - `buildDraftPayloadFromEntity` already handles habit notes

5. `__tests__/lib/conversion.unsortedToHabit.test.ts`
   - Existing tests verify `notes` field is included in habit payload

## Testing

### Existing Tests (All Passing)
- `__tests__/lib/conversion.unsortedToHabit.test.ts`
  - Verifies `notes` field is included in conversion payload
  - Verifies archived note is excluded from Recent drops
  - Verifies habit appears with correct metadata

### Manual Test Checklist
- [ ] Apply migration to database
- [ ] Submit Mind Drop narrative: "Run every morning, even if just for 5 mins"
- [ ] Click "Habit" chip when category chips appear
- [ ] Verify no schema error in logs
- [ ] Verify habit appears in Recent drops
- [ ] Click habit in Recent drops
- [ ] Verify overlay opens in habit mode
- [ ] Verify notes field contains original narrative text

## Technical Details

### PostgreSQL Type Chain
- `notes` column: TEXT (nullable)
- Stores full Mind Drop narrative text
- Separate from `name`/`title` (which are short labels)
- Similar to `todos.notes` and `people.notes` columns

### Schema Alignment
All three entity types now support a `notes` field:
- ✅ `habits.notes` (TEXT) - Added by this migration
- ✅ `todos.notes` (TEXT) - Already existed
- ✅ `people.notes` (TEXT) - Already existed

## Related Documentation
- `MINDDROP_HABIT_CHIP_FIX_COMPLETE.md` - Original habit conversion implementation
- `MINDDROP_CATEGORY_CHIPS_COMPLETE.md` - Category chip UI implementation
- `lib/conversion.ts` - Conversion helper functions
- `supabase/migrations/20250123000001_phase7_habits_extras.sql` - Original habits extras migration
