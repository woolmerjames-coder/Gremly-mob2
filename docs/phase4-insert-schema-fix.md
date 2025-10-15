# Phase 4 Insert Schema Fix - Implementation Summary

## Problem Fixed

Previously, the Supabase repository was sending `created_at`, `updated_at`, and `owner_id` fields in INSERT statements, which caused errors:
- Invalid datetime format errors
- RLS conflicts with explicit owner_id
- Database attempting to parse client-generated timestamps

## Solution

Introduced separate **Insert Schemas** that exclude auto-generated fields and rely on database defaults.

---

## Files Changed (6 files)

### 1. `lib/schemas.ts` (MODIFIED)
**Changes**:
- Added JSDoc explaining Row vs Insert schemas
- Created three new Insert schemas:
  - `habitInsertSchema` - excludes id, owner_id, created_at, updated_at
  - `todoInsertSchema` - excludes id, owner_id, created_at, updated_at
  - `noteInsertSchema` - excludes id, owner_id, created_at, updated_at
- Kept existing Row schemas (`habitZ`, `todoZ`, `noteZ`) for validating database results

**Insert Schema Example**:
```typescript
export const todoInsertSchema = z.object({
  space_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  body: z.string().optional().nullable(),
  due_date: z.string().datetime().nullable().optional(),
  undefined_due: z.boolean().default(true),
  ai_placed: z.boolean().default(false),
  // Excluded: id, owner_id, created_at, updated_at
});
```

### 2. `lib/repo/IRepo.ts` (MODIFIED)
**Changes**:
- Made `owner_id` optional in `CreateRecordInput` interface
- Added JSDoc noting that id, owner_id, timestamps are auto-generated
- Removed unused imports (Habit, Note)

**Before**:
```typescript
export interface CreateRecordInput {
  // ...
  owner_id: ID; // required
}
```

**After**:
```typescript
export interface CreateRecordInput {
  // ...
  owner_id?: ID; // optional - repos handle internally
}
```

### 3. `lib/repo/supabase.ts` (MODIFIED)
**Changes**:
- Added Insert schema imports
- Updated `create()` method to use Insert schemas for validation
- Removed manual timestamp generation (`nowIso()`)
- Removed explicit `owner_id` assignment
- Updated `update()` method to build minimal patch objects
- Never sends `created_at`, `owner_id`, or `id` in updates
- Added JSDoc explaining Insert vs Row schema usage

**Key Code Changes**:

**create() method**:
```typescript
// OLD - Sent timestamps and owner_id
const data = {
  title: input.title,
  created_at: nowIso(),  // ❌ Caused errors
  updated_at: nowIso(),  // ❌ Caused errors
  owner_id: userId,      // ❌ Conflicts with RLS
};

// NEW - Uses Insert schema, DB handles auto-fields
const payload = todoInsertSchema.parse({
  title: input.title,
  body: input.body ?? null,
  undefined_due: input.undefined_due ?? true,
  ai_placed: input.ai_placed ?? false,
  // Database auto-generates: id, owner_id, created_at, updated_at
});
```

**update() method**:
```typescript
// OLD - Sent updated_at
const data = { ...patch, updated_at: nowIso() };

// NEW - Builds minimal patch, DB handles updated_at
const updatePayload: Record<string, unknown> = {};
if ('title' in patch && patch.title !== undefined) {
  updatePayload.title = patch.title;
}
// Never include: id, owner_id, created_at
```

### 4. `lib/repo/memory.ts` (MODIFIED)
**Changes**:
- Updated `create()` method to handle optional `owner_id`
- Falls back to `currentUserId` when `owner_id` not provided
- Maintains same behavior for tests and development

**Code**:
```typescript
async create(input: CreateRecordInput): Promise<AppRecord> {
  const now = nowIso();
  const ownerId = input.owner_id || this.currentUserId; // Fallback to constructor userId
  // ...
}
```

### 5. `app/(dev)/DevLogin.tsx` (MODIFIED)
**Changes**:
- Removed `owner_id` from create() call
- Added comment explaining DB auto-generation
- Simplified smoke test to use minimal fields

**Before**:
```typescript
await repo.create({
  type: 'todo',
  title: 'Phase 4 smoke',
  body: 'created from Dev Login',
  undefined_due: true,
  ai_placed: false,
  owner_id: userId,  // ❌ No longer needed
});
```

**After**:
```typescript
await repo.create({
  type: 'todo',
  title: 'Phase 4 smoke',
  body: 'created from Dev Login',
  undefined_due: true,
  ai_placed: false,
  // DB auto-generates: id, owner_id, created_at, updated_at
});
```

### 6. `PHASE4_NOTES.md` (MODIFIED)
**Changes**:
- Added new section: "Database Schema Patterns"
- Documented Insert vs Row schema differences
- Explained why this matters (error prevention)
- Added examples of wrong vs correct usage
- Noted that both Memory and Supabase repos follow same pattern

**Key Documentation**:
```markdown
### Insert vs Row Schemas

**Row Schemas**: Validate complete records from database (all fields)
**Insert Schemas**: Validate data before insert (exclude auto-generated fields)

Database handles:
- id: UUID default (uuid_generate_v4())
- owner_id: RLS sets from auth.uid()
- created_at, updated_at: Default NOW() or triggers
```

### 7. `components/OverlayHost.tsx` (MODIFIED - Bug Fix)
**Changes**:
- Moved `useNavigation` hook call before conditional return
- Fixed React Hooks rules-of-hooks lint error

---

## How It Works Now

### Create Flow (Supabase)

1. **Client sends minimal data**:
   ```typescript
   repo.create({
     type: 'todo',
     title: 'My todo',
     body: 'Description',
   });
   ```

2. **Insert schema validates**:
   - Checks required fields (title)
   - Validates types (string, boolean, etc.)
   - Removes any invalid fields

3. **Supabase INSERT**:
   ```sql
   INSERT INTO todos (title, body, undefined_due, ai_placed)
   VALUES ('My todo', 'Description', true, false)
   RETURNING *;
   ```

4. **Database auto-generates**:
   - `id`: `uuid_generate_v4()`
   - `owner_id`: RLS policy sets from `auth.uid()`
   - `created_at`: `DEFAULT NOW()`
   - `updated_at`: `DEFAULT NOW()`

5. **Result returned with all fields**:
   ```json
   {
     "id": "123e4567-e89b-12d3-a456-426614174000",
     "owner_id": "user-uuid-from-auth",
     "title": "My todo",
     "body": "Description",
     "created_at": "2025-10-15T12:00:00Z",
     "updated_at": "2025-10-15T12:00:00Z",
     "undefined_due": true,
     "ai_placed": false
   }
   ```

6. **Row schema validates result**:
   - Ensures all required fields present
   - Validates datetime formats
   - Returns typed AppRecord

### Update Flow

1. **Client sends only changed fields**:
   ```typescript
   repo.update({
     id: 'todo-id',
     patch: { title: 'Updated title' }
   });
   ```

2. **Update builds minimal payload**:
   - Only includes fields in `patch`
   - Never includes: `id`, `owner_id`, `created_at`
   - Database trigger can handle `updated_at`

3. **Supabase UPDATE**:
   ```sql
   UPDATE todos
   SET title = 'Updated title'
   WHERE id = 'todo-id'
   RETURNING *;
   ```

---

## Benefits

### ✅ Error Prevention
- No more "invalid datetime" errors
- No RLS conflicts with owner_id
- Database is source of truth for auto-fields

### ✅ Type Safety
- Zod validates both insert and result data
- TypeScript catches missing required fields
- Insert schemas prevent sending wrong fields

### ✅ Consistency
- Both Memory and Supabase repos follow same pattern
- Tests use same minimal create() calls
- Easy to switch backends

### ✅ Database Best Practices
- Leverages database defaults
- Uses RLS for security
- Triggers can handle updated_at
- UUID generation at database level

---

## Testing Results

### Type Check
```bash
npm run typecheck
✅ No errors
```

### Lint
```bash
npm run lint
✅ No errors (fixed React Hook rule)
```

### Tests
```bash
npm test
✅ All tests pass
```

---

## Migration Notes

### For Existing Code

If you have existing `repo.create()` calls that send `owner_id`, `created_at`, or `updated_at`:

**Before (will error)**:
```typescript
repo.create({
  type: 'habit',
  title: 'Exercise',
  frequency: 'daily',
  owner_id: userId,           // ❌ Remove
  created_at: nowIso(),       // ❌ Remove
  updated_at: nowIso(),       // ❌ Remove
});
```

**After (works)**:
```typescript
repo.create({
  type: 'habit',
  title: 'Exercise',
  frequency: 'daily',
  // Database handles: id, owner_id, created_at, updated_at
});
```

### For Database Schema

Ensure your Supabase tables have:

1. **UUID default for id**:
   ```sql
   id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
   ```

2. **Timestamp defaults**:
   ```sql
   created_at TIMESTAMPTZ DEFAULT NOW()
   updated_at TIMESTAMPTZ DEFAULT NOW()
   ```

3. **RLS policy for owner_id**:
   ```sql
   CREATE POLICY "Users can CRUD their own records" ON todos
   FOR ALL USING (auth.uid() = owner_id);
   ```

4. **Optional: Update trigger**:
   ```sql
   CREATE TRIGGER update_todos_updated_at
   BEFORE UPDATE ON todos
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();
   ```

---

## Summary

✅ **6 files modified** to separate Insert from Row schemas  
✅ **Database now handles** id, owner_id, created_at, updated_at  
✅ **Insert schemas validate** only user-provided fields  
✅ **Row schemas validate** complete database results  
✅ **No more datetime errors** from client-generated timestamps  
✅ **RLS works correctly** without explicit owner_id  
✅ **All tests pass** with new schema pattern  
✅ **Lint errors fixed** (React Hooks rules)  
✅ **Type-safe** with Zod validation at both ends  

The Phase 4 create() errors are now resolved! 🎉
