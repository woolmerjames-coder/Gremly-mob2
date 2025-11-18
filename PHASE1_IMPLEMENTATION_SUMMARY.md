# Phase 1 Refactor - Implementation Summary

## Status: Partially Complete ✅

### Completed Items

1. **✅ Repository Layer - `createUnsortedDrop` Helper**
   - Added to `lib/repo/IRepo.ts` (interface)
   - Implemented in `lib/repo/supabase.ts`
   - Implemented in `lib/repo/memory.ts`
   - Creates note with:
     * `subtype: 'catchall'`
     * `labels: ['catchall', 'needs_review']`
     * `origin: 'catchall'`
     * `ai_placed: true`
     * `views.ai_pending: true`

2. **✅ Background Prefill - Network Error Handling**
   - Updated `lib/minddrop/backgroundPrefill.ts`
   - Detects network errors and timeouts
   - On error: keeps `views.ai_pending = true`, returns early
   - On success: sets `views.ai_pending = false`
   - Stores error message in `views.ai_error` for debugging

3. **✅ Type Safety Updates**
   - Extended `CreateRecordInput.views` type to allow `ai_pending` flag
   - Added `[key: string]: any` index signature for extensibility

4. **✅ Zero TypeScript Errors**
   - All modified files compile successfully
   - No new errors introduced

### Pending Work

1. **⏳ CatchAllNotepad.tsx Refactor** (Not yet started)
   - Need to replace current submit handler
   - Remove direct todo/habit/note creation
   - Use `repo.createUnsortedDrop()` as single entry point
   - Call `backgroundPrefill()` asynchronously

2. **⏳ Test Updates** (Not yet started)
   - Update Mind Drop tests to expect notes instead of todos/habits
   - Add tests for `createUnsortedDrop`
   - Add tests for network error handling in `backgroundPrefill`

---

## File Changes Summary

### Files Modified (4)

1. **lib/repo/IRepo.ts** (+21 lines)
   - Added `createUnsortedDrop` method signature
   - Extended `views` type with `ai_pending` and index signature

2. **lib/repo/supabase.ts** (+35 lines)
   - Implemented `createUnsortedDrop` method
   - Creates note with all required fields and flags

3. **lib/repo/memory.ts** (+35 lines)
   - Implemented `createUnsortedDrop` method
   - Same implementation as Supabase repo

4. **lib/minddrop/backgroundPrefill.ts** (+53 lines, -9 lines)
   - Added network error detection and handling
   - Keep `ai_pending = true` on error
   - Set `ai_pending = false` on success
   - Store error message in `views.ai_error`

---

## Diffs

### lib/repo/IRepo.ts

```diff
@@ -40,7 +40,10 @@ export interface CreateRecordInput {
   tags_meta?: TagsMeta | null;
   views?: {
     alsoShowIn?: string[];
+    ai_pending?: boolean; // Phase 1: Mind Drop AI processing state
+    [key: string]: any; // Allow additional view state
   };
   // owner_id is optional - Supabase will set from auth context, Memory repo will use constructor userId
   owner_id?: ID;

@@ -250,6 +253,25 @@ export interface IRepo {
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

### lib/repo/supabase.ts

```diff
@@ -554,6 +554,41 @@ export class SupabaseRepo implements IRepo {
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

### lib/repo/memory.ts

```diff
@@ -942,6 +942,41 @@ export class MemoryRepo implements IRepo {
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

### lib/minddrop/backgroundPrefill.ts

```diff
@@ -41,14 +41,57 @@ export async function backgroundPrefill(
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
         entityId: entity.id,
         error: cortexResult.error,
       });
       return;
     }

@@ -86,6 +129,7 @@ export async function backgroundPrefill(
       minddrop_prefilled_v1: true,
       ai_title_frozen: true,
       ai_tags_frozen: true,
+      ai_pending: false, // AI processing complete
     };
```

---

## Next Steps

### 1. Update CatchAllNotepad.tsx Submit Handler

Replace the current multi-branch submit logic with:

```typescript
const performSave = async () => {
  const trimmed = note.trim();
  if (!trimmed) return;

  try {
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
    
    return { 
      created: { notes: [unsortedNote.id], todos: [], habits: [] },
      createdDetails: [{ type: 'note', id: unsortedNote.id }],
    };
  } catch (error) {
    console.error('[MindDrop] Failed to save', error);
    // Show error toast
  }
};
```

### 2. Update Tests

- Mind Drop tests: Expect notes instead of todos/habits
- Add `createUnsortedDrop` tests
- Add `backgroundPrefill` network error tests

### 3. Manual QA

1. Test offline scenario:
   - Turn off network
   - Submit Mind Drop
   - Verify note created with `ai_pending: true`
   - Verify note stays in unsorted state

2. Test online scenario:
   - Submit Mind Drop
   - Verify note created immediately
   - Verify `backgroundPrefill` enriches note
   - Verify `ai_pending` set to `false`

---

## Benefits of This Approach

1. **Single Code Path**: All Mind Drop submissions create notes first
2. **Graceful Degradation**: Network errors don't break UX
3. **Retryable**: Failed AI can be retried later (manual conversion)
4. **Predictable**: Always creates exactly one note on submit
5. **Type Safe**: Strong TypeScript types throughout

---

## Rollback Plan

If issues arise:
1. Revert CatchAllNotepad.tsx changes (not yet made)
2. Keep new helper methods (they don't break anything)
3. Keep error handling in backgroundPrefill (additive, safe)

---

## Documentation

See `PHASE1_UNSORTED_PIPELINE_PROPOSAL.md` for full specification and diffs.

---

## Commit

```bash
git add lib/repo/IRepo.ts lib/repo/supabase.ts lib/repo/memory.ts lib/minddrop/backgroundPrefill.ts
git commit -m "feat(minddrop): add createUnsortedDrop helper and network error handling

- Add createUnsortedDrop helper in IRepo/SupabaseRepo/MemoryRepo
  - Creates note with subtype='catchall', labels=['catchall','needs_review']
  - Sets views.ai_pending=true for background AI processing
  
- Update backgroundPrefill to handle network errors gracefully
  - On network error/timeout: keep ai_pending=true, return early
  - On success: set ai_pending=false
  - Prevents showing ask mode or conversion UI when offline

Next: Update CatchAllNotepad to use createUnsortedDrop"
```
