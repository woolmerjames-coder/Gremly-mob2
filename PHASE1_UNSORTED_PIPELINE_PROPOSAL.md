# Phase 1: Mind Drop Unsorted Pipeline Refactor

## Summary

Refactor Mind Drop to always create an unsorted note first, then let AI classify it in the background. This ensures a single, predictable create flow and graceful handling of network errors.

## Changes

### 1. Add `createUnsortedDrop` helper in repo layer ✅

**Files modified:**
- `lib/repo/IRepo.ts`
- `lib/repo/supabase.ts`
- `lib/repo/memory.ts`

**New method signature:**
```typescript
createUnsortedDrop(text: string, opts?: {
  spaceId?: ID | null;
  dropId?: string | null;
  sourceMessageId?: string | null;
}): Promise<Note>
```

**Behavior:**
- Creates a note with subtype 'catchall'
- Sets labels: ['catchall', 'needs_review']
- Sets origin: 'catchall'
- Sets ai_placed: true
- Sets views.ai_pending: true (cleared after AI completes)
- Returns Note record

**Diff for `lib/repo/IRepo.ts`:**
```diff
   /**
    * Convenience helper to add an item marked as unsorted (catch-all inbox).
    * Forces ai_placed=true and origin='catchall'. spaceId may be null for unassigned.
    */
   addUnsorted(spaceId: ID | null, input: CreateRecordInput): Promise<AppRecord>;
 
+  /**
+   * Phase 1: Create unsorted Mind Drop note before AI classification.
+   * Always creates a note with:
+   * - subtype: 'catchall'
+   * - labels: ['catchall', 'needs_review']
+   * - origin: 'catchall'
+   * - ai_placed: true
+   * - views.ai_pending: true (will be set to false after AI completes)
+   * 
+   * This ensures Mind Drop always creates a single note first, then AI decides what to do with it.
+   */
+  createUnsortedDrop(text: string, opts?: {
+    spaceId?: ID | null;
+    dropId?: string | null;
+    sourceMessageId?: string | null;
+  }): Promise<Note>;
```

**Also updated CreateRecordInput.views type:**
```diff
   views?: {
     alsoShowIn?: string[];
+    ai_pending?: boolean; // Phase 1: Mind Drop AI processing state
+    [key: string]: any; // Allow additional view state
   };
```

**Diff for `lib/repo/supabase.ts`:**
```diff
   async addUnsorted(spaceId: string | null, input: CreateRecordInput): Promise<AppRecord> {
     return this.create({
       ...input,
       space_id: spaceId ?? null,
       ai_placed: true,
       origin: 'catchall',
     });
   }
 
+  /**
+   * Phase 1: Create unsorted Mind Drop note before AI classification.
+   * Always creates a note with catchall subtype and ai_pending flag.
+   */
+  async createUnsortedDrop(
+    text: string,
+    opts?: {
+      spaceId?: ID | null;
+      dropId?: string | null;
+      sourceMessageId?: string | null;
+    },
+  ): Promise<Note> {
+    const trimmedText = text.trim();
+    const firstLine = trimmedText.split('\n')[0] || 'Untitled';
+    
+    const record = await this.create({
+      type: 'note',
+      subtype: 'catchall',
+      title: firstLine,
+      body: trimmedText,
+      labels: ['catchall', 'needs_review'],
+      origin: 'catchall',
+      ai_placed: true,
+      space_id: opts?.spaceId ?? null,
+      dropId: opts?.dropId ?? null,
+      sourceMessageId: opts?.sourceMessageId ?? null,
+      views: {
+        ai_pending: true, // Will be set to false after AI classification completes
+      },
+    });
+
+    if (record.type !== 'note') {
+      throw new Error('Expected note record from createUnsortedDrop');
+    }
+
+    return record;
+  }
```

**Same implementation added to `lib/repo/memory.ts`.**

---

### 2. Update `backgroundPrefill` to handle network errors ✅

**File modified:** `lib/minddrop/backgroundPrefill.ts`

**Changes:**
1. Wrap `callClassify` in try/catch to detect network errors
2. On network error/timeout:
   - Keep `views.ai_pending = true`
   - Store error message in `views.ai_error`
   - Return early (no ask mode, no conversion)
3. On success:
   - Set `views.ai_pending = false`
   - Set freeze flags as before

**Diff:**
```diff
 export async function backgroundPrefill(
   entity: PrefillEntity,
   rawSentence: string,
 ): Promise<void> {
   const startTime = Date.now();
   
   console.log('[BackgroundPrefill] start', {
     entityId: entity.id,
     entityType: entity.type,
     textPreview: rawSentence.substring(0, 50),
   });
 
   try {
     // Step 1: Call Cortex to generate title + tags
-    const cortexResult = await callClassify({
-      text: rawSentence,
-    });
-
-    if (!cortexResult.ok) {
-      console.warn('[BackgroundPrefill] Cortex call failed', {
-        entityId: entity.id,
-        error: cortexResult.error,
-      });
-      return;
-    }
+    let cortexResult;
+    let isNetworkError = false;
+    
+    try {
+      cortexResult = await callClassify({
+        text: rawSentence,
+      });
+    } catch (error) {
+      // Check if this is a network error or timeout
+      const errorMsg = error instanceof Error ? error.message : String(error);
+      isNetworkError = 
+        errorMsg.includes('Network') ||
+        errorMsg.includes('timeout') ||
+        errorMsg.includes('fetch') ||
+        errorMsg.includes('ECONNREFUSED');
+      
+      if (isNetworkError) {
+        console.warn('[BackgroundPrefill] Network error - keeping ai_pending=true', {
+          entityId: entity.id,
+          error: errorMsg,
+        });
+        
+        // Update views to keep ai_pending=true and return early
+        const existingViews = entity.views ?? {};
+        const { error: updateError } = await supabase
+          .from(entity.type === 'note' ? 'notes' : entity.type === 'todo' ? 'todos' : 'habits')
+          .update({
+            views: {
+              ...existingViews,
+              ai_pending: true, // Keep pending state for retry
+              ai_error: errorMsg, // Track error for debugging
+            },
+          })
+          .eq('id', entity.id);
+        
+        if (updateError) {
+          console.error('[BackgroundPrefill] Failed to update ai_pending on error', {
+            entityId: entity.id,
+            error: updateError.message,
+          });
+        }
+        
+        return; // Early return - don't show ask mode or try conversion
+      }
+      
+      // Re-throw non-network errors
+      throw error;
+    }
+
+    if (!cortexResult.ok) {
+      console.warn('[BackgroundPrefill] Cortex call failed', {
+        entityId: entity.id,
+        error: cortexResult.error,
+      });
+      return;
+    }
 
     const { classification } = cortexResult;
     const aiTitle = classification?.title || null;
@@ -86,6 +129,7 @@ export async function backgroundPrefill(
       minddrop_prefilled_v1: true,
       ai_title_frozen: true,
       ai_tags_frozen: true,
+      ai_pending: false, // AI processing complete
     };
```

---

### 3. Update CatchAllNotepad.tsx to use `createUnsortedDrop` (TODO)

**File to modify:** `app/screens/CatchAllNotepad.tsx`

**Current behavior:**
- On submit, calls `cortexDecide` to classify
- Based on classification, creates todo/habit/note directly via `repo.create()`
- Multiple create paths depending on action type

**Proposed behavior:**
- On submit, call `repo.createUnsortedDrop(text)` immediately
- Store the created note ID
- Call `backgroundPrefill(note, text)` asynchronously (void)
- No more direct creation of todos/habits - only unsorted notes
- Remove branches that handle `create.todo`, `create.habit`, `create.note` actions

**Pseudo-code:**
```typescript
const performSave = async () => {
  const trimmed = note.trim();
  if (!trimmed) return;

  // Step 1: Create unsorted note immediately
  const unsortedNote = await repo.createUnsortedDrop(trimmed, {
    spaceId: null,
    dropId: createDropId(),
    sourceMessageId: createSubmissionId(),
  });

  // Step 2: Trigger background AI classification (fire-and-forget)
  void backgroundPrefill(unsortedNote, trimmed);

  // Step 3: Show confirmation and clear input
  setNote('');
  showActionToast('Saved to inbox');
  
  return { created: { notes: [unsortedNote.id], todos: [], habits: [] } };
};
```

**Impact:**
- Removes all `create.todo`, `create.habit` action handling
- Simplifies submit flow to single code path
- AI classification happens in background via `backgroundPrefill`
- User sees immediate feedback (note saved)

---

## Testing Strategy

### Unit Tests to Update

1. **Mind Drop tests** - Update expectations:
   - All Mind Drop submissions create notes (not todos/habits)
   - Notes have `subtype: 'catchall'`
   - Notes have `views.ai_pending: true` initially
   - Background prefill sets `views.ai_pending: false` on success

2. **Background prefill tests** - Add new tests:
   - Network error → keeps `ai_pending: true`
   - Timeout → keeps `ai_pending: true`
   - Success → sets `ai_pending: false`
   - Non-network error → propagates normally

3. **Repo tests** - Add tests for `createUnsortedDrop`:
   - Creates note with correct fields
   - Sets all required labels and views
   - Returns Note type

### Integration Tests

1. **End-to-end Mind Drop flow:**
   ```
   User types "buy milk" → Submit
   Expected:
   - Note created immediately with title="buy milk", subtype="catchall"
   - views.ai_pending = true
   - backgroundPrefill called with note
   - After AI completes: views.ai_pending = false, title may update
   ```

2. **Network error scenario:**
   ```
   User types "doctor appointment" → Submit (network offline)
   Expected:
   - Note created with title="doctor appointment"
   - views.ai_pending = true
   - backgroundPrefill catches network error
   - views.ai_pending stays true
   - views.ai_error contains error message
   - User can retry later (manual conversion)
   ```

---

## Migration Notes

### Database Schema
- No schema changes required
- `views` column already exists as JSONB
- `ai_pending` is just a flag in the JSONB object

### Backward Compatibility
- Existing Mind Drop items (todos/habits) remain unchanged
- New Mind Drop submissions create notes first
- Old code paths (direct todo/habit creation) will be removed

### Rollback Plan
If issues arise:
1. Revert `CatchAllNotepad.tsx` to previous version
2. Keep `createUnsortedDrop` helper (doesn't break anything)
3. Background prefill error handling is additive (safe to keep)

---

## Next Steps

1. ✅ Create `createUnsortedDrop` helper in repo layer
2. ✅ Update `backgroundPrefill` to handle network errors
3. ⏳ Update `CatchAllNotepad.tsx` submit handler
4. ⏳ Update Mind Drop tests
5. ⏳ Run full test suite
6. ⏳ Manual QA testing

---

## Commit Message

```
feat(minddrop): always create unsorted note first and mark AI pending on error

- Add createUnsortedDrop helper in IRepo/SupabaseRepo/MemoryRepo
  - Creates note with subtype='catchall', labels=['catchall','needs_review']
  - Sets views.ai_pending=true for background AI processing
  
- Update backgroundPrefill to handle network errors gracefully
  - On network error/timeout: keep ai_pending=true, return early
  - On success: set ai_pending=false
  - Prevents showing ask mode or conversion UI when offline

- (TODO) Update CatchAllNotepad to use createUnsortedDrop
  - Remove direct todo/habit creation branches
  - Single unsorted-create pipeline for all Mind Drop submissions

Closes #XYZ
```
