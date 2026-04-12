/**
 * useOverlayDraft.test.ts
 *
 * Tests for the overlay draft Zustand store:
 * - open/discard lifecycle
 * - Field setters (setTitle, setBody, setTags, etc.)
 * - BaseType switching with text carry-over
 * - Atomic schedule updates
 * - UI state management
 */

import { useOverlayDraft } from '../../components/overlay/useOverlayDraft';

// Mock dependencies that overlayV2.state imports
jest.mock('../../lib/text/compactTitle', () => ({
  deriveCompactTitle: (text: string) => text?.slice(0, 40) ?? '',
}));

// Mock getDateService for commitment timestamp
jest.mock('../../lib/date', () => ({
  getDateService: () => ({
    now: () => new Date('2026-04-11T10:00:00Z'),
    today: () => '2026-04-11',
  }),
}));

describe('useOverlayDraft', () => {
  beforeEach(() => {
    // Reset the store between tests
    useOverlayDraft.getState().discard();
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('starts with draft=null and mode=closed', () => {
      const state = useOverlayDraft.getState();
      expect(state.draft).toBeNull();
      expect(state.mode).toBe('closed');
    });

    it('open() initialises draft and sets mode', () => {
      useOverlayDraft.getState().open({
        entity: null,
        mode: 'create',
        hydrate: () => ({ baseType: 'todo' as const }),
      });

      const state = useOverlayDraft.getState();
      expect(state.draft).not.toBeNull();
      expect(state.mode).toBe('create');
      expect(state.draft?.baseType).toBe('todo');
    });

    it('open() in view mode sets displayMode to view', () => {
      useOverlayDraft.getState().open({
        entity: { id: '1', type: 'todo' } as any,
        mode: 'view',
        hydrate: () => ({}),
      });

      expect(useOverlayDraft.getState().ui.displayMode).toBe('view');
    });

    it('open() stores originalEntity', () => {
      const entity = { id: 'abc', type: 'todo' } as any;
      useOverlayDraft.getState().open({
        entity,
        mode: 'edit',
        hydrate: () => ({}),
      });

      expect(useOverlayDraft.getState().draft?.originalEntity).toBe(entity);
      expect(useOverlayDraft.getState().draft?.originalEntityType).toBe('todo');
    });

    it('discard() clears draft and resets mode', () => {
      useOverlayDraft.getState().open({
        entity: null,
        mode: 'create',
        hydrate: () => ({ baseType: 'log' as const }),
      });

      useOverlayDraft.getState().discard();

      expect(useOverlayDraft.getState().draft).toBeNull();
      expect(useOverlayDraft.getState().mode).toBe('closed');
    });
  });

  // ── Field setters ─────────────────────────────────────────────────────

  describe('field setters', () => {
    beforeEach(() => {
      useOverlayDraft.getState().open({
        entity: null,
        mode: 'create',
        hydrate: () => ({ baseType: 'todo' as const }),
      });
    });

    it('setTitle updates compactTitle, userEditedTitle, and entity-specific title', () => {
      useOverlayDraft.getState().setTitle('Buy groceries');

      const draft = useOverlayDraft.getState().draft!;
      expect(draft.compactTitle).toBe('Buy groceries');
      expect(draft.userEditedTitle).toBe(true);
      expect(draft.todo.title).toBe('Buy groceries');
    });

    it('setBody for todo updates todo.details', () => {
      useOverlayDraft.getState().setBody('Get milk and eggs');
      expect(useOverlayDraft.getState().draft?.todo.details).toBe('Get milk and eggs');
    });

    it('setTags deduplicates and marks dirty', () => {
      useOverlayDraft.getState().setTags(['work', 'work', 'urgent']);
      const draft = useOverlayDraft.getState().draft!;
      expect(draft.tags).toEqual(['work', 'urgent']);
      expect(draft.tagsDirty).toBe(true);
    });

    it('addTag appends and marks dirty', () => {
      useOverlayDraft.getState().setTags(['work']);
      useOverlayDraft.getState().addTag('urgent');
      expect(useOverlayDraft.getState().draft?.tags).toEqual(['work', 'urgent']);
    });

    it('addTag does not duplicate', () => {
      useOverlayDraft.getState().setTags(['work']);
      useOverlayDraft.getState().addTag('work');
      expect(useOverlayDraft.getState().draft?.tags).toEqual(['work']);
    });

    it('removeTag filters out the tag', () => {
      useOverlayDraft.getState().setTags(['work', 'urgent']);
      useOverlayDraft.getState().removeTag('work');
      expect(useOverlayDraft.getState().draft?.tags).toEqual(['urgent']);
    });

    it('setMood updates mood', () => {
      useOverlayDraft.getState().setMood('positive');
      expect(useOverlayDraft.getState().draft?.mood).toBe('positive');
    });

    it('setSpaceId updates spaceId', () => {
      useOverlayDraft.getState().setSpaceId('space-123');
      expect(useOverlayDraft.getState().draft?.spaceId).toBe('space-123');
    });

    it('setFavorite toggles isFavorite', () => {
      useOverlayDraft.getState().setFavorite(true);
      expect(useOverlayDraft.getState().draft?.isFavorite).toBe(true);
    });

    it('setCommitment sets flag and auto-sets startedAt', () => {
      useOverlayDraft.getState().setCommitment(true);
      const draft = useOverlayDraft.getState().draft!;
      expect(draft.commitment).toBe(true);
      expect(draft.commitmentStartedAt).toBeTruthy();
    });

    it('setters are no-ops when draft is null', () => {
      useOverlayDraft.getState().discard();
      // Should not throw
      useOverlayDraft.getState().setTitle('test');
      useOverlayDraft.getState().setBody('test');
      useOverlayDraft.getState().setTags([]);
      expect(useOverlayDraft.getState().draft).toBeNull();
    });
  });

  // ── BaseType switching ────────────────────────────────────────────────

  describe('setBaseType', () => {
    it('carries text from todo.details to log.body when switching to log', () => {
      useOverlayDraft.getState().open({
        entity: null,
        mode: 'create',
        hydrate: () => ({ baseType: 'todo' as const }),
      });

      useOverlayDraft.getState().setBody('My task details');
      useOverlayDraft.getState().setBaseType('log');

      const draft = useOverlayDraft.getState().draft!;
      expect(draft.baseType).toBe('log');
      expect(draft.log.body).toBe('My task details');
    });

    it('carries text from log.body to habit.notes when switching to habit', () => {
      useOverlayDraft.getState().open({
        entity: null,
        mode: 'create',
        hydrate: () => ({ baseType: 'log' as const }),
      });

      useOverlayDraft.getState().setBody('Daily morning run');
      useOverlayDraft.getState().setBaseType('habit');

      expect(useOverlayDraft.getState().draft?.habit.notes).toBe('Daily morning run');
    });

    it('does not overwrite existing text in target type', () => {
      useOverlayDraft.getState().open({
        entity: null,
        mode: 'create',
        hydrate: () => ({ baseType: 'todo' as const }),
      });

      // Manually set log body before switching
      useOverlayDraft.getState().patchDraft({
        log: { ...useOverlayDraft.getState().draft!.log, body: 'existing log text' },
      });
      useOverlayDraft.getState().setBody('todo text');
      useOverlayDraft.getState().setBaseType('log');

      // Should keep existing log text, not overwrite with todo text
      expect(useOverlayDraft.getState().draft?.log.body).toBe('existing log text');
    });
  });

  // ── Todo-specific setters ─────────────────────────────────────────────

  describe('todo setters', () => {
    beforeEach(() => {
      useOverlayDraft.getState().open({
        entity: null,
        mode: 'create',
        hydrate: () => ({ baseType: 'todo' as const }),
      });
    });

    it('setTodoDue updates only provided fields', () => {
      useOverlayDraft.getState().setTodoDue({ due_day: '2026-04-15' });
      expect(useOverlayDraft.getState().draft?.todo.due_day).toBe('2026-04-15');
    });

    it('setTodoTimeEstimate updates minutes', () => {
      useOverlayDraft.getState().setTodoTimeEstimate(45);
      expect(useOverlayDraft.getState().draft?.todo.time_estimate_minutes).toBe(45);
    });
  });

  // ── Habit-specific setters ────────────────────────────────────────────

  describe('habit setters', () => {
    beforeEach(() => {
      useOverlayDraft.getState().open({
        entity: null,
        mode: 'create',
        hydrate: () => ({ baseType: 'habit' as const }),
      });
    });

    it('setHabitFrequency derives schedule from frequency_json', () => {
      useOverlayDraft.getState().setHabitFrequency({ type: 'simple', value: 'weekly' });
      const draft = useOverlayDraft.getState().draft!;
      expect(draft.habit.frequency_json).toEqual({ type: 'simple', value: 'weekly' });
      expect(draft.habit.schedule).toBe('weekly');
    });

    it('setHabitSubtype updates subtype', () => {
      useOverlayDraft.getState().setHabitSubtype('break_habit');
      expect(useOverlayDraft.getState().draft?.habit.subtype).toBe('break_habit');
    });
  });

  // ── Atomic schedule update ────────────────────────────────────────────

  describe('applySchedule', () => {
    it('applies todo schedule fields atomically', () => {
      useOverlayDraft.getState().open({
        entity: null,
        mode: 'create',
        hydrate: () => ({ baseType: 'todo' as const }),
      });

      useOverlayDraft.getState().applySchedule({
        scheduledDate: '2026-04-15',
        dueDay: '2026-04-20',
        timeEstimateMinutes: 60,
      });

      const draft = useOverlayDraft.getState().draft!;
      expect(draft.todo.scheduled_date).toBe('2026-04-15');
      expect(draft.todo.due_day).toBe('2026-04-20');
      expect(draft.todo.time_estimate_minutes).toBe(60);
    });

    it('applies habit schedule fields atomically', () => {
      useOverlayDraft.getState().open({
        entity: null,
        mode: 'create',
        hydrate: () => ({ baseType: 'habit' as const }),
      });

      useOverlayDraft.getState().applySchedule({
        frequencyJson: { type: 'simple', value: 'daily' },
        startDate: '2026-04-11',
        endDate: '2026-06-11',
      });

      const draft = useOverlayDraft.getState().draft!;
      expect(draft.habit.frequency_json).toEqual({ type: 'simple', value: 'daily' });
      expect(draft.habit.schedule).toBe('daily');
      expect(draft.habit.start_date).toBe('2026-04-11');
      expect(draft.habit.end_date).toBe('2026-06-11');
    });
  });

  // ── UI state ──────────────────────────────────────────────────────────

  describe('UI state', () => {
    it('setUI merges partial updates', () => {
      useOverlayDraft.getState().setUI({ saving: true, saveError: 'oops' });
      const ui = useOverlayDraft.getState().ui;
      expect(ui.saving).toBe(true);
      expect(ui.saveError).toBe('oops');
    });

    it('toggleUI flips boolean values', () => {
      useOverlayDraft.getState().setUI({ showDateModal: false });
      useOverlayDraft.getState().toggleUI('showDateModal');
      expect(useOverlayDraft.getState().ui.showDateModal).toBe(true);
    });

    it('resetUI restores initial values', () => {
      useOverlayDraft.getState().setUI({ saving: true, showDateModal: true });
      useOverlayDraft.getState().resetUI();
      const ui = useOverlayDraft.getState().ui;
      expect(ui.saving).toBe(false);
      expect(ui.showDateModal).toBe(false);
    });
  });

  // ── patchDraft ────────────────────────────────────────────────────────

  describe('patchDraft', () => {
    it('merges partial updates into draft', () => {
      useOverlayDraft.getState().open({
        entity: null,
        mode: 'create',
        hydrate: () => ({ baseType: 'log' as const }),
      });

      useOverlayDraft.getState().patchDraft({
        isFavorite: true,
        photoUri: 'file://photo.jpg',
      });

      const draft = useOverlayDraft.getState().draft!;
      expect(draft.isFavorite).toBe(true);
      expect(draft.photoUri).toBe('file://photo.jpg');
    });

    it('is no-op when draft is null', () => {
      useOverlayDraft.getState().patchDraft({ isFavorite: true });
      expect(useOverlayDraft.getState().draft).toBeNull();
    });
  });
});
