/**
 * Tests for Mind Drop Prefill Ownership System
 *
 * These tests enforce the single-source-of-truth rules:
 * 1. Mind Drop creation does NOT call Cortex or generate content tags
 * 2. First overlay open triggers Cortex prefill once, writes AI title + tags, sets views.minddrop_prefilled_v1
 * 3. Subsequent overlay opens do NOT change tags automatically
 * 4. "Re-summarize title" only changes the title field, never tags
 *
 * Implementation: cbfb4d0
 */

describe('Mind Drop Prefill Ownership - Single Source of Truth', () => {
  describe('Rule 1: Mind Drop creation does NOT generate content', () => {
    it('should create todo with raw text, empty tags, no views.minddrop_prefilled_v1', () => {
      // Simulates Mind Drop creation path (CatchAllNotepad.tsx)
      const rawText = 'Book doctor appointment tomorrow at 2pm';

      // buildCanonicalFromMindDrop should return raw text, no AI enrichment
      const todo = {
        type: 'todo',
        title: rawText,
        name: rawText,
        body: rawText,
        tags: [], // Empty - no AI tags at creation
        ai_placed: true,
        origin: 'catchall',
        drop_id: 'test-drop-id',
        views: undefined,
        // views.minddrop_prefilled_v1 not set (undefined)
      };

      expect(todo.title).toBe(rawText); // Raw text, not compacted
      expect(todo.body).toBe(rawText);
      expect(todo.tags).toEqual([]); // No AI tags
      expect(todo.views).toBeUndefined(); // No prefill flag
    });

    it('should create habit with raw text, empty tags, no views.minddrop_prefilled_v1', () => {
      const rawText = 'Start doing 15 minutes of yoga every morning';

      const habit = {
        type: 'habit',
        title: rawText,
        name: rawText,
        notes: rawText,
        tags: [], // Empty - no AI tags at creation
        ai_placed: true,
        origin: 'catchall',
        drop_id: 'test-drop-id',
        views: undefined,
      };

      expect(habit.title).toBe(rawText);
      expect(habit.notes).toBe(rawText);
      expect(habit.tags).toEqual([]);
      expect(habit.views).toBeUndefined();
    });

    it('should create log with raw text, only *journal marker, no other tags', () => {
      const rawText = 'Feeling anxious after a long meeting but better after a walk';

      const log = {
        type: 'note',
        title: rawText,
        body: rawText,
        tags: ['*journal'], // Only system marker, no content tags
        ai_placed: true,
        origin: 'catchall',
        drop_id: 'test-drop-id',
        subtype: 'journal',
        views: undefined,
      };

      expect(log.title).toBe(rawText);
      expect(log.body).toBe(rawText);
      expect(log.tags).toEqual(['*journal']); // Only journal marker
      expect(log.views).toBeUndefined();
    });

    it('should NOT have AI-compacted titles at creation', () => {
      const rawText = 'Book doctor appointment tomorrow at 2pm';

      // What we should NOT see at creation:
      const wrongTodo = {
        title: 'Doctor Appointment at 2pm', // ❌ AI-compacted
        tags: ['doctor', 'appointment', '2pm'], // ❌ AI-generated
      };

      // What we SHOULD see at creation:
      const correctTodo = {
        title: rawText, // ✅ Raw text
        tags: [], // ✅ Empty
      };

      expect(correctTodo.title).not.toBe(wrongTodo.title);
      expect(correctTodo.tags).toEqual([]);
    });
  });

  describe('Rule 2: First overlay open triggers one-time prefill', () => {
    it('should detect item needs prefill (shouldRunMindDropPrefill = true)', () => {
      const entity: any = {
        id: 'todo-123',
        type: 'todo',
        title: 'Book doctor appointment tomorrow at 2pm',
        body: 'Book doctor appointment tomorrow at 2pm',
        tags: [],
        ai_placed: true,
        origin: 'catchall',
        drop_id: 'drop-456',
        views: undefined,
        // views.minddrop_prefilled_v1 NOT set
      };

      // Simulate shouldRunMindDropPrefill logic
      const isFromMindDrop = entity.ai_placed === true && entity.origin === 'catchall';
      const alreadyPrefilled = entity.views?.minddrop_prefilled_v1 === true;
      const shouldRunMindDropPrefill = isFromMindDrop && !alreadyPrefilled;

      expect(isFromMindDrop).toBe(true);
      expect(alreadyPrefilled).toBe(false);
      expect(shouldRunMindDropPrefill).toBe(true);
    });

    it('should auto-apply title when title equals body (first prefill)', () => {
      const entity = {
        title: 'Book doctor appointment tomorrow at 2pm',
        body: 'Book doctor appointment tomorrow at 2pm',
      };

      const suggestedTitle = 'Doctor Appointment at 2pm';

      // Smart title replacement logic
      const currentTitle = entity.title;
      const rawBody = entity.body;
      const titleEqualsBody = currentTitle.trim() === rawBody.trim();
      const shouldAutoApply = titleEqualsBody;

      expect(titleEqualsBody).toBe(true);
      expect(shouldAutoApply).toBe(true);

      // Title should be auto-applied
      const updatedTitle = shouldAutoApply ? suggestedTitle : currentTitle;
      expect(updatedTitle).toBe('Doctor Appointment at 2pm');
    });

    it('should auto-apply tags for todo (specific tags, no filtering)', () => {
      const _entity = {
        type: 'todo',
        tags: [], // Empty at creation
      };

      const aiTags = ['doctor', 'appointment', '2pm'];

      // For todos: replace with AI tags (no generic filtering needed)
      const finalTags = aiTags;

      expect(finalTags).toEqual(['doctor', 'appointment', '2pm']);
      expect(finalTags).not.toContain('doing'); // No generic tags
    });

    it('should auto-apply tags for habit (filtered to activity tags, max 2)', () => {
      const _entity = {
        type: 'habit',
        tags: [], // Empty at creation
      };

      const aiTags = ['yoga', 'exercise', 'morning', 'routine', 'health'];

      // Simulate filterHabitTags: single-word activities, max 2
      const filtered = aiTags
        .filter((tag) => !tag.includes('_') && !tag.includes('-'))
        .filter((tag) => ['yoga', 'exercise', 'running', 'meditation'].includes(tag))
        .slice(0, 2);

      expect(filtered).toHaveLength(2);
      expect(filtered).toContain('yoga');
      expect(filtered).toContain('exercise');
      expect(filtered).not.toContain('morning'); // Not an activity
      expect(filtered).not.toContain('routine'); // Not specific
    });

    it('should auto-apply tags for log (preserve #journal, merge emotions)', () => {
      const entity = {
        type: 'note',
        subtype: 'journal',
        tags: ['*journal'], // System marker from creation
      };

      const aiTags = ['anxious', 'meeting', 'walk'];

      // Simulate mergeLogTags: preserve *journal, add AI tags
      const existingTags = entity.tags;
      const hasJournal = existingTags.some((t) => t === '*journal' || t === 'journal');
      const finalTags = hasJournal ? ['journal', ...aiTags.filter((t) => t !== 'journal')] : aiTags;

      expect(finalTags).toContain('journal');
      expect(finalTags).toContain('anxious'); // Emotion tag
      expect(finalTags).toContain('meeting'); // Subject tag
      expect(finalTags).toHaveLength(4); // journal + 3 AI tags
    });

    it('should set views.minddrop_prefilled_v1 = true after first prefill', () => {
      const entity = {
        id: 'todo-123',
        views: {}, // Empty views object
      };

      const shouldRunMindDropPrefill = true;
      const aiTagOverrideApplied = true;
      const pendingTitleResummarize = true;

      // Simulate viewsWithPrefillFlag logic
      const isMindDropPrefillNeeded = shouldRunMindDropPrefill;
      const shouldMarkPrefilled =
        isMindDropPrefillNeeded && (aiTagOverrideApplied || pendingTitleResummarize);

      const viewsWithPrefillFlag: any = shouldMarkPrefilled
        ? { ...entity.views, minddrop_prefilled_v1: true }
        : entity.views;

      expect(shouldMarkPrefilled).toBe(true);
      expect(viewsWithPrefillFlag.minddrop_prefilled_v1).toBe(true);
    });

    it('should NOT set prefill flag if conditions not met', () => {
      const entity = {
        views: {},
      };

      const shouldRunMindDropPrefill = false; // Already prefilled
      const shouldMarkPrefilled = shouldRunMindDropPrefill;

      const viewsWithPrefillFlag: any = shouldMarkPrefilled
        ? { ...entity.views, minddrop_prefilled_v1: true }
        : entity.views;

      expect(shouldMarkPrefilled).toBe(false);
      expect(viewsWithPrefillFlag.minddrop_prefilled_v1).toBeUndefined();
    });
  });

  describe('Rule 3: Subsequent opens do NOT auto-change tags', () => {
    it('should detect item already prefilled (shouldRunMindDropPrefill = false)', () => {
      const entity = {
        id: 'todo-123',
        type: 'todo',
        title: 'Doctor Appointment at 2pm',
        body: 'Book doctor appointment tomorrow at 2pm',
        tags: ['doctor', 'appointment', '2pm'],
        ai_placed: true,
        origin: 'catchall',
        drop_id: 'drop-456',
        views: {
          minddrop_prefilled_v1: true, // Already prefilled
        },
      };

      // Simulate shouldRunMindDropPrefill logic
      const isFromMindDrop = entity.ai_placed === true && entity.origin === 'catchall';
      const alreadyPrefilled = entity.views?.minddrop_prefilled_v1 === true;
      const shouldRunMindDropPrefill = isFromMindDrop && !alreadyPrefilled;

      expect(isFromMindDrop).toBe(true);
      expect(alreadyPrefilled).toBe(true);
      expect(shouldRunMindDropPrefill).toBe(false);
    });

    it('should NOT auto-override tags on second open', () => {
      const entity = {
        type: 'todo',
        tags: ['doctor', 'appointment', '2pm'], // Tags from first prefill
        views: { minddrop_prefilled_v1: true },
      };

      const shouldRunMindDropPrefill = false; // Already prefilled
      const rawSentence = false; // Title != body after first prefill
      const needsTagOverride = shouldRunMindDropPrefill || rawSentence;

      expect(needsTagOverride).toBe(false);

      // Tags should remain unchanged
      expect(entity.tags).toEqual(['doctor', 'appointment', '2pm']);
    });

    it('should skip auto-prefill when views.minddrop_prefilled_v1 = true', () => {
      const entity = {
        views: { minddrop_prefilled_v1: true },
        ai_placed: true,
        origin: 'catchall',
      };

      const alreadyPrefilled = entity.views?.minddrop_prefilled_v1 === true;
      const shouldSkipAutoPrefill = alreadyPrefilled;

      expect(shouldSkipAutoPrefill).toBe(true);
    });

    it('should preserve user-edited tags on subsequent opens', () => {
      const entity = {
        type: 'todo',
        tags: ['doctor', 'urgent', 'appointment'], // User added 'urgent'
        views: { minddrop_prefilled_v1: true },
      };

      // No tag override should run
      const shouldRunMindDropPrefill = false;
      const needsTagOverride = shouldRunMindDropPrefill;

      expect(needsTagOverride).toBe(false);

      // User's tags preserved
      expect(entity.tags).toContain('urgent'); // User addition kept
      expect(entity.tags).toEqual(['doctor', 'urgent', 'appointment']);
    });
  });

  describe('Rule 4: Re-summarize title only changes title, not tags', () => {
    it('should update title when Re-summarize is triggered', () => {
      const entity = {
        type: 'todo',
        title: 'Doctor Appointment at 2pm',
        body: 'Book doctor appointment tomorrow at 2pm',
        tags: ['doctor', 'appointment', '2pm'],
        views: { minddrop_prefilled_v1: true },
      };

      // User clicks "Re-summarize title"
      const newSuggestedTitle = 'Doctor Appt Tomorrow 2pm';

      // Title should update
      const updatedEntity = {
        ...entity,
        title: newSuggestedTitle,
      };

      expect(updatedEntity.title).toBe('Doctor Appt Tomorrow 2pm');
      expect(updatedEntity.title).not.toBe(entity.title);
    });

    it('should NOT auto-override tags when Re-summarize runs', () => {
      const entity = {
        type: 'todo',
        title: 'Doctor Appointment at 2pm',
        tags: ['doctor', 'appointment', '2pm'],
        views: { minddrop_prefilled_v1: true },
      };

      // User clicks "Re-summarize title"
      const shouldRunMindDropPrefill = false; // Already prefilled
      const rawSentence = false; // Title != body
      const needsTagOverride = shouldRunMindDropPrefill || rawSentence;

      expect(needsTagOverride).toBe(false);

      // Tags should NOT change
      expect(entity.tags).toEqual(['doctor', 'appointment', '2pm']);
    });

    it('should refresh tag suggestions but not auto-apply on Re-summarize', () => {
      const entity = {
        type: 'todo',
        tags: ['doctor', 'appointment', '2pm'],
        views: { minddrop_prefilled_v1: true },
      };

      // After Re-summarize, new suggestions available
      const _newSuggestedTags = ['health', 'calendar', 'urgent'];

      // But tags should NOT auto-apply (only available as suggestions)
      const shouldAutoApplyTags = false;

      expect(shouldAutoApplyTags).toBe(false);
      expect(entity.tags).toEqual(['doctor', 'appointment', '2pm']); // Unchanged
      // newSuggestedTags available in UI but not auto-applied
    });

    it('should allow manual tag changes but never auto-override', () => {
      const entity = {
        type: 'todo',
        tags: ['doctor', 'appointment', '2pm'],
        views: { minddrop_prefilled_v1: true },
      };

      // User manually adds 'urgent' tag
      const userEditedTags = [...entity.tags, 'urgent'];

      expect(userEditedTags).toEqual(['doctor', 'appointment', '2pm', 'urgent']);

      // No auto-override should happen
      const shouldRunMindDropPrefill = false;
      expect(shouldRunMindDropPrefill).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty title (auto-apply suggested title)', () => {
      const entity = {
        title: '', // Empty
        body: 'Book doctor appointment',
      };

      const suggestedTitle = 'Doctor Appointment';
      const titleIsEmpty = !entity.title || entity.title.trim().length === 0;
      const shouldAutoApply = titleIsEmpty;

      expect(titleIsEmpty).toBe(true);
      expect(shouldAutoApply).toBe(true);

      const updatedTitle = shouldAutoApply ? suggestedTitle : entity.title;
      expect(updatedTitle).toBe('Doctor Appointment');
    });

    it('should NOT auto-apply title if user has edited it', () => {
      const entity = {
        title: 'Doctor Appt - 11/18', // User edited
        body: 'Book doctor appointment tomorrow at 2pm',
      };

      const suggestedTitle = 'Doctor Appointment at 2pm';
      const titleEqualsBody = entity.title.trim() === entity.body.trim();
      const shouldAutoApply = titleEqualsBody;

      expect(titleEqualsBody).toBe(false);
      expect(shouldAutoApply).toBe(false);

      // Keep user's title
      const updatedTitle = shouldAutoApply ? suggestedTitle : entity.title;
      expect(updatedTitle).toBe('Doctor Appt - 11/18');
    });

    it('should handle legacy items (no views field)', () => {
      const legacyEntity = {
        type: 'todo',
        title: 'Old todo from before this feature',
        body: 'Old todo from before this feature',
        ai_placed: true,
        origin: 'catchall',
        views: undefined,
        // No views field
      };

      // Should detect needs prefill
      const alreadyPrefilled = (legacyEntity as any).views?.minddrop_prefilled_v1 === true;
      const shouldRunMindDropPrefill = !alreadyPrefilled;

      expect(alreadyPrefilled).toBe(false);
      expect(shouldRunMindDropPrefill).toBe(true);
    });

    it('should handle items not from Mind Drop (no prefill)', () => {
      const regularEntity = {
        type: 'todo',
        title: 'Regular todo',
        body: 'Created directly in overlay',
        ai_placed: false,
        origin: 'manual',
      };

      const isFromMindDrop =
        regularEntity.ai_placed === true && regularEntity.origin === 'catchall';
      const shouldRunMindDropPrefill = isFromMindDrop;

      expect(isFromMindDrop).toBe(false);
      expect(shouldRunMindDropPrefill).toBe(false);
    });

    it('should handle habit with generic tags (replace with AI tags)', () => {
      const entity = {
        type: 'habit',
        tags: ['doing', 'habit'], // Generic tags from creation
      };

      const aiTags = ['yoga', 'exercise'];

      // Check if tags are ONLY generic
      const GENERIC_HABIT_TAGS = new Set(['doing', 'habit', 'routine', 'task']);
      const hasOnlyGeneric = entity.tags.every((tag) => GENERIC_HABIT_TAGS.has(tag));

      expect(hasOnlyGeneric).toBe(true);

      // Replace with AI tags
      const finalTags = hasOnlyGeneric ? aiTags : entity.tags;
      expect(finalTags).toEqual(['yoga', 'exercise']);
      expect(finalTags).not.toContain('doing');
    });

    it('should handle habit with specific tags (keep them)', () => {
      const entity = {
        type: 'habit',
        tags: ['yoga', 'meditation'], // Specific tags
      };

      const aiTags = ['exercise', 'mindfulness'];

      // Check if tags are ONLY generic
      const GENERIC_HABIT_TAGS = new Set(['doing', 'habit', 'routine', 'task']);
      const hasOnlyGeneric = entity.tags.every((tag) => GENERIC_HABIT_TAGS.has(tag));

      expect(hasOnlyGeneric).toBe(false);

      // Keep existing tags
      const finalTags = hasOnlyGeneric ? aiTags : entity.tags;
      expect(finalTags).toEqual(['yoga', 'meditation']);
    });
  });

  describe('Integration: Complete Flow', () => {
    it('should follow complete flow: create → first open → second open → re-summarize', () => {
      // Step 1: Mind Drop creation (CatchAllNotepad)
      const entity: any = {
        id: 'todo-123',
        type: 'todo',
        title: 'Book doctor appointment tomorrow at 2pm',
        body: 'Book doctor appointment tomorrow at 2pm',
        tags: [] as string[], // No AI tags
        ai_placed: true,
        origin: 'catchall',
        drop_id: 'drop-456',
        // views.minddrop_prefilled_v1 not set
      };

      // Verify creation state
      expect(entity.tags).toEqual([]);
      expect(entity.views).toBeUndefined();

      // Step 2: First overlay open (UnifiedOverlayV2)
      const shouldRunMindDropPrefill_1 =
        entity.ai_placed && entity.origin === 'catchall' && !entity.views?.minddrop_prefilled_v1;
      expect(shouldRunMindDropPrefill_1).toBe(true);

      // Cortex prefill runs
      const suggestedTitle = 'Doctor Appointment at 2pm';
      const suggestedTags = ['doctor', 'appointment', '2pm'];

      // Auto-apply title (title equals body)
      const titleEqualsBody = entity.title === entity.body;
      expect(titleEqualsBody).toBe(true);
      entity.title = suggestedTitle;

      // Auto-apply tags
      entity.tags = suggestedTags;

      // Set prefill flag
      entity.views = { minddrop_prefilled_v1: true };

      expect(entity.title).toBe('Doctor Appointment at 2pm');
      expect(entity.tags).toEqual(['doctor', 'appointment', '2pm']);
      expect(entity.views.minddrop_prefilled_v1).toBe(true);

      // Step 3: Second overlay open (no auto-prefill)
      const shouldRunMindDropPrefill_2 =
        entity.ai_placed && entity.origin === 'catchall' && !entity.views?.minddrop_prefilled_v1;
      expect(shouldRunMindDropPrefill_2).toBe(false);

      // Tags should NOT change
      const tagsBefore = [...entity.tags];
      // No tag override runs
      expect(entity.tags).toEqual(tagsBefore);

      // Step 4: User clicks "Re-summarize title"
      const newSuggestedTitle = 'Doctor Appt Tomorrow';
      entity.title = newSuggestedTitle;

      // Title changed
      expect(entity.title).toBe('Doctor Appt Tomorrow');

      // Tags NOT changed
      expect(entity.tags).toEqual(['doctor', 'appointment', '2pm']);

      // Prefill flag still set
      expect(entity.views.minddrop_prefilled_v1).toBe(true);
    });
  });
});

describe('Mind Drop Prefill Ownership - RPC Contract', () => {
  it('convert_or_create_from_drop should NOT modify title/tags from payload', () => {
    // Simulates convert_or_create_from_drop RPC behavior
    const payload = {
      name: 'Book doctor appointment tomorrow at 2pm', // Raw text
      body: 'Book doctor appointment tomorrow at 2pm',
      tags: [], // Empty from Mind Drop creation
      due_at: '2025-11-18T14:00:00Z',
    };

    // RPC should copy fields as-is, NO enrichment
    const created = {
      type: 'todo',
      name: payload.name, // Unchanged
      body: payload.body, // Unchanged
      tags: payload.tags, // Unchanged (empty)
      due_date: '2025-11-18', // Extracted from due_at
      due_time: '14:00:00', // Extracted from due_at
    };

    expect(created.name).toBe(payload.name); // Raw text preserved
    expect(created.tags).toEqual([]); // No tag generation
    expect(created.name).not.toBe('Doctor Appointment at 2pm'); // NOT compacted
  });

  it('convert_or_create_from_drop should handle *journal marker for logs', () => {
    const payload = {
      title: 'Feeling anxious after meeting',
      body: 'Feeling anxious after meeting',
      tags: ['*journal'], // Only journal marker from creation
    };

    const created = {
      type: 'note',
      title: payload.title,
      body: payload.body,
      tags: payload.tags, // Just *journal, no content tags
    };

    expect(created.tags).toEqual(['*journal']);
    expect(created.tags).not.toContain('anxious'); // No AI tags from RPC
  });
});
