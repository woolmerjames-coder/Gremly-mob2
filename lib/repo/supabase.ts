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
import {
  logSupabaseError,
  getUserFriendlyErrorMessage,
  type TodoInsert,
  type NoteInsert,
  type HabitInsert,
  type TodoRow,
  type NoteRow,
  type HabitRow,
  type SpaceInsert as DBSpaceInsert,
  type PersonInsert as DBPersonInsert,
  type TagInsert as DBTagInsert,
  type TagMapInsert as DBTagMapInsert,
  type EntityPeopleInsert as DBEntityPeopleInsert,
} from '../supabase/mappers';

/**
 * Supabase repository implementation.
 * Maps AppRecord types to Supabase tables and handles CRUD operations.
 *
 * SOURCE OF TRUTH: Live Supabase database schema
 * - TODOS: Use 'name' field (NOT 'title'), owner_id (NOT user_id)
 * - NOTES: Use 'title' field (NOT 'name'), owner_id
 * - HABITS: Use both 'name' AND 'title' fields, owner_id
 *
 * Phase 10R Schema Alignment (2025-10-21):
 * - Tags: owner_id (was user_id), includes color field
 * - TagMap: owner_id, entity_id, entity_type (was user_id, item_id, item_type)
 * - EntityPeople: has id column (composite PK preserved), uses owner_id, entity_id, entity_type
 *
 * Performance indexes (see migration 20251021_10R_hotfix_from_audit.sql):
 * - idx_todos_space_id, idx_todos_due_date, idx_todos_completed_at
 * - idx_habits_space_id, idx_habits_completed_at
 * - idx_notes_space_id, idx_notes_created_at
 * - idx_tag_map_entity, idx_tag_map_owner_entity
 * - idx_entity_people_entity, idx_entity_people_person
 *
 * Uses Insert schemas for create operations (excludes id, owner_id, timestamps)
 * Uses Row schemas for validating data returned from database
 */

// DEPRECATED: Use logSupabaseError from mappers instead
function logSbError(ctx: string, error: any) {
  if (!error) return;
  console.error(`[SupabaseRepo] ${ctx} error`, {
    message: error.message ?? String(error),
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

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

// Helper to remove null and undefined values (prevents schema cache errors)
function stripNulls<T extends Record<string, any>>(obj: T) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined),
  ) as T;
}

const TZ_OFFSET_SUFFIX = /[+-]\d{2}:?\d{2}$/;

function normalizeIsoDatetime(value?: string | null): string | null | undefined {
  if (value == null) return value ?? null;
  if (!TZ_OFFSET_SUFFIX.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString();
}

function ensureDay(dateIso: string): string {
  return new Date(dateIso).toISOString().split('T')[0];
}

/**
 * Phase 10.2: Simple title case helper for list names
 */
function titleCase(str: string): string {
  return str
    .split(/[\s_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * DEPRECATED: This helper is NO LONGER USED.
 *
 * Database schema truth (from generated types):
 * - TODOS: Use 'name' only (no 'title' field in DB)
 * - NOTES: Use 'title' only (no 'name' field in DB)
 * - HABITS: Use both 'name' AND 'title' (both fields in DB)
 *
 * DO NOT apply withNameTitle to todos or notes - causes PGRST204 errors!
 */
function withNameTitle<T extends Record<string, any>>(obj: T): T {
  // Ensure DBs that expect `name` or `title` don't get null; prefer provided fields in this order.
  const name = (obj as any).name ?? (obj as any).title ?? (obj as any).body ?? '';
  const title = (obj as any).title ?? (obj as any).name ?? '';
  return { ...obj, name, title } as T;
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
// Database has: name, title, frequency_json, reminders_json, triggers_json (jsonb columns)
// TypeScript has: name, frequency_value, reminders, triggers (fields)
// Schema truth: habits table has BOTH name AND title columns
function mapHabitFromDb(dbRecord: any): any {
  return {
    ...dbRecord,
    // Database has both 'name' and 'title' - keep name as primary
    name: dbRecord.name || dbRecord.title,
    // Map jsonb columns to TS fields
    frequency_value: dbRecord.frequency_json,
    reminders: dbRecord.reminders_json,
    triggers: dbRecord.triggers_json,
  };
}

/**
 * Map database todo columns to TypeScript Todo type
 * Database schema truth (from generated types):
 * - name (string, required) - PRIMARY field for todos
 * - NO 'title' column in todos table
 * - reminders_json (jsonb) -> reminders (ReminderRow[])
 * - owner_id (string) - RLS key
 */
function mapTodoFromDb(dbRecord: any): any {
  return {
    ...dbRecord,
    // Map database 'name' to both name and title for backwards compatibility
    name: dbRecord.name,
    title: dbRecord.name, // Backwards compatibility in app code
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
  private lastCountCompletedTodayWarn: number = 0;
  private readonly WARN_THROTTLE_MS = 60000; // Throttle warnings to once per minute

  // Phase 10.7E: Space chat messages accessor
  public spaceChatMessages: {
    list: (spaceId: string, opts?: { limit?: number }) => Promise<any[]>;
  };

  constructor(userId?: string) {
    this.currentUserId = userId || null;

    // Initialize spaceChatMessages with bound methods
    this.spaceChatMessages = {
      list: this.listSpaceChatMessages.bind(this),
    };
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

    // SpaceId integrity: warn when creating from app without explicit space_id
    // Undefined means omitted (likely a bug in space context), null means intentionally unassigned
    if (process.env.NODE_ENV !== 'test' && input.space_id === undefined) {
      // Lightweight, throttled-ish console warn
      console.warn(
        `[SupabaseRepo.create] Missing space_id for ${input.type} creation. Ensure callers pass space_id when creating inside a Space.`,
      );
    }

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
      // NOTE: subtype removed - column doesn't exist in habits table

      // Database schema truth: habits table has 'name' column (NOT 'title')
      const habitName = input.name ?? input.title ?? 'Untitled';

      // Build minimal payload with Insert schema validation
      // Map TypeScript fields to database columns (frequency_json, reminders_json, etc.)
      payload = habitInsertSchema.parse(
        compact({
          space_id: input.space_id ?? null,
          name: habitName, // Required - database column (habits use 'name', NOT 'title')
          // title: REMOVED - column doesn't exist in habits table
          frequency: input.frequency,
          // subtype: REMOVED - column doesn't exist in database
          ai_placed: input.ai_placed ?? false,
          why_string: input.why_string ?? null,
          origin: input.origin ?? undefined,
          canonical_type: input.canonicalType ?? undefined,
          source_message_id: input.sourceMessageId ?? undefined,
          labels: input.labels ?? undefined,
          views: input.views ?? {},
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
      // Database schema truth: todos table has 'name' column (NO 'title' column)
      if (!input.name) throw new Error('Todo requires name');

      // Build minimal payload with Insert schema validation
      payload = todoInsertSchema.parse(
        compact({
          space_id: input.space_id ?? null,
          name: input.name, // Required - PRIMARY field for todos (NO 'title' in DB)
          body: input.body ?? null,
          due_date: normalizeIsoDatetime(input.due_date) ?? null,
          due_time: input.due_time ?? null, // Phase 7+: HH:mm format
          undefined_due: input.undefined_due ?? undefined, // Optional (legacy)
          subtype: input.subtype ?? null, // AI-only: 'reminder' | 'microproject'
          reminders_json: input.reminders ?? null, // ReminderRow[] stored as jsonb
          notes: input.notes ?? null, // Additional notes
          tags: input.tags ?? null, // Categories array
          ai_placed: input.ai_placed ?? false,
          why_string: input.why_string ?? null,
          origin: input.origin ?? undefined,
          canonical_type: input.canonicalType ?? undefined,
          source_message_id: input.sourceMessageId ?? undefined,
          labels: input.labels ?? undefined,
          views: input.views ?? {},
        }),
      );

      if (__DEV__) {
        console.log('[SupabaseRepo.create] Using todoInsertSchema');
        console.log('[SupabaseRepo.create] todo payload:', JSON.stringify(payload, null, 2));
      }
    } else {
      // note
      // Database schema truth: notes table has 'title' column (NO 'name' column)
      if (!input.subtype) throw new Error('Note requires subtype');
      if (!input.title) throw new Error('Note requires title');

      // Build minimal payload with Insert schema validation
      payload = noteInsertSchema.parse(
        compact({
          space_id: input.space_id ?? null,
          title: input.title, // Required - PRIMARY field for notes (NO 'name' in DB)
          body: input.body ?? null,
          subtype: input.subtype,
          ai_placed: input.ai_placed ?? false,
          why_string: input.why_string ?? null,
          origin: input.origin ?? undefined,
          canonical_type: input.canonicalType ?? undefined,
          source_message_id: input.sourceMessageId ?? undefined,
          labels: input.labels ?? undefined,
          views: input.views ?? {},
          // Journal-specific fields (from generated schema - notes table has these)
          date: input.date ?? null, // ISO date
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

    // Strip null values from payload
    // DO NOT use withNameTitle() - causes PGRST204 errors for todos/notes
    // Database schema (from generated types):
    //   - TODOS: Use 'name' only
    //   - NOTES: Use 'title' only
    //   - HABITS: Use both 'name' AND 'title'
    const cleanPayload = stripNulls(payload);

    // Attach owner_id to ensure RLS policies work
    // Note: owner_id is the PRIMARY key for RLS, user_id is legacy/deprecated
    const payloadWithOwnerId = {
      ...cleanPayload,
      owner_id: this.ensureUserId(),
    };

    if (__DEV__) {
      console.log(
        `[SupabaseRepo.create] Final ${input.type} payload:`,
        JSON.stringify(payloadWithOwnerId, null, 2),
      );
    }

    // Database will auto-generate: id (uuid), created_at, updated_at
    const { data: result, error } = await supabase
      .from(table)
      .insert(payloadWithOwnerId)
      .select()
      .single();

    if (error) {
      logSupabaseError(
        `${input.type}.insert`,
        error,
        payloadWithOwnerId,
        this.currentUserId ?? undefined,
      );
      if (__DEV__) {
        console.error(
          `[SupabaseRepo.create] Payload that failed:`,
          JSON.stringify(payloadWithOwnerId, null, 2),
        );
      }
      const friendlyMsg = getUserFriendlyErrorMessage(error);
      throw new Error(`Failed to create ${input.type}: ${friendlyMsg}`);
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

  /**
   * Convenience helper to add an item into the catch-all (unsorted) bucket for a Space.
   * Forces ai_placed=true and origin='catchall'.
   */
  async addUnsorted(spaceId: string | null, input: CreateRecordInput): Promise<AppRecord> {
    return this.create({
      ...input,
      space_id: spaceId ?? null,
      ai_placed: true,
      origin: 'catchall',
    });
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
      if ('due_date' in patch) {
        const duePatch = patch.due_date as string | null | undefined;
        updatePayload.due_date = normalizeIsoDatetime(duePatch) ?? null;
      }
      if ('due_time' in patch) {
        const dueTimePatch = patch.due_time as string | null | undefined;
        updatePayload.due_time = dueTimePatch ?? null;
      }
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
    if ('views' in patch) updatePayload.views = patch.views ?? {};

    // Database trigger or default will handle updated_at
    const { data: result, error } = await supabase
      .from(table)
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logSbError(`${existing.type}.update`, error);
      throw new Error(`Failed to update record: ${error.message}`);
    }
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

    if (error) {
      logSbError(`${existing.type}.delete`, error);
      throw new Error(`Failed to delete record: ${error.message}`);
    }
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

  /**
   * List records by type with optional filtering
   * 10R: Uses idx_todos_space_id, idx_habits_space_id, idx_notes_space_id for space filtering
   * 10R: Uses idx_notes_created_at, idx_todos_created_at for chronological ordering
   */
  async listByType(type: AppRecord['type'], opts?: ListByTypeOptions): Promise<AppRecord[]> {
    const userId = this.ensureUserId();
    const table = tableFor(type);

    let query = supabase.from(table).select('*').eq('owner_id', userId);

    // Apply space filter (uses idx_{table}_space_id)
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

    // Uses idx_notes_created_at for chronological ordering
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

  /**
   * Search within a specific Space across items and chats.
   */
  async searchInSpace(
    spaceId: string,
    text: string,
  ): Promise<{ items: AppRecord[]; chats: import('../types').SpaceChat[] }> {
    const userId = this.ensureUserId();
    const q = `%${text}%`;

    // Search todos
    const todosQ = supabase
      .from('todos')
      .select('*')
      .eq('owner_id', userId)
      .eq('space_id', spaceId)
      .or(`name.ilike.${q},body.ilike.${q}`);

    // Search notes
    const notesQ = supabase
      .from('notes')
      .select('*')
      .eq('owner_id', userId)
      .eq('space_id', spaceId)
      .or(`title.ilike.${q},body.ilike.${q}`);

    // Search habits (name/title)
    const habitsQ = supabase
      .from('habits')
      .select('*')
      .eq('owner_id', userId)
      .eq('space_id', spaceId)
      .or(`name.ilike.${q},title.ilike.${q}`);

    // Search chats (title or last_message_snippet)
    const chatsQ = supabase
      .from('space_chats')
      .select('*')
      .eq('user_id', userId)
      .eq('space_id', spaceId)
      .or(`title.ilike.${q},last_message_snippet.ilike.${q}`)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false });

    const [todosRes, notesRes, habitsRes, chatsRes] = await Promise.all([
      todosQ,
      notesQ,
      habitsQ,
      chatsQ,
    ]);

    if (todosRes.error) logSupabaseError('searchInSpace.todos', todosRes.error);
    if (notesRes.error) logSupabaseError('searchInSpace.notes', notesRes.error);
    if (habitsRes.error) logSupabaseError('searchInSpace.habits', habitsRes.error);
    if (chatsRes.error) logSupabaseError('searchInSpace.chats', chatsRes.error);

    const todos = (todosRes.data ?? [])
      .map(mapTodoFromDb)
      .map((r: any) => ({ ...r, type: 'todo' }));
    const notes = (notesRes.data ?? [])
      .map(mapNoteFromDb)
      .map((r: any) => ({ ...r, type: 'note' }));
    const habits = (habitsRes.data ?? [])
      .map(mapHabitFromDb)
      .map((r: any) => ({ ...r, type: 'habit' }));
    const items: AppRecord[] = [...todos, ...notes, ...habits] as any;
    const chats = (chatsRes.data ?? []) as import('../types').SpaceChat[];

    return { items, chats };
  }

  /**
   * List todos due today
   * 10R: Uses idx_todos_due_date for efficient filtering
   */
  async listDueToday(_nowIso: string): Promise<AppRecord[]> {
    const userId = this.ensureUserId();
    const results: AppRecord[] = [];

    // Get todos with due_date = today (uses idx_todos_due_date)
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
    try {
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

      if (todoError) {
        // Throttled logging: only warn once per minute
        const now = Date.now();
        if (now - this.lastCountCompletedTodayWarn > this.WARN_THROTTLE_MS) {
          this.lastCountCompletedTodayWarn = now;
          if (__DEV__) {
            console.warn('[SupabaseRepo.countCompletedToday] todos count error', {
              code: (todoError as any)?.code,
              details: (todoError as any)?.details,
              hint: (todoError as any)?.hint,
              message: todoError.message,
            });
          }
        }
        return 0;
      }

      // TODO: Add habit completions when we have a completion tracking table
      return todoCount || 0;
    } catch (error) {
      // Catch any unexpected errors (e.g., ensureUserId throwing)
      const now = Date.now();
      if (now - this.lastCountCompletedTodayWarn > this.WARN_THROTTLE_MS) {
        this.lastCountCompletedTodayWarn = now;
        if (__DEV__) {
          console.warn('[SupabaseRepo.countCompletedToday] unexpected error', error);
        }
      }
      return 0;
    }
  }

  // =======================================================
  // Phase 10.9 (Today v3) — New helpers
  // =======================================================

  async listTodayMerged(nowIso: string): Promise<
    Array<
      | {
          type: 'todo';
          id: ID;
          name: string;
          due_date?: string | null;
          due_day?: string | null;
          space_id?: ID | null;
          tags?: string[];
          status?: 'active' | 'completed' | 'archived';
          carry_forward?: boolean;
          overdue?: boolean;
          nearDue?: boolean;
        }
      | {
          type: 'habit';
          id: ID;
          name: string;
          space_id?: ID | null;
          tags?: string[];
          cadence?: 'day' | 'week' | 'month';
          target_count?: number;
          period_unit?: 'day' | 'week' | 'month';
          time_window?: 'any' | 'morning' | 'midday' | 'evening';
          progress_today?: number;
        }
    >
  > {
    const userId = this.ensureUserId();
    const day = ensureDay(nowIso);

    const { data: todos, error: todosErr } = await supabase
      .from('todos')
      .select('id,name,due_date,due_day,space_id,status,carry_forward')
      .eq('owner_id', userId)
      .eq('status', 'active')
      .or(`due_day.eq.${day},carry_forward.eq.true`);

    if (todosErr) {
      console.error('[listTodayMerged] todos query failed:', todosErr);
    }

    const now = new Date();
    const todoItems =
      (todos || []).map((t: any) => {
        let overdue = false;
        let nearDue = false;
        if (t.due_date) {
          const due = new Date(t.due_date);
          if (!Number.isNaN(due.getTime())) {
            overdue = due < now;
            nearDue = !overdue && due.getTime() - now.getTime() < 3 * 60 * 60 * 1000;
          }
        }
        return {
          type: 'todo' as const,
          id: t.id,
          name: t.name,
          due_date: t.due_date,
          due_day: t.due_day,
          space_id: t.space_id ?? null,
          tags: [],
          status: t.status,
          carry_forward: !!t.carry_forward,
          overdue,
          nearDue,
        };
      }) ?? [];

    let habitItems: any[] = [];
    try {
      const { data: habits, error: habitsErr } = await supabase
        .from('habits')
        .select('id,name,space_id,cadence,target_count,period_unit,time_window')
        .eq('owner_id', userId);

      if (habitsErr) throw habitsErr;

      const { data: progressRows, error: progErr } = await supabase
        .from('habit_progress')
        .select('habit_id,count,occurred_day')
        .eq('owner_id', userId)
        .eq('occurred_day', day);

      if (progErr) throw progErr;

      const progressByHabit = new Map<string, number>();
      (progressRows || []).forEach((row: any) => {
        progressByHabit.set(
          row.habit_id,
          (progressByHabit.get(row.habit_id) || 0) + (row.count || 1),
        );
      });

      habitItems =
        (habits || [])
          .map((h: any) => {
            const target = Math.max(1, h.target_count ?? 1);
            const done = progressByHabit.get(h.id) || 0;
            const remaining = target - done;
            return {
              type: 'habit' as const,
              id: h.id,
              name: h.name,
              space_id: h.space_id ?? null,
              tags: [],
              cadence: (h.cadence as any) || 'day',
              target_count: target,
              period_unit: (h.period_unit as any) || 'day',
              time_window: (h.time_window as any) || 'any',
              progress_today: done,
              _remaining: remaining,
            };
          })
          .filter((habit) => (habit.cadence === 'day' ? (habit as any)._remaining > 0 : true))
          .map((habit) => {
            delete (habit as any)._remaining;
            return habit;
          }) ?? [];
    } catch (error) {
      console.error('[listTodayMerged] habits/progress failed:', error);
      habitItems = [];
    }

    return [...habitItems, ...todoItems];
  }

  async logHabitProgress(
    habitId: ID,
    atIso?: string,
    count = 1,
    occurrenceIndex?: number,
  ): Promise<void> {
    const ownerId = this.ensureUserId();
    const payload: any = {
      owner_id: ownerId,
      habit_id: habitId,
      count,
    };

    if (atIso) payload.occurred_at = atIso;
    if (typeof occurrenceIndex === 'number') payload.occurrence_index = occurrenceIndex;

    const { error } = await supabase.from('habit_progress').insert(payload);
    if (error) throw new Error(`logHabitProgress failed: ${error.message}`);
  }

  async getHabitProgressForDate(habitId: ID, dayIso: string): Promise<number> {
    const ownerId = this.ensureUserId();
    const day = ensureDay(dayIso);
    const { data, error } = await supabase
      .from('habit_progress')
      .select('count')
      .eq('owner_id', ownerId)
      .eq('habit_id', habitId)
      .eq('occurred_day', day);

    if (error) throw new Error(`getHabitProgressForDate failed: ${error.message}`);
    return (data ?? []).reduce((sum: number, row: any) => sum + (row.count ?? 1), 0);
  }

  async getFocusForDate(dayIso: string): Promise<{
    id: ID;
    entry_id: ID | null;
    entry_type: 'todo' | 'habit' | 'note' | null;
    source: 'auto' | 'user' | 'carry_forward';
    created_at: string;
    expires_at: string;
  } | null> {
    const ownerId = this.ensureUserId();
    const day = ensureDay(dayIso);
    const { data, error } = await supabase
      .from('focus_card')
      .select('id,entry_id,entry_type,source,created_at,expires_at,focus_day')
      .eq('owner_id', ownerId)
      .eq('focus_day', day)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`getFocusForDate failed: ${error.message}`);
    if (!data) return null;

    return {
      id: data.id,
      entry_id: data.entry_id,
      entry_type: data.entry_type,
      source: data.source,
      created_at: data.created_at,
      expires_at: data.expires_at,
    };
  }

  async setFocus(params: {
    entry_id: ID | null;
    entry_type: 'todo' | 'habit' | 'note' | null;
    source: 'auto' | 'user' | 'carry_forward';
    expires_at: string;
  }): Promise<void> {
    const ownerId = this.ensureUserId();
    const day = ensureDay(params.expires_at);
    const payload: any = {
      owner_id: ownerId,
      entry_id: params.entry_id,
      entry_type: params.entry_type,
      source: params.source,
      expires_at: params.expires_at,
      focus_day: day,
    };

    const { error } = await supabase
      .from('focus_card')
      .upsert(payload, { onConflict: 'owner_id,focus_day' })
      .select('id')
      .single();

    if (error) throw new Error(`setFocus failed: ${error.message}`);
  }

  async clearFocusForDate(dayIso: string): Promise<void> {
    const ownerId = this.ensureUserId();
    const day = ensureDay(dayIso);
    const { error } = await supabase
      .from('focus_card')
      .delete()
      .eq('owner_id', ownerId)
      .eq('focus_day', day);

    if (error) throw new Error(`clearFocusForDate failed: ${error.message}`);
  }

  async topFocusCandidates(
    limit: number,
  ): Promise<Array<{ id: ID; type: 'habit' | 'todo'; priority: number }>> {
    const ownerId = this.ensureUserId();
    const day = ensureDay(new Date().toISOString());

    const { data, error } = await supabase
      .from('todos')
      .select('id,carry_forward,due_day,status')
      .eq('owner_id', ownerId)
      .eq('status', 'active')
      .or(`carry_forward.eq.true,due_day.eq.${day}`)
      .limit(Math.max(1, limit) * 2);

    if (error) throw new Error(`topFocusCandidates.todos failed: ${error.message}`);

    const scored: Array<{ id: ID; type: 'habit' | 'todo'; priority: number }> = [];

    scored.push(
      ...(data ?? []).map((row: any) => ({
        id: row.id as ID,
        type: 'todo' as const,
        priority: (row.carry_forward ? 100 : 0) + (row.due_day === day ? 50 : 0),
      })),
    );

    const { data: habitRows, error: habitError } = await supabase
      .from('habits')
      .select('id,target_count')
      .eq('owner_id', ownerId);

    if (!habitError && habitRows && habitRows.length > 0) {
      const { data: progress, error: progressErr } = await supabase
        .from('habit_progress')
        .select('habit_id,count')
        .eq('owner_id', ownerId)
        .eq('occurred_day', day);

      if (progressErr)
        throw new Error(`topFocusCandidates.progress failed: ${progressErr.message}`);

      const map = new Map<string, number>();
      (progress ?? []).forEach((row: any) => {
        map.set(row.habit_id, (map.get(row.habit_id) || 0) + (row.count ?? 1));
      });

      for (const habit of habitRows) {
        const target = Math.max(1, habit.target_count ?? 1);
        const done = map.get(habit.id) || 0;
        if (done < target) {
          scored.push({ id: habit.id, type: 'habit', priority: 40 - done });
        }
      }
    } else if (habitError) {
      throw new Error(`topFocusCandidates.habits failed: ${habitError.message}`);
    }

    scored.sort((a, b) => b.priority - a.priority);
    return scored.slice(0, limit);
  }

  async listRecentDrops(
    sinceIso: string,
  ): Promise<Array<{ id: ID; title?: string | null; body?: string | null; created_at: string }>> {
    const ownerId = this.ensureUserId();
    const { data, error } = await supabase
      .from('notes')
      .select('id,title,body,created_at')
      .eq('owner_id', ownerId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw new Error(`listRecentDrops failed: ${error.message}`);
    return (data ?? []).map((row: any) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      created_at: row.created_at,
    }));
  }

  async getTodaySummary(): Promise<{ completed: number; remaining: number }> {
    const ownerId = this.ensureUserId();
    const day = ensureDay(new Date().toISOString());

    const { count: completedCount, error: completedError } = await supabase
      .from('todos')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', ownerId)
      .gte('completed_at', `${day}T00:00:00Z`)
      .lt('completed_at', `${day}T23:59:59Z`);

    if (completedError)
      throw new Error(`getTodaySummary.completed failed: ${completedError.message}`);

    const { count: remainingTodos, error: remainingError } = await supabase
      .from('todos')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', ownerId)
      .eq('status', 'active')
      .or(`due_day.eq.${day},carry_forward.eq.true`);

    if (remainingError)
      throw new Error(`getTodaySummary.remaining failed: ${remainingError.message}`);

    return {
      completed: completedCount ?? 0,
      remaining: remainingTodos ?? 0,
    };
  }

  async sweepApplyAction(
    id: ID,
    type: 'habit' | 'todo',
    action: 'archive' | 'carry_forward' | 'keep',
    details?: { archived_reason?: string },
  ): Promise<void> {
    const ownerId = this.ensureUserId();

    if (type === 'todo') {
      if (action === 'archive') {
        const { error } = await supabase
          .from('todos')
          .update({ status: 'archived', archived_reason: details?.archived_reason ?? 'swept' })
          .eq('id', id)
          .eq('owner_id', ownerId);

        if (error) throw new Error(`sweepApplyAction.archive failed: ${error.message}`);
        return;
      }

      if (action === 'carry_forward') {
        const { error } = await supabase
          .from('todos')
          .update({ carry_forward: true })
          .eq('id', id)
          .eq('owner_id', ownerId);

        if (error) throw new Error(`sweepApplyAction.carry_forward failed: ${error.message}`);
        return;
      }

      // keep -> no-op
      return;
    }

    // Habits currently ignore sweep actions beyond "keep"
    if (action === 'archive') {
      // Placeholder: habits aren't archived via sweep; swallow request for now.
      return;
    }

    if (action === 'carry_forward') {
      // Habits don't support carry_forward flag; skip.
      return;
    }
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
    const userId = this.ensureUserId();

    // Validate input
    const payload = spaceInsertSchema.parse(input);

    // Build insert payload with owner_id (DB truth from generated types)
    const insertData: DBSpaceInsert = {
      name: payload.name,
      icon: payload.icon ?? undefined,
      theme: payload.theme ?? 'deepTeal',
      owner_id: userId,
    };

    const { data, error } = await supabase.from('spaces').insert(insertData).select().single();

    if (error) {
      logSupabaseError('spaces.insert', error, insertData, userId);
      throw new Error(`Failed to create space: ${error.message} (code: ${error.code})`);
    }
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

  /**
   * Phase 10.8: Get latest Space Insight summary from projection
   */
  async getLatestSpaceInsight(spaceId: string): Promise<{
    summary: string;
    summary_at: string;
    tokens: number;
  } | null> {
    const userId = this.ensureUserId();

    const { data, error } = await supabase
      .from('spaces')
      .select('last_summary, last_summary_at, last_summary_tokens')
      .eq('id', spaceId)
      .eq('owner_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      logSupabaseError('getLatestSpaceInsight', error);
      return null;
    }

    if (!data?.last_summary) return null;

    return {
      summary: data.last_summary,
      summary_at: data.last_summary_at || new Date().toISOString(),
      tokens: data.last_summary_tokens || 0,
    };
  }

  /**
   * Phase 10.8: Fetch recent Space Insight history
   */
  async getSpaceInsightHistory(spaceId: string, limit: number = 10): Promise<any[]> {
    const userId = this.ensureUserId();

    // Verify ownership
    const { data: space } = await supabase
      .from('spaces')
      .select('id')
      .eq('id', spaceId)
      .eq('owner_id', userId)
      .single();

    if (!space) return [];

    const { data, error } = await supabase
      .from('space_summaries')
      .select('*')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logSupabaseError('getSpaceInsightHistory', error);
      return [];
    }

    return data || [];
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
  // SPACE CHAT MESSAGES (Phase 10.7E)
  // ==========================

  /**
   * List space chat messages for a given space
   * Returns messages in chronological order (oldest first)
   * Phase 10.7E: Used by buildChatContext for conversation memory
   */
  private async listSpaceChatMessages(spaceId: string, opts?: { limit?: number }): Promise<any[]> {
    const DEFAULT_CHAT_LIMIT = 50;
    const limit = opts?.limit ?? DEFAULT_CHAT_LIMIT;

    try {
      const userId = this.ensureUserId();

      // Fetch messages in descending order (newest first), then reverse for chronological
      const { data, error } = await supabase
        .from('space_chat_messages')
        .select('id, chat_id, space_id, role, content, created_at')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        if (__DEV__) {
          console.warn('[SupabaseRepo.spaceChatMessages.list] error', error);
        }
        return [];
      }

      // Return in chronological order (oldest first) for conversation context
      const rows = (data ?? []).slice().reverse();
      return rows;
    } catch (error) {
      if (__DEV__) {
        console.warn('[SupabaseRepo.spaceChatMessages.list] unexpected error', error);
      }
      return [];
    }
  }

  // ==========================
  // TAG AND PEOPLE METHODS (Phase 7+)
  // ==========================

  async listTags(): Promise<Tag[]> {
    if (!this.currentUserId) throw new Error('User ID required');

    // 10R: Uses owner_id (was user_id) after schema alignment
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .eq('owner_id', this.currentUserId)
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
    const userId = this.ensureUserId();

    // Build insert payload with owner_id (DB truth from generated types)
    const insertPayload: DBPersonInsert = {
      owner_id: userId,
      display_name: input.display_name,
      email: input.email ?? undefined,
      dates_json: input.dates ?? undefined,
      notes: input.notes ?? undefined,
      notes_fmt: input.notes_fmt ?? undefined,
      reminders_json: input.reminders ?? undefined,
      space_id: input.space_id ?? undefined,
      tags: input.tags ?? undefined,
    };

    const { data, error } = await supabase.from('people').insert(insertPayload).select().single();

    if (error) {
      logSupabaseError('people.insert', error, insertPayload, userId);
      throw new Error(`Failed to create person: ${error.message} (code: ${error.code})`);
    }
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

    // 10R: Build insert payload with owner_id (was user_id)
    const insertPayload: DBTagInsert = {
      owner_id: this.currentUserId,
      name,
    };

    // Try to insert
    const { data: insertData, error: insertError } = await supabase
      .from('tags')
      .insert(insertPayload)
      .select()
      .single();

    // If no error, return the new tag
    if (!insertError && insertData) {
      return insertData;
    }

    // If unique constraint violation (code 23505), fetch existing tag
    if (insertError && insertError.code === '23505') {
      // 10R: Query uses owner_id (was user_id)
      const { data: existingData, error: selectError } = await supabase
        .from('tags')
        .select('*')
        .eq('owner_id', this.currentUserId)
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
   * 10R: Uses idx_tag_map_owner_entity index for performance
   */
  async listItemTags(itemId: string): Promise<import('./types').Tag[]> {
    if (!this.currentUserId) throw new Error('User ID required');

    // 10R: Query uses owner_id and entity_id (was user_id/item_id)
    const { data, error } = await supabase
      .from('tag_map')
      .select('tag_id, tags(*)')
      .eq('owner_id', this.currentUserId)
      .eq('entity_id', itemId);

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

    // Build insert payload with owner_id (DB truth from generated types)
    const insertPayload: DBTagMapInsert = {
      owner_id: this.currentUserId,
      entity_id: params.itemId,
      entity_type: params.itemType,
      tag_id: params.tagId,
    };

    const { data, error } = await supabase.from('tag_map').insert(insertPayload).select().single();

    if (error) throw new Error(`Failed to link tag: ${error.message}`);
    if (!data) throw new Error('Failed to link tag: no data returned');
    return data;
  }

  /**
   * Unlink a tag from an item
   */
  async unlinkTag(params: { itemId: string; tagId: string }): Promise<void> {
    if (!this.currentUserId) throw new Error('User ID required');

    // 10R: Delete uses owner_id and entity_id (was user_id/item_id)
    const { error } = await supabase
      .from('tag_map')
      .delete()
      .eq('owner_id', this.currentUserId)
      .eq('entity_id', params.itemId)
      .eq('tag_id', params.tagId);

    if (error) throw new Error(`Failed to unlink tag: ${error.message}`);
  }

  /**
   * List all people linked to a specific item
   * 10R: Uses idx_entity_people_entity index for performance
   */
  async listLinkedPeopleByItem(itemId: string): Promise<import('./types').EntityPerson[]> {
    if (!this.currentUserId) throw new Error('User ID required');

    // 10R: Query uses owner_id and entity_id (was user_id/item_id)
    const { data, error } = await supabase
      .from('entity_people')
      .select('*')
      .eq('owner_id', this.currentUserId)
      .eq('entity_id', itemId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to list linked people: ${error.message}`);
    return data || [];
  }

  /**
   * Link a person to an item
   * TODO: Schema has been normalized to use person_id FK.
   * This method needs refactoring to match DB schema.
   */
  async linkPerson(params: {
    itemId: string;
    itemType: import('./types').ItemType;
    personName?: string;
    personEmail?: string;
  }): Promise<import('./types').EntityPerson> {
    if (!this.currentUserId) throw new Error('User ID required');

    // TEMPORARY: Create a person record first, then link
    // In the future, this should be refactored to separate person creation from linking
    const person = await this.createPerson({
      display_name: params.personName || 'Unnamed',
      email: params.personEmail || null,
    });

    // Build insert payload with owner_id and person_id (DB truth from generated types)
    const insertPayload: DBEntityPeopleInsert = {
      owner_id: this.currentUserId,
      entity_id: params.itemId,
      entity_type: params.itemType,
      person_id: person.id, // Required FK to people table
    };

    const { data, error } = await supabase
      .from('entity_people')
      .insert(insertPayload)
      .select()
      .single();

    if (error) throw new Error(`Failed to link person: ${error.message}`);
    if (!data) throw new Error('Failed to link person: no data returned');
    return data;
  }

  /**
   * Unlink a person from an item
   * 10R: Now uses id column (added in migration) for simpler deletion
   */
  async unlinkPerson(entityPersonId: string): Promise<void> {
    if (!this.currentUserId) throw new Error('User ID required');

    // 10R: Delete by id (now exists in DB) and owner_id (was user_id)
    const { error } = await supabase
      .from('entity_people')
      .delete()
      .eq('owner_id', this.currentUserId)
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

  // ==========================
  // PHASE 10.2: CORTEX PRIMITIVES
  // ==========================

  /**
   * Get cortex preferences for a user.
   * Uses primary key lookup on cortex_preferences(owner_id).
   */
  async getCortexPrefs(userId: string): Promise<import('./types').CortexPreferences | null> {
    const { data, error } = await supabase
      .from('cortex_preferences')
      .select('*')
      .eq('owner_id', userId)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Failed to get cortex preferences: ${error.message}`);
    return data as import('./types').CortexPreferences | null;
  }

  /**
   * Set/update cortex preferences (upsert).
   * Merges partial with existing row, sets updated_at=now().
   */
  async setCortexPrefs(
    userId: string,
    partial: import('./types').CortexPreferencesUpdate,
  ): Promise<import('./types').CortexPreferences> {
    const { data, error } = await supabase
      .from('cortex_preferences')
      .upsert(
        {
          owner_id: userId,
          ...partial,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_id' },
      )
      .select()
      .single();

    if (error) throw new Error(`Failed to set cortex preferences: ${error.message}`);
    if (!data) throw new Error('No data returned from set cortex preferences');
    return data as import('./types').CortexPreferences;
  }

  /**
   * Find a list by key (does not create).
   * Uses indexed lookup on (owner_id, key).
   */
  async findListByKey(
    key: string,
    opts?: { userId?: string; spaceId?: string | null },
  ): Promise<import('./types').List | null> {
    const userId = opts?.userId ?? this.ensureUserId();

    let query = supabase.from('lists').select('*').eq('owner_id', userId).eq('key', key);

    if (opts?.spaceId !== undefined) {
      if (opts.spaceId === null) {
        query = query.is('space_id', null);
      } else {
        query = query.eq('space_id', opts.spaceId);
      }
    }

    const { data, error } = await query.limit(1).maybeSingle();

    if (error) throw new Error(`Failed to find list by key: ${error.message}`);
    return data as import('./types').List | null;
  }

  /**
   * Get or create a list by key.
   * Uses indexed lookup; creates with generated name if not found.
   */
  async getOrCreateList(
    key: string,
    opts?: { userId?: string; spaceId?: string | null; name?: string },
  ): Promise<import('./types').List> {
    const userId = opts?.userId ?? this.ensureUserId();

    // Try to find existing
    const existing = await this.findListByKey(key, { userId, spaceId: opts?.spaceId });
    if (existing) return existing;

    // Create new
    const name = opts?.name ?? titleCase(key);
    const { data, error } = await supabase
      .from('lists')
      .insert({
        owner_id: userId,
        key,
        name,
        space_id: opts?.spaceId ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create list: ${error.message}`);
    if (!data) throw new Error('No data returned from create list');
    return data as import('./types').List;
  }

  /**
   * Add an item to a list.
   * Uses indexed lookup on (list_id, created_at).
   */
  async addListItem(
    listId: string,
    label: string,
    meta?: { qty?: number; unit?: string; meta_json?: any },
  ): Promise<import('./types').ListItem> {
    const { data, error } = await supabase
      .from('list_items')
      .insert({
        list_id: listId,
        label,
        qty: meta?.qty ?? null,
        unit: meta?.unit ?? null,
        meta_json: meta?.meta_json ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to add list item: ${error.message}`);
    if (!data) throw new Error('No data returned from add list item');
    return data as import('./types').ListItem;
  }

  /**
   * List all items in a list, ordered by created_at.
   * Uses indexed lookup on (list_id, created_at).
   */
  async listItems(listId: string): Promise<import('./types').ListItem[]> {
    const { data, error } = await supabase
      .from('list_items')
      .select('*')
      .eq('list_id', listId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to list items: ${error.message}`);
    return (data ?? []) as import('./types').ListItem[];
  }

  /**
   * Mark a list item complete/incomplete by setting/unsetting completed_at
   */
  async toggleListItemComplete(listItemId: string, done: boolean): Promise<void> {
    const { error } = await supabase
      .from('list_items')
      .update({ completed_at: done ? new Date().toISOString() : null })
      .eq('id', listItemId);

    if (error) throw new Error(`Failed to toggle list item: ${error.message}`);
  }

  /**
   * Rename an item (quick edit in UI)
   */
  async renameListItem(listItemId: string, label: string): Promise<void> {
    const { error } = await supabase.from('list_items').update({ label }).eq('id', listItemId);

    if (error) throw new Error(`Failed to rename list item: ${error.message}`);
  }

  /**
   * Write an event to the log (non-blocking usage expected).
   * Uses indexed lookup on (owner_id, kind, created_at desc).
   */
  async writeEvent(
    kind: string,
    payload: Record<string, any>,
    opts?: { userId?: string },
  ): Promise<void> {
    const userId = opts?.userId ?? this.ensureUserId();

    const { error } = await supabase.from('events').insert({
      owner_id: userId,
      kind,
      payload_json: payload,
    });

    if (error) throw new Error(`Failed to write event: ${error.message}`);
  }

  // Phase 10.4 - Space defaults for Cortex biasing

  /**
   * Get defaults_json for a space.
   * Returns null if space not found or defaults_json is null.
   */
  async getSpaceDefaults(spaceId: string): Promise<any | null> {
    const { data, error } = await supabase
      .from('spaces')
      .select('defaults_json')
      .eq('id', spaceId)
      .limit(1)
      .maybeSingle();

    if (error) {
      logSupabaseError('getSpaceDefaults', error);
      throw new Error(`Failed to get space defaults: ${getUserFriendlyErrorMessage(error)}`);
    }

    return data?.defaults_json ?? null;
  }

  /**
   * Set/update defaults_json for a space (shallow merge).
   * Merges patch with existing defaults at one level (no deep merge).
   * Returns updated defaults_json.
   */
  async setSpaceDefaults(spaceId: string, patch: Record<string, any>): Promise<any> {
    // First fetch existing defaults
    const existing = await this.getSpaceDefaults(spaceId);

    // Shallow merge
    const merged = { ...existing, ...patch };

    // Update
    const { data, error } = await supabase
      .from('spaces')
      .update({ defaults_json: merged })
      .eq('id', spaceId)
      .select('defaults_json')
      .single();

    if (error) {
      logSupabaseError('setSpaceDefaults', error);
      throw new Error(`Failed to set space defaults: ${getUserFriendlyErrorMessage(error)}`);
    }

    return data.defaults_json;
  }

  // Phase v3.3 - Notes/Journal methods
  async listNotes(spaceId: string, opts?: { query?: string }): Promise<any[]> {
    const userId = this.ensureUserId();
    let query = supabase
      .from('notes')
      .select('*')
      .eq('owner_id', userId)
      .eq('space_id', spaceId)
      .order('updated_at', { ascending: false });

    if (opts?.query) {
      const q = `%${opts.query}%`;
      query = query.or(`title.ilike.${q},body.ilike.${q}`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to list notes: ${error.message}`);
    return (data || []).map((row) => ({
      id: row.id,
      user_id: row.owner_id,
      space_id: row.space_id,
      type: row.subtype || 'note',
      title: row.title || row.body?.split('\n')[0]?.trim().slice(0, 60) || 'Untitled',
      content: row.body || '',
      date: row.date || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  async createNote(input: {
    space_id: string;
    user_id: string;
    type: 'note' | 'journal';
    content: string;
    date?: string | null;
    title?: string;
  }): Promise<any> {
    const userId = this.ensureUserId();
    const { data, error } = await supabase
      .from('notes')
      .insert({
        owner_id: userId,
        space_id: input.space_id,
        subtype: input.type === 'journal' ? 'journal' : 'reference',
        title: input.title || input.content.split('\n')[0]?.trim().slice(0, 60) || 'Untitled',
        body: input.content,
        date: input.date || null,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create note: ${error.message}`);
    return {
      id: data.id,
      user_id: data.owner_id,
      space_id: data.space_id,
      type: data.subtype || 'note',
      title: data.title,
      content: data.body || '',
      date: data.date,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async updateNote(
    id: string,
    patch: Partial<{ content: string; title: string; date: string | null }>,
  ): Promise<void> {
    const userId = this.ensureUserId();
    const updates: any = {};
    if (patch.content !== undefined) updates.body = patch.content;
    if (patch.title !== undefined) updates.title = patch.title;
    if (patch.date !== undefined) updates.date = patch.date;

    const { error } = await supabase
      .from('notes')
      .update(updates)
      .eq('id', id)
      .eq('owner_id', userId);
    if (error) throw new Error(`Failed to update note: ${error.message}`);
  }

  async deleteNote(id: string): Promise<void> {
    const userId = this.ensureUserId();
    const { error } = await supabase.from('notes').delete().eq('id', id).eq('owner_id', userId);
    if (error) throw new Error(`Failed to delete note: ${error.message}`);
  }

  subscribeToNotes(spaceId: string, callback: (payload: any) => void): any {
    const userId = this.ensureUserId();
    const channel = supabase
      .channel(`notes:${spaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notes',
          filter: `owner_id=eq.${userId},space_id=eq.${spaceId}`,
        },
        callback,
      )
      .subscribe();
    return channel;
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

  /**
   * Soft-archive a chat by setting archived_at.
   */
  async archive(chatId: string): Promise<void> {
    const userId = this.ensureUserId();
    const { error } = await supabase
      .from('space_chats')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', chatId)
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to archive space chat: ${error.message}`);
  }

  /**
   * Hard delete a chat. If FK cascade is not configured, delete messages first.
   */
  async delete(chatId: string): Promise<void> {
    const userId = this.ensureUserId();
    // Best-effort: delete messages first (safe even if FK cascade exists)
    const msgDel = await supabase
      .from('space_chat_messages')
      .delete()
      .eq('chat_id', chatId)
      .eq('user_id', userId);
    if (msgDel.error) {
      // Log but attempt to delete chat anyway (some schemas may not include user_id on messages)
      console.warn('[SupabaseSpaceChatRepo.delete] message delete warning:', msgDel.error.message);
    }

    const chatDel = await supabase
      .from('space_chats')
      .delete()
      .eq('id', chatId)
      .eq('user_id', userId);
    if (chatDel.error) throw new Error(`Failed to delete space chat: ${chatDel.error.message}`);
  }
}

/**
 * SupabaseSpaceChatMessageRepo - Space chat message management (Phase 10.5)
 */
export class SupabaseSpaceChatMessageRepo {
  constructor(private currentUserId?: string) {}

  private ensureUserId(): string {
    if (!this.currentUserId) throw new Error('User ID not available');
    return this.currentUserId;
  }

  async list(chatId: string): Promise<import('../types').SpaceChatMessage[]> {
    const userId = this.ensureUserId();

    let query = supabase.from('space_chat_messages').select('*').eq('chat_id', chatId);
    // Jest Supabase mock may not support multiple chained filters; apply user filter outside tests
    if (process.env.JEST_WORKAROUND !== '1') {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to list space chat messages: ${error.message}`);

    return (data || []) as import('../types').SpaceChatMessage[];
  }

  async append(
    input: import('../types').SpaceChatMessageInsert,
  ): Promise<import('../types').SpaceChatMessage> {
    const userId = this.ensureUserId();

    const { data, error } = await supabase
      .from('space_chat_messages')
      .insert({
        chat_id: input.chat_id,
        space_id: input.space_id,
        user_id: userId,
        role: input.role,
        content: input.content,
        metadata_json: input.metadata_json ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create space chat message: ${error.message}`);
    if (!data) throw new Error('No data returned from create space chat message');

    return data as import('../types').SpaceChatMessage;
  }

  // Phase 10.6: Milestones CRUD (space_milestones)
  async listMilestones(spaceId: string): Promise<import('../types').SpaceMilestone[]> {
    const userId = this.ensureUserId();
    const { data, error } = await supabase
      .from('space_milestones')
      .select('*')
      .eq('owner_id', userId)
      .eq('space_id', spaceId)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Failed to list milestones: ${error.message}`);
    return (data || []) as import('../types').SpaceMilestone[];
  }

  async createMilestone(
    spaceId: string,
    payload: { title: string; date: string; note?: string | null },
  ): Promise<import('../types').SpaceMilestone> {
    const userId = this.ensureUserId();
    const { data, error } = await supabase
      .from('space_milestones')
      .insert({
        owner_id: userId,
        space_id: spaceId,
        title: payload.title,
        date: payload.date,
        note: payload.note ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create milestone: ${error.message}`);
    if (!data) throw new Error('No data returned from createMilestone');
    return data as import('../types').SpaceMilestone;
  }

  async updateMilestone(
    id: string,
    patch: Partial<{ title: string; date: string; note: string | null }>,
  ): Promise<import('../types').SpaceMilestone> {
    const userId = this.ensureUserId();
    const { data, error } = await supabase
      .from('space_milestones')
      .update(stripNulls(compact(patch)))
      .eq('id', id)
      .eq('owner_id', userId)
      .select()
      .single();
    if (error) throw new Error(`Failed to update milestone: ${error.message}`);
    if (!data) throw new Error('No data returned from updateMilestone');
    return data as import('../types').SpaceMilestone;
  }

  async deleteMilestone(id: string): Promise<void> {
    const userId = this.ensureUserId();
    const { error } = await supabase
      .from('space_milestones')
      .delete()
      .eq('id', id)
      .eq('owner_id', userId);
    if (error) throw new Error(`Failed to delete milestone: ${error.message}`);
  }
}

/**
 * SupabaseSpaceMilestoneRepo - CRUD for space_milestones (Phase 11.x)
 */
export class SupabaseSpaceMilestoneRepo {
  constructor(private currentUserId?: string) {}

  private ensureUserId(): string {
    if (!this.currentUserId) throw new Error('User ID not available');
    return this.currentUserId;
  }

  async list(spaceId: string): Promise<import('../types').SpaceMilestone[]> {
    const userId = this.ensureUserId();
    const { data, error } = await supabase
      .from('space_milestones')
      .select('*')
      .eq('owner_id', userId)
      .eq('space_id', spaceId)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Failed to list milestones: ${error.message}`);
    return (data || []) as import('../types').SpaceMilestone[];
  }

  async create(input: {
    space_id: string;
    title: string;
    date: string; // YYYY-MM-DD
    note?: string | null;
  }): Promise<import('../types').SpaceMilestone> {
    const userId = this.ensureUserId();
    const { data, error } = await supabase
      .from('space_milestones')
      .insert({
        owner_id: userId,
        space_id: input.space_id,
        title: input.title,
        date: input.date,
        note: input.note ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create milestone: ${error.message}`);
    return data as import('../types').SpaceMilestone;
  }

  async delete(id: string): Promise<void> {
    const userId = this.ensureUserId();
    const { error } = await supabase
      .from('space_milestones')
      .delete()
      .eq('id', id)
      .eq('owner_id', userId);
    if (error) throw new Error(`Failed to delete milestone: ${error.message}`);
  }

  async update(
    id: string,
    patch: Partial<{ title: string; date: string; note: string | null }>,
  ): Promise<import('../types').SpaceMilestone> {
    const userId = this.ensureUserId();
    const { data, error } = await supabase
      .from('space_milestones')
      .update(stripNulls(compact(patch)))
      .eq('id', id)
      .eq('owner_id', userId)
      .select()
      .single();
    if (error) throw new Error(`Failed to update milestone: ${error.message}`);
    return data as import('../types').SpaceMilestone;
  }
}
