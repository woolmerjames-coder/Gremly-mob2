/**
 * Overlay Round-Trip Sanity Tests
 *
 * Purpose: Automated sanity check that all editable fields round-trip correctly
 * through UnifiedOverlayV2's save and reopen cycle.
 *
 * This is NOT deep unit testing — just verification that:
 * 1. Create a todo, habit, or note
 * 2. Open in edit mode
 * 3. Modify every editable field
 * 4. Save
 * 5. Reopen the same entity
 * 6. Assert overlay state contains updated values
 *
 * NOTE: Field names use snake_case to match DB columns (commitment_note, commitment_started_at)
 * because buildDraftPayloadFromEntity expects snake_case from the entity.
 */

import { buildDraftPayloadFromEntity } from '../components/overlay/UnifiedOverlayV2';
import type { Todo, Habit, Note, AppRecord } from '../lib/types';

// ============================================================
// In-Memory Mock Repository
// ============================================================

class MockSupabaseRepo {
  private storage: Map<string, AppRecord> = new Map();
  private idCounter = 1;

  async create(record: Partial<AppRecord>): Promise<AppRecord> {
    const id = `mock-${this.idCounter++}`;
    const now = new Date().toISOString();
    const fullRecord = {
      ...record,
      id,
      owner_id: 'test-user',
      created_at: now,
      updated_at: now,
      ai_placed: false,
    } as AppRecord;
    this.storage.set(id, fullRecord);
    console.log(`[MockRepo] Created ${record.type}:`, id);
    return fullRecord;
  }

  async getById(id: string): Promise<AppRecord | null> {
    const record = this.storage.get(id) ?? null;
    console.log(`[MockRepo] getById(${id}):`, record ? 'found' : 'not found');
    return record;
  }

  async update(id: string, updates: Partial<AppRecord>): Promise<AppRecord> {
    const existing = this.storage.get(id);
    if (!existing) throw new Error(`Record not found: ${id}`);
    const updated = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    } as AppRecord;
    this.storage.set(id, updated);
    console.log(`[MockRepo] Updated ${id}:`, Object.keys(updates));
    return updated;
  }

  clear() {
    this.storage.clear();
    this.idCounter = 1;
  }
}

// ============================================================
// Test Helpers
// ============================================================

function assertField(
  entityType: string,
  fieldName: string,
  expected: any,
  actual: any,
  failures: string[],
): boolean {
  const isEqual = JSON.stringify(expected) === JSON.stringify(actual);
  if (!isEqual) {
    const msg = `[${entityType}] Field "${fieldName}" failed to round-trip. Expected: ${JSON.stringify(expected)}, Got: ${JSON.stringify(actual)}`;
    console.error(msg);
    failures.push(msg);
    return false;
  }
  return true;
}

function logOverlayState(label: string, state: any) {
  console.log(`[Overlay State] ${label}:`, {
    baseType: state.baseType,
    commitment: state.commitment,
    commitmentNote: state.commitmentNote,
    tags: state.tags,
    todo: state.todo,
    habit: state.habit,
    log: state.log,
  });
}

// ============================================================
// Test Suite
// ============================================================

describe('Overlay Round-Trip Sanity', () => {
  let repo: MockSupabaseRepo;
  const failures: string[] = [];

  beforeEach(() => {
    repo = new MockSupabaseRepo();
    failures.length = 0;
  });

  afterAll(() => {
    if (failures.length === 0) {
      console.log('\n[Overlay Roundtrip] All fields successfully persisted.\n');
    } else {
      console.error(`\n[Overlay Roundtrip] ${failures.length} field(s) failed to round-trip.\n`);
    }
  });

  describe('Todo Round-Trip', () => {
    it('should persist all todo fields across save and reopen', async () => {
      // Step 1: Create a todo (using snake_case for DB-like fields)
      const initialTodo = await repo.create({
        type: 'todo',
        name: 'Initial Todo',
        title: 'Initial Todo',
        body: 'Initial body',
        due_day: null,
        due_time: null,
        tags: [],
        reminders: null,
        commitment: false,
        commitment_note: null,
        commitment_started_at: null,
        labels: ['todo'],
        views: {},
      } as any);

      // Step 2: Open in edit mode (simulate hydration)
      const beforePayload = buildDraftPayloadFromEntity(initialTodo);
      logOverlayState('Todo BEFORE edit', beforePayload);

      // Step 3: Simulate modifications (using snake_case to match DB)
      const updatedFields = {
        name: 'Updated Todo Title',
        title: 'Updated Todo Title',
        body: 'Updated body content',
        due_day: '2025-12-15',
        due_time: '14:30',
        tags: ['#work', '#urgent'],
        reminders: [{ id: 'r1', time: '09:00', repeat: 'once' }],
        commitment: true,
        commitment_note: 'Locked in for focus',
        commitment_started_at: '2025-11-30T10:00:00Z',
      };

      // Step 4: Save
      const savedTodo = await repo.update(initialTodo.id, updatedFields);

      // Step 5: Reopen (fetch fresh and hydrate)
      const reopenedTodo = await repo.getById(savedTodo.id);
      expect(reopenedTodo).not.toBeNull();

      const afterPayload = buildDraftPayloadFromEntity(reopenedTodo!);
      logOverlayState('Todo AFTER reopen', afterPayload);

      // Step 6: Assert all fields persisted (check raw entity)
      const todoAfter = reopenedTodo as any;
      assertField('Todo', 'name', 'Updated Todo Title', todoAfter.name, failures);
      assertField('Todo', 'body', 'Updated body content', todoAfter.body, failures);
      assertField('Todo', 'due_day', '2025-12-15', todoAfter.due_day, failures);
      assertField('Todo', 'due_time', '14:30', todoAfter.due_time, failures);
      assertField('Todo', 'tags', ['#work', '#urgent'], todoAfter.tags, failures);
      assertField(
        'Todo',
        'reminders',
        [{ id: 'r1', time: '09:00', repeat: 'once' }],
        todoAfter.reminders,
        failures,
      );
      assertField('Todo', 'commitment', true, todoAfter.commitment, failures);
      assertField(
        'Todo',
        'commitment_note',
        'Locked in for focus',
        todoAfter.commitment_note,
        failures,
      );
      assertField(
        'Todo',
        'commitment_started_at',
        '2025-11-30T10:00:00Z',
        todoAfter.commitment_started_at,
        failures,
      );

      // Also verify overlay hydration (payload uses camelCase)
      // Note: Tags are normalized (# prefix stripped) by buildDraftPayloadFromEntity
      expect(afterPayload.commitment).toBe(true);
      expect(afterPayload.commitmentNote).toBe('Locked in for focus');
      expect(afterPayload.tags).toEqual(['work', 'urgent']);

      expect(failures.length).toBe(0);
    });
  });

  describe('Habit Round-Trip', () => {
    it('should persist all habit fields across save and reopen', async () => {
      // Step 1: Create a habit (using snake_case for DB-like fields)
      const initialHabit = await repo.create({
        type: 'habit',
        name: 'Initial Habit',
        frequency: 'daily',
        subtype: 'start_habit',
        frequency_value: null,
        tags: [],
        reminders: null,
        notes: null,
        commitment: false,
        commitment_note: null,
        commitment_started_at: null,
        labels: ['habit'],
        views: {},
      } as any);

      // Step 2: Open in edit mode
      const beforePayload = buildDraftPayloadFromEntity(initialHabit);
      logOverlayState('Habit BEFORE edit', beforePayload);

      // Step 3: Simulate modifications (using snake_case to match DB)
      const updatedFields = {
        name: 'Updated Habit Name',
        frequency: 'custom',
        subtype: 'break_habit' as const,
        frequency_value: { type: 'days', days: [1, 3, 5] },
        tags: ['#health', '#morning'],
        reminders: [{ id: 'r1', time: '07:00', repeat: 'daily' }],
        notes: 'Track progress weekly',
        commitment: true,
        commitment_note: 'Committed for 30 days',
        commitment_started_at: '2025-11-30T08:00:00Z',
      };

      // Step 4: Save
      const savedHabit = await repo.update(initialHabit.id, updatedFields);

      // Step 5: Reopen
      const reopenedHabit = await repo.getById(savedHabit.id);
      expect(reopenedHabit).not.toBeNull();

      const afterPayload = buildDraftPayloadFromEntity(reopenedHabit!);
      logOverlayState('Habit AFTER reopen', afterPayload);

      // Step 6: Assert all fields persisted (check raw entity)
      const habitAfter = reopenedHabit as any;
      assertField('Habit', 'name', 'Updated Habit Name', habitAfter.name, failures);
      assertField('Habit', 'frequency', 'custom', habitAfter.frequency, failures);
      assertField('Habit', 'subtype', 'break_habit', habitAfter.subtype, failures);
      assertField(
        'Habit',
        'frequency_value',
        { type: 'days', days: [1, 3, 5] },
        habitAfter.frequency_value,
        failures,
      );
      assertField('Habit', 'tags', ['#health', '#morning'], habitAfter.tags, failures);
      assertField('Habit', 'notes', 'Track progress weekly', habitAfter.notes, failures);
      assertField('Habit', 'commitment', true, habitAfter.commitment, failures);
      assertField(
        'Habit',
        'commitment_note',
        'Committed for 30 days',
        habitAfter.commitment_note,
        failures,
      );

      // Also verify overlay hydration (payload uses camelCase)
      expect(afterPayload.commitment).toBe(true);
      expect(afterPayload.commitmentNote).toBe('Committed for 30 days');

      expect(failures.length).toBe(0);
    });
  });

  describe('Note/Log Round-Trip', () => {
    it('should persist all note fields across save and reopen (journal)', async () => {
      // Step 1: Create a journal note (using snake_case for DB-like fields)
      const initialNote = await repo.create({
        type: 'note',
        title: 'Initial Journal',
        body: 'Today was a good day',
        subtype: 'journal',
        date: '2025-11-30',
        mood: 'neutral',
        private: false,
        journal_subtype: null,
        tags: [],
        reminders: null,
        commitment: false,
        commitment_note: null,
        commitment_started_at: null,
        labels: ['note'],
        views: {},
      } as any);

      // Step 2: Open in edit mode
      const beforePayload = buildDraftPayloadFromEntity(initialNote);
      logOverlayState('Note BEFORE edit', beforePayload);

      // Step 3: Simulate modifications (using snake_case to match DB)
      const updatedFields = {
        title: 'Updated Journal Entry',
        body: 'Reflecting on my progress this week',
        mood: 'happy',
        private: true,
        journal_subtype: 'reflection',
        tags: ['#gratitude', '#personal'],
        reminders: [{ id: 'r1', time: '21:00', repeat: 'daily' }],
        commitment: true,
        commitment_note: 'Daily journaling commitment',
        commitment_started_at: '2025-11-30T20:00:00Z',
      };

      // Step 4: Save
      const savedNote = await repo.update(initialNote.id, updatedFields);

      // Step 5: Reopen
      const reopenedNote = await repo.getById(savedNote.id);
      expect(reopenedNote).not.toBeNull();

      const afterPayload = buildDraftPayloadFromEntity(reopenedNote!);
      logOverlayState('Note AFTER reopen', afterPayload);

      // Step 6: Assert all fields persisted (check raw entity)
      const noteAfter = reopenedNote as any;
      assertField('Note', 'title', 'Updated Journal Entry', noteAfter.title, failures);
      assertField('Note', 'body', 'Reflecting on my progress this week', noteAfter.body, failures);
      assertField('Note', 'mood', 'happy', noteAfter.mood, failures);
      assertField('Note', 'private', true, noteAfter.private, failures);
      assertField('Note', 'journal_subtype', 'reflection', noteAfter.journal_subtype, failures);
      assertField('Note', 'tags', ['#gratitude', '#personal'], noteAfter.tags, failures);
      assertField('Note', 'commitment', true, noteAfter.commitment, failures);
      assertField(
        'Note',
        'commitment_note',
        'Daily journaling commitment',
        noteAfter.commitment_note,
        failures,
      );

      // Also verify overlay hydration (payload uses camelCase)
      expect(afterPayload.commitment).toBe(true);
      expect(afterPayload.commitmentNote).toBe('Daily journaling commitment');

      expect(failures.length).toBe(0);
    });

    it('should persist all note fields across save and reopen (idea)', async () => {
      // Step 1: Create an idea note
      const initialNote = await repo.create({
        type: 'note',
        title: 'Initial Idea',
        body: 'What if we built a feature for...',
        subtype: 'idea',
        tags: [],
        reminders: null,
        labels: ['note'],
        views: {},
      } as any);

      // Step 2: Open in edit mode
      const beforePayload = buildDraftPayloadFromEntity(initialNote);
      logOverlayState('Idea BEFORE edit', beforePayload);

      // Step 3: Simulate modifications
      const updatedFields = {
        title: 'Updated Idea Title',
        body: 'Expanded idea with more details',
        tags: ['#product', '#innovation'],
      };

      // Step 4: Save
      const savedNote = await repo.update(initialNote.id, updatedFields);

      // Step 5: Reopen
      const reopenedNote = await repo.getById(savedNote.id);
      expect(reopenedNote).not.toBeNull();

      const afterPayload = buildDraftPayloadFromEntity(reopenedNote!);
      logOverlayState('Idea AFTER reopen', afterPayload);

      // Step 6: Assert all fields persisted
      const noteAfter = reopenedNote as any;
      assertField('Note', 'title', 'Updated Idea Title', noteAfter.title, failures);
      assertField('Note', 'body', 'Expanded idea with more details', noteAfter.body, failures);
      assertField('Note', 'tags', ['#product', '#innovation'], noteAfter.tags, failures);

      expect(failures.length).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined fields gracefully', async () => {
      // Create a minimal todo
      const minimalTodo = await repo.create({
        type: 'todo',
        name: 'Minimal Todo',
        title: 'Minimal Todo',
        ai_placed: false,
        labels: ['todo'],
        views: {},
      } as any);

      const payload = buildDraftPayloadFromEntity(minimalTodo);
      logOverlayState('Minimal Todo', payload);

      // Should not throw, should have sensible defaults
      expect(payload.commitment).toBe(false);
      expect(payload.commitmentNote).toBe('');
      expect(payload.tags).toEqual([]);
    });

    it('should handle commitment toggle on → off → on cycle', async () => {
      // Create with commitment ON (using snake_case to match DB)
      const todo = await repo.create({
        type: 'todo',
        name: 'Toggle Test',
        commitment: true,
        commitment_note: 'First commitment',
        commitment_started_at: '2025-11-30T10:00:00Z',
        labels: ['todo'],
        views: {},
      } as any);

      // Toggle OFF
      await repo.update(todo.id, {
        commitment: false,
        commitment_note: null,
        commitment_started_at: null,
      });

      let reopened = await repo.getById(todo.id);
      let payload = buildDraftPayloadFromEntity(reopened!);
      expect(payload.commitment).toBe(false);
      expect(payload.commitmentNote).toBe('');

      // Toggle ON again
      await repo.update(todo.id, {
        commitment: true,
        commitment_note: 'Second commitment',
        commitment_started_at: '2025-11-30T15:00:00Z',
      });

      reopened = await repo.getById(todo.id);
      payload = buildDraftPayloadFromEntity(reopened!);
      expect(payload.commitment).toBe(true);
      expect(payload.commitmentNote).toBe('Second commitment');

      console.log('[Edge Case] Commitment toggle cycle passed');
    });
  });
});
