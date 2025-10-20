import { isToday, parseISO } from 'date-fns';
import type { AppRecord, Todo, ID, Space, Tag, Person, EntityType } from '../types';
import {
  habitZ,
  todoZ,
  noteZ,
  habitInsertSchema,
  todoInsertSchema,
  noteInsertSchema,
  personInsertSchema,
  spaceInsertSchema,
  type SpaceInsert,
} from '../schemas';
import type {
  IRepo,
  CreateRecordInput,
  UpdateRecordInput,
  GroupedByType,
  ListByTypeOptions,
} from './IRepo';
import { supabase } from '../supabase/client';

/**
 * Supabase repository implementation.
 * Maps AppRecord types to Supabase tables and handles CRUD operations.
 *
 * Uses Insert schemas for create operations (excludes id, owner_id, timestamps)
 * Uses Row schemas for validating data returned from database
 */

// Helper to remove undefined values from objects
function compact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const k in obj) {
    if (obj[k] !== undefined) {
      copy[k] = obj[k];
    }
  }
  return copy as T;
}

// Map record type to Supabase table name
const tableFor = (type: AppRecord['type']): string => {
  switch (type) {
    case 'habit':
      return 'habits';
    case 'todo':
      return 'todos';
    case 'note':
      return 'notes';
  }
};

// Helper to map database habit columns to TypeScript fields
// Database has: frequency_json, reminders_json, triggers_json (jsonb columns)
// TypeScript has: frequency_value, reminders, triggers (fields)
function mapHabitFromDb(dbRecord: any): any {
  return {
    ...dbRecord,
    // Map jsonb columns to TS fields
    frequency_value: dbRecord.frequency_json,
    reminders: dbRecord.reminders_json,
    triggers: dbRecord.triggers_json,
  };
}

/**
 * Map database todo columns to TypeScript Todo type
 * - reminders_json (jsonb) -> reminders (ReminderRow[])
 */
function mapTodoFromDb(dbRecord: any): any {
  return {
    ...dbRecord,
    // Map jsonb column to TS field
    reminders: dbRecord.reminders_json,
  };
}

/**
 * Map database note columns to TypeScript Note type
 * - reminders_json (jsonb) -> reminders (ReminderRow[]) for journal entries
 */
function mapNoteFromDb(dbRecord: any): any {
  return {
    ...dbRecord,
    // Map jsonb column to TS field (used for journal entries)
    reminders: dbRecord.reminders_json,
  };
}

export class SupabaseRepo implements IRepo {
  private currentUserId: string | null = null;

  constructor(userId?: string) {
    this.currentUserId = userId || null;
  }

  setUserId(userId: string | null) {
    this.currentUserId = userId;
  }

  private ensureUserId(): string {
    if (!this.currentUserId) {
      throw new Error('User must be authenticated to perform this operation');
    }
    return this.currentUserId;
  }

  async create(input: CreateRecordInput): Promise<AppRecord> {
    this.ensureUserId();

    // Guard: Fail loudly if timestamps are accidentally present
    const inputRecord = input as unknown as Record<string, unknown>;
    if ('created_at' in inputRecord || 'updated_at' in inputRecord || 'id' in inputRecord) {
      throw new Error(
        'create() payload must not include id, created_at, or updated_at; rely on DB defaults',
      );
    }

    const table = tableFor(input.type);
    let payload: Record<string, unknown>;

    if (input.type === 'habit') {
      if (!input.frequency) throw new Error('Habit requires frequency');
      if (!input.subtype) throw new Error('Habit requires subtype');
      // Build minimal payload with Insert schema validation
      // Map TypeScript fields to database columns (frequency_json, reminders_json, etc.)
      payload = habitInsertSchema.parse(
        compact({
          space_id: input.space_id ?? null,
          name: input.name ?? input.title, // Support both name and title for transition
          frequency: input.frequency,
          subtype: input.subtype,
          ai_placed: input.ai_placed ?? false,
          why_string: input.why_string ?? null,
          origin: input.origin ?? undefined,
          canonicalType: input.canonicalType ?? undefined,
          labels: input.labels ?? undefined,
          views: input.views ?? undefined,
          // Extended habit fields - map to jsonb columns
          frequency_json: input.frequency_value ?? undefined,
          reminders_json: input.reminders ?? undefined,
          notes: input.notes ?? null,
          tags: input.tags ?? null,
          buddy_id: input.buddy_id ?? null,
          buddy_email: input.buddy_email ?? null,
          stack_with_id: input.stack_with_id ?? null,
          stack_position: input.stack_position ?? null,
          stack_offset_minutes: input.stack_offset_minutes ?? null,
          start_date: input.start_date ?? null,
          end_date: input.end_date ?? null,
          taper_plan: input.taper_plan ?? null,
          triggers_json: input.triggers ?? undefined,
          replacement_habit_id: input.replacement_habit_id ?? null,
          replacement_text: input.replacement_text ?? null,
        }),
      );

      if (__DEV__) {
        console.log('[SupabaseRepo.create] Using habitInsertSchema');
        console.log('[SupabaseRepo.create] habit payload:', JSON.stringify(payload, null, 2));
      }
    } else if (input.type === 'todo') {
      // Phase 7+: name is the primary required field
      if (!input.name) throw new Error('Todo requires name');

      // Build minimal payload with Insert schema validation
      payload = todoInsertSchema.parse(
        compact({
          space_id: input.space_id ?? null,
          name: input.name, // Primary field
          title: input.title ?? null, // Backwards compatibility
          body: input.body ?? null,
          due_date: input.due_date ?? null,
          due_time: input.due_time ?? null, // Phase 7+: HH:mm format
          undefined_due: input.undefined_due ?? undefined, // Optional (legacy)
          subtype: input.subtype ?? null, // AI-only: 'reminder' | 'microproject'
          reminders_json: input.reminders ?? null, // ReminderRow[] stored as jsonb
          notes: input.notes ?? null, // Additional notes
          tags: input.tags ?? null, // Categories array
          ai_placed: input.ai_placed ?? false,
          why_string: input.why_string ?? null,
          origin: input.origin ?? undefined,
          canonicalType: input.canonicalType ?? undefined,
          labels: input.labels ?? undefined,
          views: input.views ?? undefined,
        }),
      );

      if (__DEV__) {
        console.log('[SupabaseRepo.create] Using todoInsertSchema');
        console.log('[SupabaseRepo.create] todo payload:', JSON.stringify(payload, null, 2));
      }
    } else {
      // note
      if (!input.subtype) throw new Error('Note requires subtype');
      // Build minimal payload with Insert schema validation
      payload = noteInsertSchema.parse(
        compact({
          space_id: input.space_id ?? null,
          title: input.title ?? null,
          body: input.body ?? null,
          subtype: input.subtype,
          ai_placed: input.ai_placed ?? false,
          why_string: input.why_string ?? null,
          origin: input.origin ?? undefined,
          canonicalType: input.canonicalType ?? undefined,
          labels: input.labels ?? undefined,
          views: input.views ?? undefined,
          // Journal-specific fields (Phase 7+) - only used when subtype='journal'
          date: input.date ?? null,
          mood: input.mood ?? null,
          fmt: input.fmt ?? null,
          reminders_json: input.reminders ?? null, // ReminderRow[] stored as jsonb
          tags: input.tags ?? null,
          journal_subtype: input.journal_subtype ?? null, // AI-only
        }),
      );

      if (__DEV__) {
        console.log('[SupabaseRepo.create] Using noteInsertSchema');
        console.log('[SupabaseRepo.create] note payload:', JSON.stringify(payload, null, 2));
      }
    }

    // Verify payload doesn't have timestamps (safety check)
    if ('created_at' in payload || 'updated_at' in payload || 'owner_id' in payload) {
      throw new Error(
        'BUG: Insert payload contains auto-generated fields that should be DB defaults',
      );
    }

    // Database will auto-generate: id (uuid), owner_id (from RLS), created_at, updated_at
    const { data: result, error } = await supabase.from(table).insert(payload).select().single();

    if (error) {
      if (__DEV__) {
        console.error(`[SupabaseRepo.create] Error creating ${input.type}:`, error);
        console.error(
          `[SupabaseRepo.create] Payload that failed:`,
          JSON.stringify(payload, null, 2),
        );
      }
      throw new Error(`Failed to create ${input.type}: ${error.message}`);
    }
    if (!result) throw new Error(`No data returned from create ${input.type}`);

    if (__DEV__) {
      console.log(`[SupabaseRepo.create] Raw result from DB:`, JSON.stringify(result, null, 2));
    }

    // Parse with Row schema to validate returned data (includes all fields)
    const record = { ...result, type: input.type };
    if (input.type === 'habit') return habitZ.parse(mapHabitFromDb(record));
    if (input.type === 'todo') return todoZ.parse(mapTodoFromDb(record));
    return noteZ.parse(mapNoteFromDb(record));
  }

  async update({ id, patch }: UpdateRecordInput): Promise<AppRecord> {
    this.ensureUserId();

    // First get the record to determine its type
    const existing = await this.getById(id);
    if (!existing) throw new Error('Record not found');

    const table = tableFor(existing.type);

    // Build minimal patch object - never include created_at, owner_id, or id
    // Only include fields that are actually being changed
    const updatePayload: Record<string, unknown> = {};

    if (existing.type === 'todo') {
      if ('title' in patch && patch.title !== undefined) updatePayload.title = patch.title;
      if ('body' in patch) updatePayload.body = patch.body ?? null;
      if ('space_id' in patch) updatePayload.space_id = patch.space_id ?? null;
      if ('due_date' in patch) updatePayload.due_date = patch.due_date ?? null;
      if ('undefined_due' in patch) updatePayload.undefined_due = !!patch.undefined_due;
      if ('ai_placed' in patch) updatePayload.ai_placed = !!patch.ai_placed;
      if ('why_string' in patch) updatePayload.why_string = patch.why_string ?? null;
    } else if (existing.type === 'habit') {
      if ('title' in patch && patch.title !== undefined) updatePayload.title = patch.title;
      if ('frequency' in patch && patch.frequency !== undefined)
        updatePayload.frequency = patch.frequency;
      if ('subtype' in patch) updatePayload.subtype = patch.subtype ?? null;
      if ('space_id' in patch) updatePayload.space_id = patch.space_id ?? null;
      if ('ai_placed' in patch) updatePayload.ai_placed = !!patch.ai_placed;
      if ('why_string' in patch) updatePayload.why_string = patch.why_string ?? null;
    } else if (existing.type === 'note') {
      if ('title' in patch) updatePayload.title = patch.title ?? null;
      if ('body' in patch) updatePayload.body = patch.body ?? null;
      if ('subtype' in patch && patch.subtype !== undefined) updatePayload.subtype = patch.subtype;
      if ('space_id' in patch) updatePayload.space_id = patch.space_id ?? null;
      if ('ai_placed' in patch) updatePayload.ai_placed = !!patch.ai_placed;
      if ('why_string' in patch) updatePayload.why_string = patch.why_string ?? null;
    }

    if ('origin' in patch) updatePayload.origin = patch.origin ?? null;
    if ('canonicalType' in patch) updatePayload.canonicalType = patch.canonicalType ?? null;
    if ('labels' in patch) updatePayload.labels = patch.labels ?? null;
    if ('views' in patch) updatePayload.views = patch.views ?? null;

    // Database trigger or default will handle updated_at
    const { data: result, error } = await supabase
      .from(table)
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update record: ${error.message}`);
    if (!result) throw new Error('No data returned from update');

    const record = { ...result, type: existing.type };
    if (existing.type === 'habit') return habitZ.parse(mapHabitFromDb(record));
    if (existing.type === 'todo') return todoZ.parse(mapTodoFromDb(record));
    return noteZ.parse(mapNoteFromDb(record));
  }

  async remove(id: ID): Promise<void> {
    this.ensureUserId();

    // Get record to determine table
    const existing = await this.getById(id);
    if (!existing) return; // Already deleted

    const table = tableFor(existing.type);
    const { error } = await supabase.from(table).delete().eq('id', id);

    if (error) throw new Error(`Failed to delete record: ${error.message}`);
  }

  async getById(id: ID): Promise<AppRecord | null> {
    const userId = this.ensureUserId();

    // Try each table
    for (const type of ['habit', 'todo', 'note'] as const) {
      const table = tableFor(type);
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', id)
        .eq('owner_id', userId)
        .single();

      if (data) {
        const record = { ...data, type };
        if (type === 'habit') return habitZ.parse(mapHabitFromDb(record));
        if (type === 'todo') return todoZ.parse(mapTodoFromDb(record));
        return noteZ.parse(mapNoteFromDb(record));
      }

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "not found", other errors should throw
        throw new Error(`Error querying ${table}: ${error.message}`);
      }
    }

    return null;
  }

  async listByType(type: AppRecord['type'], opts?: ListByTypeOptions): Promise<AppRecord[]> {
    const userId = this.ensureUserId();
    const table = tableFor(type);

    let query = supabase.from(table).select('*').eq('owner_id', userId);

    // Apply space filter
    if (opts?.unassignedOnly) {
      query = query.is('space_id', null);
    } else if (opts?.spaceId !== undefined) {
      query = query.eq('space_id', opts.spaceId);
    }
    // If spaceId is omitted, no filter (Everywhere)

    // Apply subtype filter (only for notes)
    if (opts?.subtypes && opts.subtypes.length > 0 && type === 'note') {
      query = query.in('subtype', opts.subtypes);
    }

    // TODO: Apply tag filter when tagIds is provided
    // For now, tagIds is ignored (stub for future implementation)

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw new Error(`Failed to list ${type}s: ${error.message}`);
    if (!data) return [];

    return data.map((item) => {
      const record = { ...item, type };
      if (type === 'habit') return habitZ.parse(mapHabitFromDb(record));
      if (type === 'todo') return todoZ.parse(mapTodoFromDb(record));
      return noteZ.parse(mapNoteFromDb(record));
    });
  }

  async countUnsorted(): Promise<number> {
    const userId = this.ensureUserId();

    // Count across all three tables
    const [habitsResult, todosResult, notesResult] = await Promise.all([
      supabase
        .from('habits')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .eq('ai_placed', true),
      supabase
        .from('todos')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .eq('ai_placed', true),
      supabase
        .from('notes')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .eq('ai_placed', true),
    ]);

    if (habitsResult.error)
      throw new Error(`Failed to count habits: ${habitsResult.error.message}`);
    if (todosResult.error) throw new Error(`Failed to count todos: ${todosResult.error.message}`);
    if (notesResult.error) throw new Error(`Failed to count notes: ${notesResult.error.message}`);

    const total = (habitsResult.count ?? 0) + (todosResult.count ?? 0) + (notesResult.count ?? 0);
    return total;
  }

  async listBySpace(spaceId: ID): Promise<AppRecord[]> {
    const userId = this.ensureUserId();
    const results: AppRecord[] = [];

    // Query all three tables
    for (const type of ['habit', 'todo', 'note'] as const) {
      const table = tableFor(type);
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('owner_id', userId)
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(`Failed to list ${type}s in space: ${error.message}`);

      if (data) {
        const parsed = data.map((item) => {
          const record = { ...item, type };
          if (type === 'habit') return habitZ.parse(mapHabitFromDb(record));
          if (type === 'todo') return todoZ.parse(mapTodoFromDb(record));
          return noteZ.parse(mapNoteFromDb(record));
        });
        results.push(...parsed);
      }
    }

    return results;
  }

  async search(text: string): Promise<AppRecord[]> {
    const userId = this.ensureUserId();
    const q = text.toLowerCase();
    const results: AppRecord[] = [];

    // Search habits (title only)
    const { data: habits, error: habitsError } = await supabase
      .from('habits')
      .select('*')
      .eq('owner_id', userId)
      .ilike('name', `%${q}%`); // Changed from 'title' to 'name' per Phase 7 spec

    if (habitsError) throw new Error(`Failed to search habits: ${habitsError.message}`);
    if (habits) {
      results.push(...habits.map((h) => habitZ.parse(mapHabitFromDb({ ...h, type: 'habit' }))));
    }

    // Search todos (name and body)
    const { data: todos, error: todosError } = await supabase
      .from('todos')
      .select('*')
      .eq('owner_id', userId)
      .or(`name.ilike.%${q}%,body.ilike.%${q}%`);

    if (todosError) throw new Error(`Failed to search todos: ${todosError.message}`);
    if (todos) {
      results.push(...todos.map((t) => todoZ.parse({ ...t, type: 'todo' })));
    }

    // Search notes (title and body)
    const { data: notes, error: notesError } = await supabase
      .from('notes')
      .select('*')
      .eq('owner_id', userId)
      .or(`title.ilike.%${q}%,body.ilike.%${q}%`);

    if (notesError) throw new Error(`Failed to search notes: ${notesError.message}`);
    if (notes) {
      results.push(...notes.map((n) => noteZ.parse({ ...n, type: 'note' })));
    }

    return results;
  }

  async listDueToday(_nowIso: string): Promise<AppRecord[]> {
    const userId = this.ensureUserId();
    const results: AppRecord[] = [];

    // Get todos with due_date = today
    const { data: todos, error: todosError } = await supabase
      .from('todos')
      .select('*')
      .eq('owner_id', userId)
      .not('due_date', 'is', null);

    if (todosError) throw new Error(`Failed to list due todos: ${todosError.message}`);

    if (todos) {
      const todayTodos = todos.filter((t) => {
        try {
          return t.due_date && isToday(parseISO(t.due_date));
        } catch {
          return false;
        }
      });
      results.push(...todayTodos.map((t) => todoZ.parse({ ...t, type: 'todo' })));
    }

    // Note: Habits don't have due_date in this schema, but if they did we'd query them here too

    return results;
  }

  async listUndefinedDue(): Promise<Todo[]> {
    const userId = this.ensureUserId();

    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .eq('owner_id', userId)
      .eq('undefined_due', true);

    if (error) throw new Error(`Failed to list undefined due todos: ${error.message}`);
    if (!data) return [];

    return data.map((t) => todoZ.parse({ ...t, type: 'todo' }));
  }

  // ==========================
  // TODAY STATS (Phase 9)
  // ==========================

  async countPlannedToday(): Promise<number> {
    const userId = this.ensureUserId();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Count todos with due_date = today
    const { count: todoCount, error: todoError } = await supabase
      .from('todos')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', userId)
      .gte('due_date', `${today}T00:00:00`)
      .lt('due_date', `${today}T23:59:59`);

    if (todoError) throw new Error(`Failed to count planned todos: ${todoError.message}`);

    // For now, habits aren't date-based, so we return just todos
    // TODO: Extend when habits have scheduling
    return todoCount || 0;
  }

  async countCompletedToday(): Promise<number> {
    const userId = this.ensureUserId();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Count todos completed today (completed_at = today)
    const { count: todoCount, error: todoError } = await supabase
      .from('todos')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', userId)
      .not('completed_at', 'is', null)
      .gte('completed_at', `${today}T00:00:00`)
      .lt('completed_at', `${today}T23:59:59`);

    if (todoError) throw new Error(`Failed to count completed todos: ${todoError.message}`);

    // TODO: Add habit completions when we have a completion tracking table
    return todoCount || 0;
  }

  // ==========================
  // COMPLETION METHODS (Phase 9)
  // ==========================

  async completeHabit(id: ID, atIso: string): Promise<void> {
    const userId = this.ensureUserId();

    // For now, mark habit as completed by setting a completed_at field
    // TODO: Phase 10+ - Create a separate habit_completions table for history
    const { error } = await supabase
      .from('habits')
      .update({ completed_at: atIso })
      .eq('id', id)
      .eq('owner_id', userId);

    if (error) throw new Error(`Failed to complete habit: ${error.message}`);

    // Emit event for UI sync
    const { eventBus } = await import('../events');
    eventBus.emit('ItemCompleted', { id, type: 'habit' });
  }

  async completeTodo(id: ID, atIso: string): Promise<void> {
    const userId = this.ensureUserId();

    const { error } = await supabase
      .from('todos')
      .update({ completed_at: atIso })
      .eq('id', id)
      .eq('owner_id', userId);

    if (error) throw new Error(`Failed to complete todo: ${error.message}`);

    // Emit event for UI sync
    const { eventBus } = await import('../events');
    eventBus.emit('ItemCompleted', { id, type: 'todo' });
  }

  async undoCompletion(id: ID): Promise<void> {
    const userId = this.ensureUserId();

    // Try to clear completed_at from todos first
    const { error: todoError } = await supabase
      .from('todos')
      .update({ completed_at: null })
      .eq('id', id)
      .eq('owner_id', userId);

    if (!todoError) {
      // Success - was a todo
      const { eventBus } = await import('../events');
      eventBus.emit('ItemUpdated', { id });
      return;
    }

    // Try habits
    const { error: habitError } = await supabase
      .from('habits')
      .update({ completed_at: null })
      .eq('id', id)
      .eq('owner_id', userId);

    if (habitError) {
      throw new Error(`Failed to undo completion: ${habitError.message}`);
    }

    // Emit event for UI sync
    const { eventBus } = await import('../events');
    eventBus.emit('ItemUpdated', { id });
  }

  // ==========================
  // SPACE METHODS (Phase 5)
  // ==========================

  async listSpaces(): Promise<Space[]> {
    const { data, error } = await supabase
      .from('spaces')
      .select('*')
      .eq('owner_id', this.ensureUserId())
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to list spaces: ${error.message}`);
    if (!data) return [];

    return data as Space[];
  }

  async createSpace(input: SpaceInsert): Promise<Space> {
    this.ensureUserId();

    // Validate input
    const payload = spaceInsertSchema.parse(input);

    // Build insert payload
    const insertData = compact({
      name: payload.name,
      icon: payload.icon ?? null,
      theme: payload.theme ?? 'deepTeal',
    });

    const { data, error } = await supabase.from('spaces').insert(insertData).select().single();

    if (error) throw new Error(`Failed to create space: ${error.message}`);
    if (!data) throw new Error('No data returned from create space');

    return data as Space;
  }

  async getSpaceById(spaceId: string): Promise<Space | null> {
    const userId = this.ensureUserId();

    const { data, error } = await supabase
      .from('spaces')
      .select('*')
      .eq('id', spaceId)
      .eq('owner_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to get space: ${error.message}`);
    }

    return data as Space;
  }

  async updateSpace(spaceId: string, patch: Partial<SpaceInsert>): Promise<Space> {
    const userId = this.ensureUserId();

    const updatePayload: Record<string, unknown> = {};

    if ('name' in patch && patch.name !== undefined) updatePayload.name = patch.name;
    if ('icon' in patch) updatePayload.icon = patch.icon ?? null;
    if ('theme' in patch) updatePayload.theme = patch.theme ?? null;

    const { data, error } = await supabase
      .from('spaces')
      .update(updatePayload)
      .eq('id', spaceId)
      .eq('owner_id', userId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update space: ${error.message}`);
    if (!data) throw new Error('No data returned from update space');

    return data as Space;
  }

  async deleteSpace(spaceId: string): Promise<void> {
    const userId = this.ensureUserId();

    const { error } = await supabase
      .from('spaces')
      .delete()
      .eq('id', spaceId)
      .eq('owner_id', userId);

    if (error) throw new Error(`Failed to delete space: ${error.message}`);
  }

  async getSpaceSummary(spaceId: string): Promise<string | null> {
    const userId = this.ensureUserId();

    const { data, error } = await supabase
      .from('spaces')
      .select('summary_cached')
      .eq('id', spaceId)
      .eq('owner_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to get space summary: ${error.message}`);
    }

    return data?.summary_cached ?? null;
  }

  async listBySpaceGrouped(spaceId: string): Promise<GroupedByType> {
    const userId = this.ensureUserId();

    // Query all three tables in parallel
    const [habitsResult, todosResult, notesResult] = await Promise.all([
      supabase
        .from('habits')
        .select('*')
        .eq('owner_id', userId)
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false }),
      supabase
        .from('todos')
        .select('*')
        .eq('owner_id', userId)
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false }),
      supabase
        .from('notes')
        .select('*')
        .eq('owner_id', userId)
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false }),
    ]);

    if (habitsResult.error) throw new Error(`Failed to list habits: ${habitsResult.error.message}`);
    if (todosResult.error) throw new Error(`Failed to list todos: ${todosResult.error.message}`);
    if (notesResult.error) throw new Error(`Failed to list notes: ${notesResult.error.message}`);

    return {
      habits: (habitsResult.data ?? []).map((h) =>
        habitZ.parse(mapHabitFromDb({ ...h, type: 'habit' })),
      ),
      todos: (todosResult.data ?? []).map((t) => todoZ.parse({ ...t, type: 'todo' })),
      notes: (notesResult.data ?? []).map((n) => noteZ.parse({ ...n, type: 'note' })),
    };
  }

  // ==========================
  // TAG AND PEOPLE METHODS (Phase 7+)
  // ==========================

  async listTags(): Promise<Tag[]> {
    if (!this.currentUserId) throw new Error('User ID required');

    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .eq('user_id', this.currentUserId)
      .order('name', { ascending: true });

    if (error) throw new Error(`Failed to list tags: ${error.message}`);
    return (data || []) as Tag[];
  }

  async listPeople(): Promise<Person[]> {
    const { data, error } = await supabase
      .from('people')
      .select('*')
      .eq('owner_id', this.currentUserId);

    if (error) throw error;

    return (data || []).map(this.mapPersonFromDb);
  }

  async createPerson(input: {
    display_name: string;
    email?: string | null;
    dates?: Array<{ date: string; label: string }> | null;
    notes?: string | null;
    notes_fmt?: 'bullets' | 'numbers' | 'checkboxes' | null;
    reminders?: any[] | null;
    space_id?: string | null;
    tags?: string[] | null;
  }): Promise<Person> {
    const payload = personInsertSchema.parse({
      display_name: input.display_name,
      name: input.display_name, // Deprecated field
      email: input.email,
      dates_json: input.dates,
      notes: input.notes,
      notes_fmt: input.notes_fmt,
      reminders_json: input.reminders,
      space_id: input.space_id,
      tags: input.tags,
    });

    const { data, error } = await supabase.from('people').insert(payload).select().single();

    if (error) throw error;
    if (!data) throw new Error('Failed to create person');

    return this.mapPersonFromDb(data);
  }

  async updatePerson(
    personId: string,
    patch: Partial<{
      display_name: string;
      email: string | null;
      dates: Array<{ date: string; label: string }> | null;
      notes: string | null;
      notes_fmt: 'bullets' | 'numbers' | 'checkboxes' | null;
      reminders: any[] | null;
      space_id: string | null;
      tags: string[] | null;
    }>,
  ): Promise<Person> {
    const payload: any = {};

    if (patch.display_name !== undefined) {
      payload.display_name = patch.display_name;
      payload.name = patch.display_name; // Keep deprecated field in sync
    }
    if (patch.email !== undefined) payload.email = patch.email;
    if (patch.dates !== undefined) payload.dates_json = patch.dates;
    if (patch.notes !== undefined) payload.notes = patch.notes;
    if (patch.notes_fmt !== undefined) payload.notes_fmt = patch.notes_fmt;
    if (patch.reminders !== undefined) payload.reminders_json = patch.reminders;
    if (patch.space_id !== undefined) payload.space_id = patch.space_id;
    if (patch.tags !== undefined) payload.tags = patch.tags;

    const { data, error } = await supabase
      .from('people')
      .update(payload)
      .eq('id', personId)
      .eq('owner_id', this.currentUserId)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error('Person not found or update failed');

    return this.mapPersonFromDb(data);
  }

  async deletePerson(personId: string): Promise<void> {
    const { error } = await supabase
      .from('people')
      .delete()
      .eq('id', personId)
      .eq('owner_id', this.currentUserId);

    if (error) throw error;
  }

  /**
   * Helper to map Person from database format to app format
   * Maps dates_json → dates, reminders_json → reminders
   */
  private mapPersonFromDb(dbPerson: any): Person {
    return {
      id: dbPerson.id,
      owner_id: dbPerson.owner_id,
      display_name: dbPerson.display_name || dbPerson.name, // Fallback to deprecated name
      name: dbPerson.name,
      email: dbPerson.email,
      avatar: dbPerson.avatar,
      dates: dbPerson.dates_json || null,
      notes: dbPerson.notes,
      notes_fmt: dbPerson.notes_fmt,
      reminders: dbPerson.reminders_json || null,
      space_id: dbPerson.space_id,
      tags: dbPerson.tags,
      created_at: dbPerson.created_at,
      updated_at: dbPerson.updated_at,
    };
  }

  async listLinkedTags(_entity: { type: EntityType; id: ID }): Promise<Tag[]> {
    // Stub: Return empty array until tag_maps table is implemented
    // In future: JOIN tags with tag_maps where entity_type and entity_id match
    return [];
  }

  async listLinkedPeople(_entity: { type: EntityType; id: ID }): Promise<Person[]> {
    // Stub: Return empty array until entity_people table is implemented
    // In future: JOIN people with entity_people where entity_type and entity_id match
    return [];
  }

  // ==========================
  // PHASE 8: TAGS & PEOPLE LINKING
  // ==========================

  /**
   * Upsert a tag (create if doesn't exist, return existing if it does)
   */
  async upsertTag(name: string): Promise<import('./types').Tag> {
    if (!this.currentUserId) throw new Error('User ID required');

    // Try to insert
    const { data: insertData, error: insertError } = await supabase
      .from('tags')
      .insert({ user_id: this.currentUserId, name })
      .select()
      .single();

    // If no error, return the new tag
    if (!insertError && insertData) {
      return insertData;
    }

    // If unique constraint violation (code 23505), fetch existing tag
    if (insertError && insertError.code === '23505') {
      const { data: existingData, error: selectError } = await supabase
        .from('tags')
        .select('*')
        .eq('user_id', this.currentUserId)
        .eq('name', name)
        .single();

      if (selectError) throw new Error(`Failed to fetch existing tag: ${selectError.message}`);
      if (!existingData) throw new Error('Tag not found after unique constraint violation');
      return existingData;
    }

    // Other error
    throw new Error(`Failed to upsert tag: ${insertError?.message || 'Unknown error'}`);
  }

  /**
   * List all tags linked to a specific item
   */
  async listItemTags(itemId: string): Promise<import('./types').Tag[]> {
    if (!this.currentUserId) throw new Error('User ID required');

    const { data, error } = await supabase
      .from('tag_map')
      .select('tag_id, tags(*)')
      .eq('user_id', this.currentUserId)
      .eq('item_id', itemId);

    if (error) throw new Error(`Failed to list item tags: ${error.message}`);

    // Extract tags from joined data
    return (data || []).map((row: any) => row.tags).filter(Boolean);
  }

  /**
   * Link a tag to an item
   */
  async linkTag(params: {
    itemId: string;
    tagId: string;
    itemType: import('./types').ItemType;
  }): Promise<import('./types').TagMap> {
    if (!this.currentUserId) throw new Error('User ID required');

    const { data, error } = await supabase
      .from('tag_map')
      .insert({
        user_id: this.currentUserId,
        item_id: params.itemId,
        tag_id: params.tagId,
        item_type: params.itemType,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to link tag: ${error.message}`);
    if (!data) throw new Error('Failed to link tag: no data returned');
    return data;
  }

  /**
   * Unlink a tag from an item
   */
  async unlinkTag(params: { itemId: string; tagId: string }): Promise<void> {
    if (!this.currentUserId) throw new Error('User ID required');

    const { error } = await supabase
      .from('tag_map')
      .delete()
      .eq('user_id', this.currentUserId)
      .eq('item_id', params.itemId)
      .eq('tag_id', params.tagId);

    if (error) throw new Error(`Failed to unlink tag: ${error.message}`);
  }

  /**
   * List all people linked to a specific item
   */
  async listLinkedPeopleByItem(itemId: string): Promise<import('./types').EntityPerson[]> {
    if (!this.currentUserId) throw new Error('User ID required');

    const { data, error } = await supabase
      .from('entity_people')
      .select('*')
      .eq('user_id', this.currentUserId)
      .eq('item_id', itemId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to list linked people: ${error.message}`);
    return data || [];
  }

  /**
   * Link a person to an item
   */
  async linkPerson(params: {
    itemId: string;
    itemType: import('./types').ItemType;
    person_name?: string;
    person_email?: string;
  }): Promise<import('./types').EntityPerson> {
    if (!this.currentUserId) throw new Error('User ID required');

    const { data, error } = await supabase
      .from('entity_people')
      .insert({
        user_id: this.currentUserId,
        item_id: params.itemId,
        item_type: params.itemType,
        person_name: params.person_name || null,
        person_email: params.person_email || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to link person: ${error.message}`);
    if (!data) throw new Error('Failed to link person: no data returned');
    return data;
  }

  /**
   * Unlink a person from an item
   */
  async unlinkPerson(entityPersonId: string): Promise<void> {
    if (!this.currentUserId) throw new Error('User ID required');

    const { error } = await supabase
      .from('entity_people')
      .delete()
      .eq('user_id', this.currentUserId)
      .eq('id', entityPersonId);

    if (error) throw new Error(`Failed to unlink person: ${error.message}`);
  }

  // ==========================
  // BUDDY METHODS (Phase 5+ stubs)
  // ==========================

  // Buddy no-ops for Phase 4
  async inviteBuddy(): Promise<void> {
    /* no-op */
  }
  async acceptBuddy(): Promise<void> {
    /* no-op */
  }
  async nudgeBuddy(): Promise<void> {
    /* no-op */
  }
  async unlinkBuddy(): Promise<void> {
    /* no-op */
  }
}

/**
 * SupabaseSpaceChatRepo - Space chat management (Phase 8+ Spaces v2)
 */
export class SupabaseSpaceChatRepo {
  constructor(private currentUserId?: string) {}

  private ensureUserId(): string {
    if (!this.currentUserId) throw new Error('User ID not available');
    return this.currentUserId;
  }

  async list(
    spaceId: string,
    opts?: { includeArchived?: boolean },
  ): Promise<import('../types').SpaceChat[]> {
    const userId = this.ensureUserId();

    let query = supabase
      .from('space_chats')
      .select('*')
      .eq('user_id', userId)
      .eq('space_id', spaceId);

    if (!opts?.includeArchived) {
      query = query.is('archived_at', null);
    }

    query = query.order('pinned', { ascending: false }).order('updated_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw new Error(`Failed to list space chats: ${error.message}`);

    return (data || []) as import('../types').SpaceChat[];
  }

  async create(
    spaceId: string,
    input: import('../types').SpaceChatCreateInput,
  ): Promise<import('../types').SpaceChat> {
    const userId = this.ensureUserId();

    const { data, error } = await supabase
      .from('space_chats')
      .insert({
        user_id: userId,
        space_id: spaceId,
        title: input.title,
        pinned: false,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create space chat: ${error.message}`);
    if (!data) throw new Error('No data returned from create space chat');

    return data as import('../types').SpaceChat;
  }

  async update(
    chatId: string,
    patch: import('../types').SpaceChatUpdateInput,
  ): Promise<import('../types').SpaceChat> {
    const userId = this.ensureUserId();

    const updatePayload: Record<string, unknown> = {};

    if ('title' in patch && patch.title !== undefined) updatePayload.title = patch.title;
    if ('pinned' in patch) updatePayload.pinned = patch.pinned;
    if ('last_message_snippet' in patch)
      updatePayload.last_message_snippet = patch.last_message_snippet ?? null;
    if ('metadata_json' in patch) updatePayload.metadata_json = patch.metadata_json ?? null;

    const { data, error } = await supabase
      .from('space_chats')
      .update(updatePayload)
      .eq('id', chatId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update space chat: ${error.message}`);
    if (!data) throw new Error('No data returned from update space chat');

    return data as import('../types').SpaceChat;
  }

  async delete(chatId: string): Promise<void> {
    const userId = this.ensureUserId();

    const { error } = await supabase
      .from('space_chats')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', chatId)
      .eq('user_id', userId);

    if (error) throw new Error(`Failed to archive space chat: ${error.message}`);
  }
}
