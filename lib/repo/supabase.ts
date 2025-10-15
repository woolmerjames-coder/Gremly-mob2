import { isToday, parseISO } from 'date-fns';
import type { AppRecord, Todo, ID, Space } from '../types';
import {
  habitZ,
  todoZ,
  noteZ,
  habitInsertSchema,
  todoInsertSchema,
  noteInsertSchema,
  spaceInsertSchema,
  type SpaceInsert,
} from '../schemas';
import type { IRepo, CreateRecordInput, UpdateRecordInput, GroupedByType } from './IRepo';
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
      // Build minimal payload with Insert schema validation
      payload = habitInsertSchema.parse(
        compact({
          space_id: input.space_id ?? null,
          title: input.title,
          frequency: input.frequency,
          ai_placed: input.ai_placed ?? false,
        }),
      );

      if (__DEV__) {
        console.log('[SupabaseRepo.create] Using habitInsertSchema');
        console.log('[SupabaseRepo.create] habit payload:', JSON.stringify(payload, null, 2));
      }
    } else if (input.type === 'todo') {
      // Build minimal payload with Insert schema validation
      payload = todoInsertSchema.parse(
        compact({
          space_id: input.space_id ?? null,
          title: input.title,
          body: input.body ?? null,
          due_date: input.due_date ?? null,
          undefined_due: input.undefined_due ?? true,
          ai_placed: input.ai_placed ?? false,
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
    if (input.type === 'habit') return habitZ.parse(record);
    if (input.type === 'todo') return todoZ.parse(record);
    return noteZ.parse(record);
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
    } else if (existing.type === 'habit') {
      if ('title' in patch && patch.title !== undefined) updatePayload.title = patch.title;
      if ('frequency' in patch && patch.frequency !== undefined)
        updatePayload.frequency = patch.frequency;
      if ('space_id' in patch) updatePayload.space_id = patch.space_id ?? null;
      if ('ai_placed' in patch) updatePayload.ai_placed = !!patch.ai_placed;
    } else if (existing.type === 'note') {
      if ('title' in patch) updatePayload.title = patch.title ?? null;
      if ('body' in patch) updatePayload.body = patch.body ?? null;
      if ('subtype' in patch && patch.subtype !== undefined) updatePayload.subtype = patch.subtype;
      if ('space_id' in patch) updatePayload.space_id = patch.space_id ?? null;
      if ('ai_placed' in patch) updatePayload.ai_placed = !!patch.ai_placed;
    }

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
    if (existing.type === 'habit') return habitZ.parse(record);
    if (existing.type === 'todo') return todoZ.parse(record);
    return noteZ.parse(record);
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
        if (type === 'habit') return habitZ.parse(record);
        if (type === 'todo') return todoZ.parse(record);
        return noteZ.parse(record);
      }

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "not found", other errors should throw
        throw new Error(`Error querying ${table}: ${error.message}`);
      }
    }

    return null;
  }

  async listByType(type: AppRecord['type']): Promise<AppRecord[]> {
    const userId = this.ensureUserId();
    const table = tableFor(type);

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to list ${type}s: ${error.message}`);
    if (!data) return [];

    return data.map((item) => {
      const record = { ...item, type };
      if (type === 'habit') return habitZ.parse(record);
      if (type === 'todo') return todoZ.parse(record);
      return noteZ.parse(record);
    });
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
          if (type === 'habit') return habitZ.parse(record);
          if (type === 'todo') return todoZ.parse(record);
          return noteZ.parse(record);
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
      .ilike('title', `%${q}%`);

    if (habitsError) throw new Error(`Failed to search habits: ${habitsError.message}`);
    if (habits) {
      results.push(...habits.map((h) => habitZ.parse({ ...h, type: 'habit' })));
    }

    // Search todos (title and body)
    const { data: todos, error: todosError } = await supabase
      .from('todos')
      .select('*')
      .eq('owner_id', userId)
      .or(`title.ilike.%${q}%,body.ilike.%${q}%`);

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
  // SPACE METHODS (Phase 5)
  // ==========================

  async listSpaces(): Promise<Space[]> {
    const userId = this.ensureUserId();

    const { data, error } = await supabase
      .from('spaces')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to list spaces: ${error.message}`);
    if (!data) return [];

    return data as Space[];
  }

  async createSpace(input: SpaceInsert): Promise<Space> {
    const userId = this.ensureUserId();

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
      habits: (habitsResult.data ?? []).map((h) => habitZ.parse({ ...h, type: 'habit' })),
      todos: (todosResult.data ?? []).map((t) => todoZ.parse({ ...t, type: 'todo' })),
      notes: (notesResult.data ?? []).map((n) => noteZ.parse({ ...n, type: 'note' })),
    };
  }

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
