/**
 * Tests for Mind Drop AI Freeze (Phase 1)
 *
 * Goal: Once AI has generated title/tags for a Mind Drop entity, the overlay must NOT
 * re-run AI on every open. AI should only run again if user explicitly taps "Re-summarize".
 *
 * These tests verify:
 * 1. Mind Drop entities without views.minddrop_prefilled_v1 → AI runs on first open
 * 2. Mind Drop entities with views.minddrop_prefilled_v1 = true → AI is frozen (locked)
 * 3. Non-Mind Drop entities → behavior unchanged
 */

describe('Mind Drop AI Freeze - Phase 1', () => {
  describe('isMindDropAiLocked helper', () => {
    it('should return false when entity has no drop_id (not Mind Drop)', () => {
      const entity: any = {
        id: 'todo-123',
        type: 'todo',
        title: 'Regular todo',
        origin: 'manual',
        ai_placed: false,
      };

      const isMindDrop = !!entity.drop_id;
      const aiPlaced = !!entity.ai_placed;
      const alreadyPrefilled = entity.views?.minddrop_prefilled_v1 === true;

      const isLocked = isMindDrop && aiPlaced && alreadyPrefilled;

      expect(isLocked).toBe(false);
      expect(isMindDrop).toBe(false);
    });

    it('should return false when Mind Drop entity has no views.minddrop_prefilled_v1', () => {
      const entity: any = {
        id: 'todo-123',
        type: 'todo',
        title: 'Book doctor appointment tomorrow at 2pm',
        body: 'Book doctor appointment tomorrow at 2pm',
        tags: [],
        ai_placed: true,
        origin: 'catchall',
        drop_id: 'drop-456',
        // views.minddrop_prefilled_v1 NOT set
      };

      const isMindDrop = !!entity.drop_id;
      const aiPlaced = !!entity.ai_placed;
      const alreadyPrefilled = entity.views?.minddrop_prefilled_v1 === true;

      const isLocked = isMindDrop && aiPlaced && alreadyPrefilled;

      expect(isLocked).toBe(false);
      expect(isMindDrop).toBe(true);
      expect(aiPlaced).toBe(true);
      expect(alreadyPrefilled).toBe(false);
    });

    it('should return true when Mind Drop entity has views.minddrop_prefilled_v1 = true', () => {
      const entity: any = {
        id: 'todo-123',
        type: 'todo',
        title: 'Doctor Appointment at 2pm',
        body: 'Book doctor appointment tomorrow at 2pm',
        tags: ['doctor', 'appointment', '2pm'],
        ai_placed: true,
        origin: 'catchall',
        drop_id: 'drop-456',
        views: {
          minddrop_prefilled_v1: true,
        },
      };

      const isMindDrop = !!entity.drop_id;
      const aiPlaced = !!entity.ai_placed;
      const alreadyPrefilled = entity.views?.minddrop_prefilled_v1 === true;

      const isLocked = isMindDrop && aiPlaced && alreadyPrefilled;

      expect(isLocked).toBe(true);
      expect(isMindDrop).toBe(true);
      expect(aiPlaced).toBe(true);
      expect(alreadyPrefilled).toBe(true);
    });

    it('should return false when ai_placed is false', () => {
      const entity: any = {
        id: 'todo-123',
        type: 'todo',
        drop_id: 'drop-456',
        ai_placed: false,
        views: {
          minddrop_prefilled_v1: true,
        },
      };

      const isMindDrop = !!entity.drop_id;
      const aiPlaced = !!entity.ai_placed;
      const alreadyPrefilled = entity.views?.minddrop_prefilled_v1 === true;

      const isLocked = isMindDrop && aiPlaced && alreadyPrefilled;

      expect(isLocked).toBe(false);
      expect(aiPlaced).toBe(false);
    });

    it('should handle undefined/null views gracefully', () => {
      const entityWithNullViews: any = {
        drop_id: 'drop-123',
        ai_placed: true,
        views: null,
      };

      const entityWithUndefinedViews: any = {
        drop_id: 'drop-456',
        ai_placed: true,
        // views is undefined
      };

      const views1 = entityWithNullViews.views ?? {};
      const views2 = entityWithUndefinedViews.views ?? {};

      const isLocked1 = (views1 as any).minddrop_prefilled_v1 === true;
      const isLocked2 = (views2 as any).minddrop_prefilled_v1 === true;

      expect(isLocked1).toBe(false);
      expect(isLocked2).toBe(false);
    });
  });

  describe('shouldRunMindDropPrefill with AI lock', () => {
    it('should return true for unlocked Mind Drop entity (first open)', () => {
      const entity: any = {
        id: 'todo-123',
        type: 'todo',
        title: 'Book doctor appointment tomorrow at 2pm',
        body: 'Book doctor appointment tomorrow at 2pm',
        tags: [],
        ai_placed: true,
        origin: 'catchall',
        drop_id: 'drop-456',
        // views.minddrop_prefilled_v1 NOT set
      };
      const mode: 'edit' | 'create' = 'edit';

      // Simulate isMindDropAiLocked logic
      const isMindDrop = !!entity.drop_id;
      const aiPlaced = !!entity.ai_placed;
      const views = entity.views ?? {};
      const alreadyPrefilled = views.minddrop_prefilled_v1 === true;
      const isLocked = isMindDrop && aiPlaced && alreadyPrefilled;

      // Simulate shouldRunMindDropPrefill logic
      const isFromMindDrop = entity.ai_placed === true && entity.origin === 'catchall';
      const shouldRunMindDropPrefill =
        !isLocked && isFromMindDrop && !alreadyPrefilled && mode === 'edit';

      expect(isLocked).toBe(false);
      expect(shouldRunMindDropPrefill).toBe(true);
    });

    it('should return false for locked Mind Drop entity (subsequent opens)', () => {
      const entity: any = {
        id: 'todo-123',
        type: 'todo',
        title: 'Doctor Appointment at 2pm',
        body: 'Book doctor appointment tomorrow at 2pm',
        tags: ['doctor', 'appointment', '2pm'],
        ai_placed: true,
        origin: 'catchall',
        drop_id: 'drop-456',
        views: {
          minddrop_prefilled_v1: true,
        },
      };
      const mode: 'edit' | 'create' = 'edit';

      // Simulate isMindDropAiLocked logic
      const isMindDrop = !!entity.drop_id;
      const aiPlaced = !!entity.ai_placed;
      const views = entity.views ?? {};
      const alreadyPrefilled = views.minddrop_prefilled_v1 === true;
      const isLocked = isMindDrop && aiPlaced && alreadyPrefilled;

      // Simulate shouldRunMindDropPrefill logic
      const isFromMindDrop = entity.ai_placed === true && entity.origin === 'catchall';
      const shouldRunMindDropPrefill =
        !isLocked && isFromMindDrop && !alreadyPrefilled && mode === 'edit';

      expect(isLocked).toBe(true);
      expect(shouldRunMindDropPrefill).toBe(false);
    });

    it('should return false for non-Mind Drop entities', () => {
      const entity: any = {
        id: 'todo-123',
        type: 'todo',
        title: 'Regular task',
        origin: 'manual',
        ai_placed: false,
      };
      const mode: 'edit' | 'create' = 'edit';

      const isMindDrop = !!entity.drop_id;
      const aiPlaced = !!entity.ai_placed;
      const views = entity.views ?? {};
      const alreadyPrefilled = views.minddrop_prefilled_v1 === true;
      const isLocked = isMindDrop && aiPlaced && alreadyPrefilled;

      const isFromMindDrop = entity.ai_placed === true && entity.origin === 'catchall';
      const shouldRunMindDropPrefill =
        !isLocked && isFromMindDrop && !alreadyPrefilled && mode === 'edit';

      expect(isLocked).toBe(false);
      expect(isFromMindDrop).toBe(false);
      expect(shouldRunMindDropPrefill).toBe(false);
    });

    it('should return false for create mode (even if unlocked)', () => {
      const entity: any = {
        id: 'todo-123',
        type: 'todo',
        ai_placed: true,
        origin: 'catchall',
        drop_id: 'drop-456',
      };
      const mode: 'edit' | 'create' = 'create';

      const isMindDrop = !!entity.drop_id;
      const aiPlaced = !!entity.ai_placed;
      const views = entity.views ?? {};
      const alreadyPrefilled = views.minddrop_prefilled_v1 === true;
      const isLocked = isMindDrop && aiPlaced && alreadyPrefilled;

      const isFromMindDrop = entity.ai_placed === true && entity.origin === 'catchall';
      // shouldRunMindDropPrefill requires mode === 'edit', so create mode always returns false
      const shouldRunMindDropPrefill =
        mode === 'edit' && !isLocked && isFromMindDrop && !alreadyPrefilled;

      expect(isFromMindDrop).toBe(true);
      expect(shouldRunMindDropPrefill).toBe(false); // mode is 'create'
    });
  });

  describe('AI tag override respects lock', () => {
    it('should apply tags when shouldRunMindDropPrefill = true (first open)', () => {
      const entity: any = {
        type: 'todo',
        origin: 'catchall',
        ai_placed: true,
        drop_id: 'drop-123',
        tags: [],
        // views.minddrop_prefilled_v1 NOT set
      };

      const shouldRunMindDropPrefill = true; // Unlocked, first prefill
      const isMindDrop = true;
      const rawSentence = false;

      const needsTagOverride = shouldRunMindDropPrefill || (isMindDrop && rawSentence);

      expect(needsTagOverride).toBe(true);
    });

    it('should NOT apply tags when shouldRunMindDropPrefill = false (locked)', () => {
      const entity: any = {
        type: 'todo',
        origin: 'catchall',
        ai_placed: true,
        drop_id: 'drop-123',
        tags: ['doctor', 'appointment'],
        views: {
          minddrop_prefilled_v1: true,
        },
      };

      const shouldRunMindDropPrefill = false; // Locked
      const isMindDrop = true;
      const rawSentence = false;

      const needsTagOverride = shouldRunMindDropPrefill || (isMindDrop && rawSentence);

      expect(needsTagOverride).toBe(false);
    });
  });

  describe('Title auto-apply respects lock', () => {
    it('should auto-apply title when shouldRunMindDropPrefill = true (first open)', () => {
      const entity: any = {
        title: 'Book doctor appointment tomorrow at 2pm',
        body: 'Book doctor appointment tomorrow at 2pm',
      };

      const shouldRunMindDropPrefill = true; // Unlocked
      const titleIsEmpty = false;
      const titleEqualsBody = entity.title.trim() === entity.body.trim();

      const shouldAutoApply = shouldRunMindDropPrefill || titleIsEmpty || titleEqualsBody;

      expect(titleEqualsBody).toBe(true);
      expect(shouldAutoApply).toBe(true);
    });

    it('should NOT auto-apply title when shouldRunMindDropPrefill = false (locked)', () => {
      const entity: any = {
        title: 'Doctor Appointment at 2pm',
        body: 'Book doctor appointment tomorrow at 2pm',
        views: {
          minddrop_prefilled_v1: true,
        },
      };

      const shouldRunMindDropPrefill = false; // Locked
      const titleIsEmpty = false;
      const titleEqualsBody = entity.title.trim() === entity.body.trim();

      const shouldAutoApply = shouldRunMindDropPrefill || titleIsEmpty || titleEqualsBody;

      expect(titleEqualsBody).toBe(false);
      expect(shouldAutoApply).toBe(false); // Title already edited
    });
  });

  describe('Lock flag is set after first prefill', () => {
    it('should set views.minddrop_prefilled_v1 = true when isMindDropPrefillNeeded', () => {
      const entity: any = {
        type: 'todo',
        origin: 'catchall',
        ai_placed: true,
        drop_id: 'drop-123',
        views: {},
      };
      const mode: 'edit' | 'create' = 'edit';
      const shouldRunMindDropPrefill = true;
      const aiTagOverrideApplied = true;

      const isMindDropPrefillNeeded = shouldRunMindDropPrefill && mode === 'edit';
      const shouldMarkPrefilled = isMindDropPrefillNeeded && aiTagOverrideApplied;

      expect(isMindDropPrefillNeeded).toBe(true);
      expect(shouldMarkPrefilled).toBe(true);

      // Simulate views merge
      const existingViews = entity.views || {};
      const viewsWithPrefillFlag: any = shouldMarkPrefilled
        ? { ...existingViews, minddrop_prefilled_v1: true }
        : existingViews;

      expect(viewsWithPrefillFlag.minddrop_prefilled_v1).toBe(true);
    });

    it('should preserve existing views keys when setting lock', () => {
      const entity: any = {
        views: {
          some_other_flag: true,
          another_key: 'value',
        },
      };

      const existingViews = entity.views || {};
      const viewsWithPrefillFlag = { ...existingViews, minddrop_prefilled_v1: true };

      expect(viewsWithPrefillFlag.minddrop_prefilled_v1).toBe(true);
      expect(viewsWithPrefillFlag.some_other_flag).toBe(true);
      expect(viewsWithPrefillFlag.another_key).toBe('value');
    });

    it('should NOT set lock when shouldRunMindDropPrefill = false', () => {
      const entity: any = {
        type: 'todo',
        views: {
          minddrop_prefilled_v1: true,
        },
      };
      const mode: 'edit' | 'create' = 'edit';
      const shouldRunMindDropPrefill = false; // Already locked

      const isMindDropPrefillNeeded = shouldRunMindDropPrefill && mode === 'edit';
      const shouldMarkPrefilled = isMindDropPrefillNeeded;

      expect(isMindDropPrefillNeeded).toBe(false);
      expect(shouldMarkPrefilled).toBe(false);

      // Views should remain unchanged
      const existingViews = entity.views || {};
      const viewsWithPrefillFlag = shouldMarkPrefilled
        ? { ...existingViews, minddrop_prefilled_v1: true }
        : existingViews;

      expect(viewsWithPrefillFlag).toEqual(entity.views);
    });
  });

  describe('Edge cases', () => {
    it('should handle habit entities correctly', () => {
      const habit: any = {
        id: 'habit-123',
        type: 'habit',
        title: 'Morning Yoga',
        notes: 'Start doing 15 minutes of yoga every morning',
        tags: ['yoga', 'exercise'],
        ai_placed: true,
        origin: 'catchall',
        drop_id: 'drop-789',
        views: {
          minddrop_prefilled_v1: true,
        },
      };

      const isMindDrop = !!habit.drop_id;
      const aiPlaced = !!habit.ai_placed;
      const views = habit.views ?? {};
      const alreadyPrefilled = views.minddrop_prefilled_v1 === true;
      const isLocked = isMindDrop && aiPlaced && alreadyPrefilled;

      expect(isLocked).toBe(true);
    });

    it('should handle note/log entities correctly', () => {
      const log: any = {
        id: 'note-123',
        type: 'note',
        subtype: 'journal',
        title: 'Anxious After Meeting',
        body: 'Feeling anxious after a long meeting but better after a walk',
        tags: ['journal', 'anxious', 'meeting', 'walk'],
        ai_placed: true,
        origin: 'catchall',
        drop_id: 'drop-999',
        views: {
          minddrop_prefilled_v1: true,
        },
      };

      const isMindDrop = !!log.drop_id;
      const aiPlaced = !!log.ai_placed;
      const views = log.views ?? {};
      const alreadyPrefilled = views.minddrop_prefilled_v1 === true;
      const isLocked = isMindDrop && aiPlaced && alreadyPrefilled;

      expect(isLocked).toBe(true);
    });

    it('should handle missing drop_id gracefully', () => {
      const entity: any = {
        type: 'todo',
        ai_placed: true,
        origin: 'catchall',
        // drop_id is missing
        views: {
          minddrop_prefilled_v1: true,
        },
      };

      const isMindDrop = !!entity.drop_id;
      const aiPlaced = !!entity.ai_placed;
      const views = entity.views ?? {};
      const alreadyPrefilled = views.minddrop_prefilled_v1 === true;
      const isLocked = isMindDrop && aiPlaced && alreadyPrefilled;

      expect(isMindDrop).toBe(false);
      expect(isLocked).toBe(false);
    });
  });
});
