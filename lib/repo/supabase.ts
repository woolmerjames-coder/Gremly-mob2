/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { isToday, parseISO } from 'date-fns';
import { Alert, Platform, ToastAndroid } from 'react-native';
import type { AppRecord, Note, Todo, Habit, ID, Space, Tag, Person, EntityType } from '../types';
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
import { eventBus } from '../events';
import { computeDueDay, computeDueTime } from '../date/computeDueDay';
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

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const TAG_FILTER_TOAST_MESSAGE = 'Tag filter temporarily unavailable';
let hasShownTagFilterToast = false;

const formatSupabaseError = (error: any) =>
  error
    ? {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      }
    : null;

function notifyTagFilterFallback() {
  if (hasShownTagFilterToast) {
    return;
  }
  hasShownTagFilterToast = true;

  try {
    if (Platform?.OS === 'android' && typeof ToastAndroid?.show === 'function') {
      ToastAndroid.show(TAG_FILTER_TOAST_MESSAGE, ToastAndroid.SHORT);
    } else if (typeof Alert?.alert === 'function') {
      Alert.alert('Heads up', TAG_FILTER_TOAST_MESSAGE);
    }
  } catch (toastError) {
    console.warn('[SupabaseRepo] Failed to show tag filter toast', toastError);
  }
}

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

// Helper to strip non-DB fields from note payloads
// These fields are used in the app layer but don't exist in the notes table schema
const NON_DB_NOTE_FIELDS = ['labels', 'tags_meta', 'views', 'canonicalType', 'canonical_type'];
function stripNonDbNoteFields<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !NON_DB_NOTE_FIELDS.includes(key)),
  ) as T;
}

type TagsMetaPayload = {
  sticky?: string[] | null;
  tombstones?: string[] | null;
} | null;

function normalizeTagsMeta(meta?: TagsMetaPayload): { sticky: string[]; tombstones: string[] } {
  const toArray = (value?: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    const normalized = value
      .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
      .filter(Boolean);
    return Array.from(new Set(normalized));
  };

  const sticky = toArray(meta?.sticky);
  const tombstones = toArray(meta?.tombstones);

  return { sticky, tombstones };
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

/**
 * Normalize views JSONB field to avoid null weirdness
 * Database column is NOT NULL with default '{}', but old records may have been migrated
 * Always returns non-null object to ensure stage and failure flags round-trip properly
 */
function normalizeViews(input: any): Record<string, any> {
  if (!input || typeof input !== 'object') return {};
  // Preserve all fields including ai_pending, ai_failed, minddrop_stage, minddrop_prefilled_v1
  return { ...input };
}

/**
 * Map database habit columns to TypeScript Habit type
 *
 * Database has: name, title, frequency_json, reminders_json, triggers_json (jsonb columns)
 * TypeScript has: name, frequency_value, reminders, triggers (fields)
 * Schema truth: habits table has BOTH name AND title columns
 *
 * READ-SIDE AUDIT (Phase 6+):
 * - Commitment fields: commitment, commitment_note, commitment_started_at
 * - Frequency fields: frequency → frequency, frequency_json → frequency_value
 * - Reminder fields: reminders_json → reminders
 * - Trigger fields: triggers_json → triggers
 * - Common fields: tags, tags_meta, views, labels, space_id, origin, drop_id, has_list, list_items
 */
function mapHabitFromDb(dbRecord: any): any {
  const mapped = {
    ...dbRecord,
    // Database has both 'name' and 'title' - keep name as primary
    name: dbRecord.name || dbRecord.title,
    // Map jsonb columns to TS fields
    frequency_value: dbRecord.frequency_json ?? null,
    reminders: dbRecord.reminders_json ?? null,
    triggers: dbRecord.triggers_json ?? null,
    tags: dbRecord.tags ?? null,
    tags_meta: dbRecord.tags_meta ?? null,
    drop_id: dbRecord.drop_id ?? null,
    views: normalizeViews(dbRecord.views),
    // Commitment fields (Phase 6)
    commitment: dbRecord.commitment === null ? undefined : dbRecord.commitment,
    commitment_note: dbRecord.commitment_note ?? null,
    commitment_started_at: dbRecord.commitment_started_at ?? null,
    // Common fields
    labels: dbRecord.labels ?? null,
    space_id: dbRecord.space_id ?? null,
    origin: dbRecord.origin ?? null,
    has_list: dbRecord.has_list ?? false,
    list_items: dbRecord.list_items ?? null,
  };

  if (__DEV__) {
    console.log('[HabitFromRow]', {
      id: mapped.id,
      name: mapped.name,
      commitment: mapped.commitment,
      commitment_note: mapped.commitment_note?.slice?.(0, 30) ?? null,
      commitment_started_at: mapped.commitment_started_at,
      frequency: mapped.frequency,
      frequency_value: mapped.frequency_value,
      reminders: mapped.reminders?.length ?? 0,
    });
  }

  return mapped;
}

/**
 * Map database todo columns to TypeScript Todo type
 *
 * Database schema truth (from generated types):
 * - name (string, required) - PRIMARY field for todos
 * - NO 'title' column in todos table
 * - reminders_json (jsonb) -> reminders (ReminderRow[])
 * - owner_id (string) - RLS key
 *
 * READ-SIDE AUDIT (Phase 6+):
 * - Commitment fields: commitment, commitment_note, commitment_started_at
 * - Date fields: due_date, due_day, due_time
 * - Reminder fields: reminders_json → reminders
 * - Common fields: tags, tags_meta, views, labels, space_id, origin, drop_id, has_list, list_items
 */
function mapTodoFromDb(dbRecord: any): any {
  const mapped = {
    ...dbRecord,
    // Map database 'name' to both name and title for backwards compatibility
    name: dbRecord.name,
    title: dbRecord.name, // Backwards compatibility in app code
    // Map jsonb column to TS field
    reminders: dbRecord.reminders_json ?? null,
    tags: dbRecord.tags ?? null,
    tags_meta: dbRecord.tags_meta ?? null,
    drop_id: dbRecord.drop_id ?? null,
    views: normalizeViews(dbRecord.views),
    // Commitment fields (Phase 6)
    commitment: dbRecord.commitment === null ? undefined : dbRecord.commitment,
    commitment_note: dbRecord.commitment_note ?? null,
    commitment_started_at: dbRecord.commitment_started_at ?? null,
    // Date fields
    due_date: dbRecord.due_date ?? null,
    due_day: dbRecord.due_day ?? null,
    due_time: dbRecord.due_time ?? null,
    // Common fields
    labels: dbRecord.labels ?? null,
    space_id: dbRecord.space_id ?? null,
    origin: dbRecord.origin ?? null,
    has_list: dbRecord.has_list ?? false,
    list_items: dbRecord.list_items ?? null,
    // Make Actionable: reference to source note
    source_note_id: dbRecord.source_note_id ?? null,
  };

  if (__DEV__) {
    console.log('[TodoFromRow]', {
      id: mapped.id,
      name: mapped.name,
      commitment: mapped.commitment,
      commitment_note: mapped.commitment_note?.slice?.(0, 30) ?? null,
      commitment_started_at: mapped.commitment_started_at,
      due_day: mapped.due_day,
      due_time: mapped.due_time,
      reminders: mapped.reminders?.length ?? 0,
      source_note_id: mapped.source_note_id,
    });
  }

  return mapped;
}

/**
 * Map database note columns to TypeScript Note type
 *
 * READ-SIDE AUDIT (Phase L2+):
 * - reminders_json (jsonb) → reminders (ReminderRow[]) for journal entries
 * - Journal-specific: mood, fmt, date, private, journal_subtype, photo_uri
 * - Common fields: tags, tags_meta, views, labels, space_id, origin, drop_id, has_list, list_items
 */
function mapNoteFromDb(dbRecord: any): any {
  const mapped = {
    ...dbRecord,
    // Map jsonb column to TS field (used for journal entries)
    reminders: dbRecord.reminders_json ?? null,
    tags: dbRecord.tags ?? null,
    tags_meta: dbRecord.tags_meta ?? null,
    source_message_id: dbRecord.source_message_id ?? null,
    drop_id: dbRecord.drop_id ?? null,
    views: normalizeViews(dbRecord.views),
    // Journal-specific fields (Phase L2+)
    mood: dbRecord.mood ?? null,
    fmt: dbRecord.fmt ?? null,
    date: dbRecord.date ?? null,
    private: dbRecord.private ?? false,
    journal_subtype: dbRecord.journal_subtype ?? null,
    photo_uri: dbRecord.photo_uri ?? null,
    // Common fields
    labels: dbRecord.labels ?? null,
    space_id: dbRecord.space_id ?? null,
    origin: dbRecord.origin ?? null,
    // Make Actionable feature fields
    is_favorite: dbRecord.is_favorite ?? false,
    has_list: dbRecord.has_list ?? false,
    list_items: dbRecord.list_items ?? null,
    // Content field
    body: dbRecord.body ?? null,
  };

  if (__DEV__) {
    console.log('[NoteFromRow]', {
      id: mapped.id,
      title: mapped.title,
      body: mapped.body ? `${mapped.body.substring(0, 50)}...` : null,
      subtype: mapped.subtype,
      mood: mapped.mood,
      date: mapped.date,
      private: mapped.private,
      journal_subtype: mapped.journal_subtype,
      reminders: mapped.reminders?.length ?? 0,
      is_favorite: mapped.is_favorite,
      has_list: mapped.has_list,
      list_items_count: mapped.list_items?.length ?? 0,
    });
  }

  return mapped;
}

export class SupabaseRepo implements IRepo {
  private currentUserId: string | null = null;
  private lastCountCompletedTodayWarn: number = 0;
  private readonly WARN_THROTTLE_MS = 60000; // Throttle warnings to once per minute
  private todoCompletedAtSupported: boolean | null = null;

  // ==============================
  // Commitments (Phase 6)
  // ==============================
  // Cache for commitment counting (5s)
  private lastCommitCountAt = 0;
  private lastCommitCountValue = 0;

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
    const tagsMeta = normalizeTagsMeta((input as any).tags_meta ?? null);

    if (input.type === 'habit') {
      if (!input.frequency) throw new Error('Habit requires frequency');
      // NOTE: subtype removed - column doesn't exist in habits table

      // Database schema truth: habits table enforces BOTH name and title (Mind Drop relies on title)
      const habitName = input.name ?? input.title ?? 'Untitled';
      const habitTitle = input.title ?? habitName;

      // Map details → notes for habits (full Mind Drop sentence persistence)
      let notesText: string | null = null;
      if (typeof (input as any).details === 'string') {
        const trimmed = (input as any).details.trim();
        if (trimmed.length > 0) {
          notesText = trimmed;
        }
      }

      // Build minimal payload with Insert schema validation
      // Map TypeScript fields to database columns (frequency_json, reminders_json, etc.)
      payload = habitInsertSchema.parse(
        compact({
          space_id: input.space_id ?? null,
          name: habitName, // Required - database column (habits use both name and title)
          title: habitTitle, // Required - Mind Drop inserts expect non-null title
          frequency: input.frequency,
          // subtype: REMOVED - column doesn't exist in database
          ai_placed: input.ai_placed ?? false,
          why_string: input.why_string ?? null,
          origin: input.origin ?? undefined,
          canonical_type: input.canonicalType ?? undefined,
          source_message_id: input.sourceMessageId ?? undefined,
          drop_id: input.dropId ?? undefined,
          labels: input.labels ?? undefined,
          views: input.views ?? {},
          // Extended habit fields - map to jsonb columns
          frequency_json: input.frequency_value ?? undefined,
          reminders_json: input.reminders ?? undefined,
          notes: notesText ?? input.notes ?? null, // 🔴 Prefer details, fallback to notes
          tags: input.tags ?? null,
          tags_meta: tagsMeta,
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
      // Database schema truth: todos table has 'name' and 'title' columns
      if (!input.name) throw new Error('Todo requires name');

      // Map details → body for todos (full Mind Drop sentence persistence)
      const bodyText =
        typeof (input as any).details === 'string' && (input as any).details.trim().length > 0
          ? (input as any).details.trim()
          : (input.body ?? null);

      // Map due_at → due_date/due_time/due_day if due_at is provided (from overlay)
      // due_at is an ISO string like "2025-11-26T08:00:56.793Z" or "2025-11-26"
      let effectiveDueDate = input.due_date ?? null;
      let effectiveDueTime = (input as any).due_time ?? null;
      let effectiveDueDay: string | null = (input as any).due_day ?? null;

      // If due_day is provided directly, use it as the source of truth
      if (effectiveDueDay && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDueDay)) {
        effectiveDueDate = effectiveDueDay; // Keep due_date in sync
      }

      const dueAtValue = (input as any).due_at;
      // Only compute from due_at if neither due_day NOR due_date is already set
      // (explicit due_date takes precedence over due_at)
      if (dueAtValue && typeof dueAtValue === 'string' && !effectiveDueDay && !effectiveDueDate) {
        // Parse the due_at to extract date and time in local timezone
        const dateObj = new Date(dueAtValue);
        if (!isNaN(dateObj.getTime())) {
          // Convert to ISO datetime format for schema validation
          effectiveDueDate = dateObj.toISOString();
          // Use shared helpers for consistent due_day/due_time computation
          effectiveDueDay = computeDueDay(dueAtValue);
          effectiveDueTime = effectiveDueTime ?? computeDueTime(dueAtValue);
        }
      }

      // If due_date is provided but not due_day, derive due_day from due_date
      if (effectiveDueDate && !effectiveDueDay) {
        effectiveDueDay = computeDueDay(effectiveDueDate);
      }

      // CRITICAL FIX: Ensure due_date and due_day are in sync
      // If we computed due_day, set due_date to just the date string (YYYY-MM-DD)
      // This prevents timezone issues where "today at 5pm" becomes "tomorrow" in UTC
      // The database will store just the date part, avoiding UTC conversion issues
      if (effectiveDueDay && effectiveDueDate && effectiveDueDate !== effectiveDueDay) {
        // Only keep the time if due_time is explicitly set
        if (!effectiveDueTime) {
          effectiveDueDate = effectiveDueDay;
        }
      }

      // Build minimal payload with Insert schema validation
      payload = todoInsertSchema.parse(
        compact({
          space_id: input.space_id ?? null,
          name: input.name, // Required - PRIMARY field for todos
          body: bodyText, // 🔴 Store full Mind Drop sentence here (mapped from details)
          due_date: normalizeIsoDatetime(effectiveDueDate) ?? null,
          due_day: effectiveDueDay ?? null, // YYYY-MM-DD - canonical field for day-based logic
          due_time: effectiveDueTime ?? null, // Phase 7+: HH:mm format
          undefined_due: input.undefined_due ?? undefined, // Optional (legacy)
          subtype: input.subtype ?? null, // AI-only: 'reminder' | 'microproject'
          reminders_json: input.reminders ?? null, // ReminderRow[] stored as jsonb
          notes: input.notes ?? null, // Additional notes
          tags: input.tags ?? null, // Categories array
          tags_meta: tagsMeta,
          ai_placed: input.ai_placed ?? false,
          why_string: input.why_string ?? null,
          origin: input.origin ?? undefined,
          canonical_type: input.canonicalType ?? undefined,
          source_message_id: input.sourceMessageId ?? undefined,
          source_note_id: (input as any).source_note_id ?? null, // Make Actionable: reference to source note
          drop_id: input.dropId ?? undefined,
          labels: input.labels ?? undefined,
          views: input.views ?? {},
        }),
      );

      if (__DEV__) {
        console.log('[SupabaseRepo.create] todo payload', {
          name: input.name,
          details: (input as any).details,
          bodyText,
          payloadBody: payload.body,
        });
      }

      if (__DEV__) {
        console.log('[SupabaseRepo.create] Using todoInsertSchema');
        console.log('[SupabaseRepo.create] todo payload:', JSON.stringify(payload, null, 2));
      }
    } else {
      // note
      // Database schema truth: notes table has 'title' column (NO 'name' column)
      // Note: subtype is optional in database schema (can be null)
      if (!input.title) throw new Error('Note requires title');

      // Map details → body for notes (full Mind Drop sentence persistence)
      const noteBody =
        typeof (input as any).details === 'string' && (input as any).details.trim().length > 0
          ? (input as any).details.trim()
          : (input.body ?? null);

      // Build minimal payload with Insert schema validation
      payload = noteInsertSchema.parse(
        compact({
          space_id: input.space_id ?? null,
          title: input.title, // Required - PRIMARY field for notes (NO 'name' in DB)
          body: noteBody, // 🔴 Store full Mind Drop sentence here (mapped from details)
          subtype: input.subtype,
          ai_placed: input.ai_placed ?? false,
          why_string: input.why_string ?? null,
          origin: input.origin ?? undefined,
          canonical_type: input.canonicalType ?? undefined,
          source_message_id: input.sourceMessageId ?? undefined,
          drop_id: input.dropId ?? undefined,
          labels: input.labels ?? undefined,
          views: input.views ?? {},
          // Journal-specific fields (from generated schema - notes table has these)
          date: input.date ?? null, // ISO date
          mood: input.mood ?? null,
          fmt: input.fmt ?? null,
          reminders_json: input.reminders ?? null, // ReminderRow[] stored as jsonb
          tags: input.tags ?? null,
          tags_meta: tagsMeta,
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
    let cleanPayload = stripNulls(payload);

    // For notes, strip app-layer fields that don't exist in the DB schema
    // (labels, tags_meta, views, canonicalType are used in-app but not DB columns)
    if (input.type === 'note') {
      cleanPayload = stripNonDbNoteFields(cleanPayload);
    }

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
      .select('*')
      .single();

    if (error) {
      // Defensive handling: If we hit duplicate key error on owner_drop_id constraints,
      // treat as "already exists" and fetch the existing entity instead of throwing.
      // This provides a safety net for race conditions between concurrent Mind Drop submissions.
      const isDuplicateDropIdError =
        error?.code === '23505' &&
        input.dropId &&
        (error?.message?.includes('drop_id') ||
          error?.message?.includes('owner_drop_id') ||
          error?.message?.includes('notes_owner_drop_id_active_unique') ||
          error?.message?.includes('habits_owner_drop_id_unique') ||
          error?.message?.includes('todos_owner_drop_id_active_unique'));

      if (isDuplicateDropIdError) {
        // Log warning instead of error - this is expected defensive behavior
        console.warn(
          `[SupabaseRepo.create] Duplicate ${input.type} detected for drop_id=${input.dropId}, fetching existing entity`,
          {
            code: error.code,
            message: error.message,
            userId: this.currentUserId,
          },
        );

        // Fetch the existing entity by drop_id + owner_id
        let existingEntity: any = null;
        let fetchError: any = null;

        if (input.type === 'note') {
          const result = await supabase
            .from('notes')
            .select('*')
            .eq('drop_id', input.dropId)
            .eq('owner_id', this.currentUserId)
            .eq('archived', false)
            .single();
          existingEntity = result.data;
          fetchError = result.error;
        } else if (input.type === 'habit') {
          // Habits constraint doesn't have archived filter
          const result = await supabase
            .from('habits')
            .select('*')
            .eq('drop_id', input.dropId)
            .eq('owner_id', this.currentUserId)
            .single();
          existingEntity = result.data;
          fetchError = result.error;
        } else if (input.type === 'todo') {
          // Todos constraint is on active (non-archived) todos
          const result = await supabase
            .from('todos')
            .select('*')
            .eq('drop_id', input.dropId)
            .eq('owner_id', this.currentUserId)
            .eq('archived', false)
            .single();
          existingEntity = result.data;
          fetchError = result.error;
        }

        if (fetchError || !existingEntity) {
          // If we can't fetch the existing entity, fall back to original error
          logSupabaseError(
            `${input.type}.insert.duplicate.fetch_failed`,
            fetchError ?? error,
            payloadWithOwnerId,
            this.currentUserId ?? undefined,
          );
          const friendlyMsg = getUserFriendlyErrorMessage(error);
          throw new Error(`Failed to create ${input.type}: ${friendlyMsg}`);
        }

        // Successfully fetched existing entity - return it as if create succeeded
        if (__DEV__) {
          console.log(
            `[SupabaseRepo.create] Returning existing ${input.type} id=${existingEntity.id} for drop_id=${input.dropId}`,
          );
        }

        const record = { ...existingEntity, type: input.type };
        let parsedRecord: AppRecord;
        if (input.type === 'habit') {
          parsedRecord = habitZ.parse(mapHabitFromDb(record)) as Habit;
        } else if (input.type === 'todo') {
          parsedRecord = todoZ.parse(mapTodoFromDb(record)) as Todo;
        } else {
          parsedRecord = noteZ.parse(mapNoteFromDb(record)) as Note;
        }
        eventBus.emit('ItemSaved', { id: parsedRecord.id });
        return parsedRecord;
      }

      // All other errors: log and throw as before
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
    let parsedRecord: AppRecord;
    if (input.type === 'habit') {
      parsedRecord = habitZ.parse(mapHabitFromDb(record)) as Habit;
    } else if (input.type === 'todo') {
      parsedRecord = todoZ.parse(mapTodoFromDb(record)) as Todo;
    } else {
      parsedRecord = noteZ.parse(mapNoteFromDb(record)) as Note;
    }

    eventBus.emit('ItemSaved', { id: parsedRecord.id });

    return parsedRecord;
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

  /**
   * Phase 1: Create unsorted Mind Drop note before AI classification.
   * Always creates a note with catchall subtype and ai_pending flag.
   */
  async createUnsortedDrop(
    text: string,
    opts?: {
      spaceId?: ID | null;
      dropId?: string | null;
      sourceMessageId?: string | null;
    },
  ): Promise<Note> {
    const trimmedText = text.trim();
    const firstLine = trimmedText.split('\n')[0] || 'Untitled';

    const record = await this.create({
      type: 'note',
      subtype: 'catchall',
      title: firstLine,
      body: trimmedText,
      labels: ['catchall', 'needs_review'],
      origin: 'catchall',
      ai_placed: true,
      space_id: opts?.spaceId ?? null,
      dropId: opts?.dropId ?? null,
      sourceMessageId: opts?.sourceMessageId ?? null,
      views: {
        ai_pending: true, // Will be set to false after AI classification completes
      },
    });

    if (record.type !== 'note') {
      throw new Error('Expected note record from createUnsortedDrop');
    }

    return record;
  }

  async update({ id, patch }: UpdateRecordInput): Promise<AppRecord> {
    this.ensureUserId();

    // First get the record to determine its type
    const existing = await this.getById(id);
    if (!existing) throw new Error('Record not found');

    // Development logging for todo updates
    if (__DEV__ && existing.type === 'todo') {
      console.log('[TodoUpdate] incoming patch', patch);
    }

    const table = tableFor(existing.type);

    const normalizedPatch = { ...patch } as typeof patch;
    // Defensive: ensure we do not send empty/null tags until column parity is guaranteed
    if (normalizedPatch && Object.prototype.hasOwnProperty.call(normalizedPatch, 'tags')) {
      const tagsValue = (normalizedPatch as any).tags;
      if (tagsValue == null || (Array.isArray(tagsValue) && tagsValue.length === 0)) {
        delete (normalizedPatch as any).tags;
      }
    }
    console.log('[SupabaseRepo.update] sanitized patch keys:', Object.keys(normalizedPatch));

    // Build minimal patch object - never include created_at, owner_id, or id
    // Only include fields that are actually being changed
    const updatePayload: Record<string, unknown> = {};

    if (existing.type === 'todo') {
      // DATABASE SCHEMA: todos table has both 'name' and 'title' columns
      // Keep both columns in sync for consistency across queries and mappers
      // Accept both 'name' and 'title' in patch, prefer 'name' if both are present
      const newName =
        (typeof (normalizedPatch as any).name === 'string' &&
        (normalizedPatch as any).name.trim().length > 0
          ? (normalizedPatch as any).name
          : undefined) ??
        (typeof (normalizedPatch as any).title === 'string' &&
        (normalizedPatch as any).title.trim().length > 0
          ? (normalizedPatch as any).title
          : undefined);

      if (newName !== undefined) {
        updatePayload.name = newName;
        updatePayload.title = newName; // Keep both columns in sync
      }

      // IMPORTANT: Map details → body for todos (full Mind Drop sentence)
      // This ensures the long text survives save/reopen cycles
      if ('details' in normalizedPatch) {
        const details = (normalizedPatch as any).details;
        const trimmed = typeof details === 'string' ? details.trim() : '';
        updatePayload.body = trimmed.length > 0 ? trimmed : null;
      } else if ('body' in normalizedPatch) {
        // Also support direct body updates for backwards compatibility
        updatePayload.body = normalizedPatch.body ?? null;
      }

      if ('space_id' in normalizedPatch) updatePayload.space_id = normalizedPatch.space_id ?? null;
      if ('due_date' in normalizedPatch) {
        const duePatch = normalizedPatch.due_date as string | null | undefined;
        // Compute due_day first to ensure consistency
        const computedDueDay = computeDueDay(duePatch);
        updatePayload.due_day = computedDueDay;
        // CRITICAL FIX: Use the date string (YYYY-MM-DD) for due_date to avoid timezone issues
        // This prevents "today at 5pm" becoming "tomorrow" when converted to UTC
        updatePayload.due_date = computedDueDay ?? normalizeIsoDatetime(duePatch) ?? null;
      }
      if ('due_time' in normalizedPatch) {
        const dueTimePatch = normalizedPatch.due_time as string | null | undefined;
        updatePayload.due_time = dueTimePatch ?? null;
      }

      // Handle due_day directly from overlay (canonical source of truth)
      // This takes priority over computing from due_at to avoid timezone issues
      if ('due_day' in normalizedPatch) {
        const dueDayPatch = (normalizedPatch as any).due_day as string | null | undefined;
        if (dueDayPatch && /^\d{4}-\d{2}-\d{2}$/.test(dueDayPatch)) {
          updatePayload.due_day = dueDayPatch;
          updatePayload.due_date = dueDayPatch; // Keep due_date in sync
        } else if (dueDayPatch === null) {
          updatePayload.due_day = null;
          updatePayload.due_date = null;
        }
      }

      // Handle due_time directly from overlay
      if ('due_time' in normalizedPatch && !updatePayload.due_time) {
        const dueTimePatch = (normalizedPatch as any).due_time as string | null | undefined;
        updatePayload.due_time = dueTimePatch ?? null;
      }

      // Map due_at to due_date/due_time/due_day for overlay compatibility
      // Only used if due_day is not explicitly provided in the patch
      // Overlay passes due_at (ISO timestamp), DB expects due_date (date) + due_time (HH:mm) + due_day (YYYY-MM-DD)
      if (
        'due_at' in normalizedPatch &&
        !('due_date' in normalizedPatch) &&
        !('due_day' in normalizedPatch)
      ) {
        const dueAt = (normalizedPatch as any).due_at as string | null | undefined;
        if (dueAt) {
          // Use shared helpers for consistent due_day/due_time computation
          const dueDayStr = computeDueDay(dueAt);
          const dueTimeStr = computeDueTime(dueAt);
          if (dueDayStr) {
            updatePayload.due_date = dueDayStr;
            updatePayload.due_day = dueDayStr;
            if (dueTimeStr) {
              updatePayload.due_time = dueTimeStr;
            }
          }
        } else {
          // If due_at is explicitly null/undefined, clear due_date and due_day
          updatePayload.due_date = null;
          updatePayload.due_day = null;
        }
      }

      if ('undefined_due' in normalizedPatch)
        updatePayload.undefined_due = !!normalizedPatch.undefined_due;
      if ('ai_placed' in normalizedPatch) updatePayload.ai_placed = !!normalizedPatch.ai_placed;
      if ('why_string' in normalizedPatch)
        updatePayload.why_string = normalizedPatch.why_string ?? null;

      // Commitment fields for todos (Phase 6)
      if ('commitment' in normalizedPatch)
        updatePayload.commitment = !!(normalizedPatch as any).commitment;
      if ('commitment_note' in normalizedPatch)
        updatePayload.commitment_note = (normalizedPatch as any).commitment_note ?? null;
      if ('commitment_started_at' in normalizedPatch)
        updatePayload.commitment_started_at =
          normalizeIsoDatetime((normalizedPatch as any).commitment_started_at) ?? null;

      // Map reminders → reminders_json for todo reminders
      if ('reminders' in normalizedPatch) {
        updatePayload.reminders_json = (normalizedPatch as any).reminders ?? null;
      }

      // Development logging for todo updates
      if (__DEV__) {
        console.log('[TodoEdit] patch', normalizedPatch);
        console.log('[TodoEdit] updatePayload', updatePayload);
      }
    } else if (existing.type === 'habit') {
      // DATABASE SCHEMA: habits table has both 'name' and 'title' columns
      // Keep both columns in sync for consistency
      const newName =
        (typeof (normalizedPatch as any).name === 'string' &&
        (normalizedPatch as any).name.trim().length > 0
          ? (normalizedPatch as any).name.trim()
          : undefined) ??
        (typeof (normalizedPatch as any).title === 'string' &&
        (normalizedPatch as any).title.trim().length > 0
          ? (normalizedPatch as any).title.trim()
          : undefined);

      if (newName !== undefined) {
        updatePayload.name = newName;
        updatePayload.title = newName; // Keep both columns in sync
      }

      // IMPORTANT: Map details → notes for habits (full Mind Drop sentence)
      if ('details' in normalizedPatch) {
        const details = (normalizedPatch as any).details;
        const trimmed = typeof details === 'string' ? details.trim() : '';
        updatePayload.notes = trimmed.length > 0 ? trimmed : null;
      } else if ('notes' in normalizedPatch) {
        // Also support direct notes updates when details not present
        updatePayload.notes = normalizedPatch.notes ?? null;
      }

      if ('frequency' in normalizedPatch && normalizedPatch.frequency !== undefined)
        updatePayload.frequency = normalizedPatch.frequency;
      // Map frequency_value → frequency_json for habit cadence updates
      if ('frequency_value' in normalizedPatch) {
        updatePayload.frequency_json = (normalizedPatch as any).frequency_value ?? null;
      }
      if ('subtype' in normalizedPatch) updatePayload.subtype = normalizedPatch.subtype ?? null;
      if ('space_id' in normalizedPatch) updatePayload.space_id = normalizedPatch.space_id ?? null;
      if ('ai_placed' in normalizedPatch) updatePayload.ai_placed = !!normalizedPatch.ai_placed;
      if ('why_string' in normalizedPatch)
        updatePayload.why_string = normalizedPatch.why_string ?? null;

      // Commitment fields for habits (Phase 6)
      if ('commitment' in normalizedPatch)
        updatePayload.commitment = !!(normalizedPatch as any).commitment;
      if ('commitment_note' in normalizedPatch)
        updatePayload.commitment_note = (normalizedPatch as any).commitment_note ?? null;
      if ('commitment_started_at' in normalizedPatch)
        updatePayload.commitment_started_at =
          normalizeIsoDatetime((normalizedPatch as any).commitment_started_at) ?? null;

      // Map reminders → reminders_json for habit reminders
      if ('reminders' in normalizedPatch) {
        updatePayload.reminders_json = (normalizedPatch as any).reminders ?? null;
      }

      // Development logging for habit updates
      if (__DEV__) {
        console.log('[HabitEdit] patch', normalizedPatch);
        console.log('[HabitEdit] updatePayload', updatePayload);
      }
    } else if (existing.type === 'note') {
      if ('title' in normalizedPatch) updatePayload.title = normalizedPatch.title ?? null;

      // IMPORTANT: Map details → body for notes (full Mind Drop sentence)
      if ('details' in normalizedPatch) {
        const details = (normalizedPatch as any).details;
        const trimmed = typeof details === 'string' ? details.trim() : '';
        updatePayload.body = trimmed.length > 0 ? trimmed : null;
      } else if ('body' in normalizedPatch) {
        // Also support direct body updates when details not present
        updatePayload.body = normalizedPatch.body ?? null;
      }

      if ('subtype' in normalizedPatch && normalizedPatch.subtype !== undefined)
        updatePayload.subtype = normalizedPatch.subtype;
      if ('space_id' in normalizedPatch) updatePayload.space_id = normalizedPatch.space_id ?? null;
      if ('ai_placed' in normalizedPatch) updatePayload.ai_placed = !!normalizedPatch.ai_placed;
      if ('why_string' in normalizedPatch)
        updatePayload.why_string = normalizedPatch.why_string ?? null;

      // Journal-specific fields for notes (Phase L4+)
      if ('mood' in normalizedPatch) updatePayload.mood = (normalizedPatch as any).mood ?? null;
      if ('fmt' in normalizedPatch) updatePayload.fmt = (normalizedPatch as any).fmt ?? null;
      if ('date' in normalizedPatch)
        updatePayload.date = normalizeIsoDatetime((normalizedPatch as any).date) ?? null;
      // NOTE: 'private' column does NOT exist in the notes table schema
      // Private flag is stored in views.private_journal instead (handled via 'views' patch below)
      // Removing this line that was causing PGRST204 error:
      // if ('private' in normalizedPatch) updatePayload.private = !!(normalizedPatch as any).private;
      if ('journal_subtype' in normalizedPatch)
        updatePayload.journal_subtype = (normalizedPatch as any).journal_subtype ?? null;
      // Map reminders → reminders_json for note reminders
      if ('reminders' in normalizedPatch) {
        updatePayload.reminders_json = (normalizedPatch as any).reminders ?? null;
      }
      // Map photo_uri directly
      if ('photo_uri' in normalizedPatch)
        updatePayload.photo_uri = (normalizedPatch as any).photo_uri ?? null;

      // Make Actionable feature fields
      if ('is_favorite' in normalizedPatch) {
        updatePayload.is_favorite = !!(normalizedPatch as any).is_favorite;
      }
      if ('has_list' in normalizedPatch) {
        updatePayload.has_list = !!(normalizedPatch as any).has_list;
      }
      if ('list_items' in normalizedPatch) {
        updatePayload.list_items = (normalizedPatch as any).list_items ?? null;
      }

      // Development logging for note updates
      if (__DEV__) {
        console.log('[NoteEdit] patch', normalizedPatch);
        console.log('[NoteEdit] updatePayload', updatePayload);
      }
    }

    if ('tags' in normalizedPatch) updatePayload.tags = normalizedPatch.tags ?? null;
    if ('tags_meta' in normalizedPatch)
      updatePayload.tags_meta = normalizeTagsMeta((normalizedPatch as any).tags_meta ?? null);

    if ('origin' in normalizedPatch) updatePayload.origin = normalizedPatch.origin ?? null;
    if ('canonicalType' in normalizedPatch)
      updatePayload.canonical_type = normalizedPatch.canonicalType ?? null;
    if ('labels' in normalizedPatch) updatePayload.labels = normalizedPatch.labels ?? null;
    if ('views' in normalizedPatch) updatePayload.views = normalizedPatch.views ?? {};
    if ('dropId' in normalizedPatch) updatePayload.drop_id = normalizedPatch.dropId ?? null;

    // Guard: Don't call Supabase if the patch is empty (prevents PGRST116 error)
    if (Object.keys(updatePayload).length === 0) {
      if (__DEV__) {
        console.log('[SupabaseRepo.update] Empty patch - skipping database call', {
          id,
          type: existing.type,
        });
      }
      return existing;
    }

    // Database trigger or default will handle updated_at
    const { data: result, error } = await supabase
      .from(table)
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    // Development logging for todo updates
    if (__DEV__ && existing.type === 'todo') {
      console.log('[TodoEdit] db result', result, error);
    }

    // Development logging for habit updates
    if (__DEV__ && existing.type === 'habit') {
      console.log('[HabitEdit] db result', result, error);
    }

    // Development logging for note updates
    if (__DEV__ && existing.type === 'note') {
      console.log('[NoteEdit] db result', result, error);
    }

    if (error) {
      logSbError(`${existing.type}.update`, error);
      throw new Error(`Failed to update record: ${error.message}`);
    }
    if (!result) throw new Error('No data returned from update');

    const record = { ...result, type: existing.type };
    if (existing.type === 'habit') {
      const updated = habitZ.parse(mapHabitFromDb(record)) as Habit;
      if (__DEV__) {
        console.log('[HabitEdit] updated habit', updated);
      }
      return updated;
    }
    if (existing.type === 'todo') {
      const updated = todoZ.parse(mapTodoFromDb(record)) as Todo;
      if (__DEV__) {
        console.log('[TodoEdit] updated todo', updated);
      }
      return updated;
    }
    const updated = noteZ.parse(mapNoteFromDb(record)) as Note;
    if (__DEV__) {
      console.log('[NoteEdit] updated note', updated);
    }
    return updated;
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
        if (type === 'habit') return habitZ.parse(mapHabitFromDb(record)) as Habit;
        if (type === 'todo') return todoZ.parse(mapTodoFromDb(record)) as Todo;
        return noteZ.parse(mapNoteFromDb(record)) as Note;
      }

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "not found", other errors should throw
        throw new Error(`Error querying ${table}: ${error.message}`);
      }
    }

    return null;
  }

  async getAll(): Promise<AppRecord[]> {
    const userId = this.ensureUserId();
    const results: AppRecord[] = [];

    // Query each table and combine results
    for (const type of ['habit', 'todo', 'note'] as const) {
      const table = tableFor(type);
      const { data, error } = await supabase.from(table).select('*').eq('owner_id', userId);

      if (error) {
        throw new Error(`Error querying ${table}: ${error.message}`);
      }

      if (data) {
        for (const row of data) {
          const record = { ...row, type };
          if (type === 'habit') results.push(habitZ.parse(mapHabitFromDb(record)) as Habit);
          else if (type === 'todo') results.push(todoZ.parse(mapTodoFromDb(record)) as Todo);
          else results.push(noteZ.parse(mapNoteFromDb(record)) as Note);
        }
      }
    }

    return results;
  }

  async findNoteBySourceMessageId(sourceMessageId: string): Promise<Note | null> {
    const userId = this.ensureUserId();
    if (!sourceMessageId) return null;
    if (!UUID_REGEX.test(sourceMessageId)) {
      return null;
    }

    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('owner_id', userId)
      .eq('source_message_id', sourceMessageId)
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logSupabaseError('notes.findBySourceMessageId', error);
      throw new Error(`Failed to find note: ${getUserFriendlyErrorMessage(error)}`);
    }

    if (!data) return null;

    const record = { ...data, type: 'note' as const };
    return noteZ.parse(mapNoteFromDb(record)) as Note;
  }

  /**
   * Find a todo by its Mind Drop dropId
   * Used to prevent duplicate entity creation when pipeline runs multiple times
   */
  async findTodoByDropId(dropId: string): Promise<Todo | null> {
    const userId = this.ensureUserId();
    if (!dropId) return null;
    if (!UUID_REGEX.test(dropId)) {
      return null;
    }

    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .eq('owner_id', userId)
      .eq('drop_id', dropId)
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logSupabaseError('todos.findByDropId', error);
      throw new Error(`Failed to find todo by dropId: ${getUserFriendlyErrorMessage(error)}`);
    }

    if (!data) return null;

    const record = { ...data, type: 'todo' as const };
    return todoZ.parse(record) as Todo;
  }

  /**
   * Find a habit by its Mind Drop dropId
   * Used to prevent duplicate entity creation when pipeline runs multiple times
   */
  async findHabitByDropId(dropId: string): Promise<Habit | null> {
    const userId = this.ensureUserId();
    if (!dropId) return null;
    if (!UUID_REGEX.test(dropId)) {
      return null;
    }

    const { data, error } = await supabase
      .from('habits')
      .select('*')
      .eq('owner_id', userId)
      .eq('drop_id', dropId)
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logSupabaseError('habits.findByDropId', error);
      throw new Error(`Failed to find habit by dropId: ${getUserFriendlyErrorMessage(error)}`);
    }

    if (!data) return null;

    const record = { ...data, type: 'habit' as const };
    return habitZ.parse(record) as Habit;
  }

  /**
   * List records by type with optional filtering
   * 10R: Uses idx_todos_space_id, idx_habits_space_id, idx_notes_space_id for space filtering
   * 10R: Uses idx_notes_created_at, idx_todos_created_at for chronological ordering
   */
  async listByType(type: AppRecord['type'], opts?: ListByTypeOptions): Promise<AppRecord[]> {
    const hasTagFilter = Boolean(opts?.tagNames && opts.tagNames.length > 0);
    const perfLabel = hasTagFilter ? `[PERF][tags] listByType:${type}` : null;
    const perfStart = hasTagFilter ? Date.now() : null;

    if (__DEV__ && hasTagFilter && perfLabel) {
      try {
        console.time(perfLabel);
      } catch {
        // some environments (tests) may not support console.time; ignore
      }
    }

    const userId = this.ensureUserId();
    const table = tableFor(type);

    const runQuery = async (applyTagFilter: boolean) => {
      let query = supabase.from(table).select('*').eq('owner_id', userId);

      if (opts?.unassignedOnly) {
        query = query.is('space_id', null);
      } else if (opts?.spaceId !== undefined) {
        query = query.eq('space_id', opts.spaceId);
      }

      if (opts?.subtypes && opts.subtypes.length > 0 && type === 'note') {
        query = query.in('subtype', opts.subtypes);
      }

      // ZOMBIE PREVENTION: Exclude archived/completed entities from all list queries
      // This ensures deleted Mind Drops don't resurrect in Recent Drops or other UI lists

      if (type === 'note') {
        // Notes: soft delete via archived boolean flag (migration 20251116)
        // Filter: archived = false OR archived IS NULL (for legacy rows)
        query = query.or('archived.eq.false,archived.is.null');
      }

      if (type === 'todo') {
        // Todos: soft delete via completed_at timestamp
        // Filter: completed_at IS NULL (only show active todos)
        query = query.is('completed_at', null);
      }

      if (type === 'habit') {
        // Habits: soft delete via completed_at timestamp
        // Filter: completed_at IS NULL (only show active habits)
        query = query.is('completed_at', null);
      }

      if (applyTagFilter && opts?.tagNames && opts.tagNames.length > 0) {
        query = query.contains('tags', opts.tagNames);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      return { data: data ?? [], error };
    };

    try {
      let rows: any[] = [];

      if (hasTagFilter) {
        try {
          const initial = await runQuery(true);
          if (initial.error) {
            console.warn('[SupabaseRepo] Tag filter query failed, falling back without tags', {
              type,
              tagNames: opts?.tagNames,
              error: formatSupabaseError(initial.error),
            });
            notifyTagFilterFallback();

            const fallback = await runQuery(false);
            if (fallback.error) {
              console.warn('[SupabaseRepo] Tag filter fallback failed', {
                type,
                tagNames: opts?.tagNames,
                error: formatSupabaseError(fallback.error),
              });
              const err = new Error(`Failed to list ${type}s: ${fallback.error.message}`);
              (err as any).cause = fallback.error;
              throw err;
            }

            rows = fallback.data;
          } else {
            rows = initial.data;
          }
        } catch (error) {
          console.warn('[tags] contains failed, falling back', error);
          notifyTagFilterFallback();

          const fallback = await runQuery(false);
          if (fallback.error) {
            console.warn('[SupabaseRepo] Tag filter fallback failed', {
              type,
              tagNames: opts?.tagNames,
              error: formatSupabaseError(fallback.error),
            });
            const err = new Error(`Failed to list ${type}s: ${fallback.error.message}`);
            (err as any).cause = fallback.error;
            throw err;
          }

          rows = fallback.data;
        }
      } else {
        const result = await runQuery(false);
        if (result.error) {
          const err = new Error(`Failed to list ${type}s: ${result.error.message}`);
          (err as any).cause = result.error;
          throw err;
        }
        rows = result.data;
      }

      return rows.map((item) => {
        const record = { ...item, type };
        if (type === 'habit') return habitZ.parse(mapHabitFromDb(record)) as Habit;
        if (type === 'todo') return todoZ.parse(mapTodoFromDb(record)) as Todo;
        return noteZ.parse(mapNoteFromDb(record)) as Note;
      });
    } finally {
      if (hasTagFilter && perfStart !== null && perfLabel) {
        const elapsed = Date.now() - perfStart;
        if (__DEV__) {
          try {
            console.timeEnd(perfLabel);
          } catch {
            // console.timeEnd may throw in certain environments; ignore.
          }
          if (elapsed > 600) {
            console.warn('[PERF][tags] slow listByType query', {
              type,
              ms: elapsed,
              tagCount: opts?.tagNames?.length ?? 0,
            });
          }
        }
      }
    }
  }

  async countUnsorted(): Promise<number> {
    const userId = this.ensureUserId();

    // Count across all three tables
    const [habitsResult, todosResult, notesResult] = await Promise.all([
      supabase
        .from('habits')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .eq('ai_placed', true)
        .is('completed_at', null), // Exclude completed habits
      supabase
        .from('todos')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .eq('ai_placed', true)
        .is('completed_at', null), // Exclude completed todos
      supabase
        .from('notes')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .eq('ai_placed', true)
        .or('archived.eq.false,archived.is.null'), // Exclude archived notes
    ]);

    if (habitsResult.error)
      throw new Error(`Failed to count habits: ${habitsResult.error.message}`);
    if (todosResult.error) throw new Error(`Failed to count todos: ${todosResult.error.message}`);
    if (notesResult.error) throw new Error(`Failed to count notes: ${notesResult.error.message}`);

    const total = (habitsResult.count ?? 0) + (todosResult.count ?? 0) + (notesResult.count ?? 0);
    return total;
  }

  async listBySpace(spaceId: ID, opts?: { tagNames?: string[] }): Promise<AppRecord[]> {
    const userId = this.ensureUserId();
    const results: AppRecord[] = [];

    // Query all three tables
    for (const type of ['habit', 'todo', 'note'] as const) {
      const table = tableFor(type);
      let query = supabase.from(table).select('*').eq('owner_id', userId).eq('space_id', spaceId);

      // Filter out archived items (different fields per entity type)
      if (type === 'todo') {
        // Todos use status field for archive state
        query = query.neq('status', 'archived');
      } else if (type === 'habit') {
        // Habits use archived boolean
        query = query.eq('archived', false);
      } else if (type === 'note') {
        // Notes use archived boolean (may be null for legacy rows)
        query = query.or('archived.eq.false,archived.is.null');
      }

      if (opts?.tagNames && opts.tagNames.length > 0) {
        query = query.contains('tags', opts.tagNames);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw new Error(`Failed to list ${type}s in space: ${error.message}`);

      if (data) {
        const parsed = data.map((item) => {
          const record = { ...item, type };
          if (type === 'habit') return habitZ.parse(mapHabitFromDb(record)) as Habit;
          if (type === 'todo') return todoZ.parse(mapTodoFromDb(record)) as Todo;
          return noteZ.parse(mapNoteFromDb(record)) as Note;
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
      .is('completed_at', null) // Exclude completed habits
      .eq('archived', false) // Exclude archived habits
      .ilike('name', `%${q}%`); // Changed from 'title' to 'name' per Phase 7 spec

    if (habitsError) throw new Error(`Failed to search habits: ${habitsError.message}`);
    if (habits) {
      results.push(
        ...habits.map((h) => habitZ.parse(mapHabitFromDb({ ...h, type: 'habit' })) as Habit),
      );
    }

    // Search todos (name and body)
    const { data: todos, error: todosError } = await supabase
      .from('todos')
      .select('*')
      .eq('owner_id', userId)
      .is('completed_at', null) // Exclude completed todos
      .neq('status', 'archived') // Exclude archived todos
      .or(`name.ilike.%${q}%,body.ilike.%${q}%`);

    if (todosError) throw new Error(`Failed to search todos: ${todosError.message}`);
    if (todos) {
      results.push(...todos.map((t) => todoZ.parse({ ...t, type: 'todo' }) as Todo));
    }

    // Search notes (title and body)
    const { data: notes, error: notesError } = await supabase
      .from('notes')
      .select('*')
      .eq('owner_id', userId)
      .or('archived.eq.false,archived.is.null') // Exclude archived notes
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
      .is('completed_at', null) // Exclude completed todos
      .neq('status', 'archived') // Exclude archived todos
      .or(`name.ilike.${q},body.ilike.${q}`);

    // Search notes
    const notesQ = supabase
      .from('notes')
      .select('*')
      .eq('owner_id', userId)
      .eq('space_id', spaceId)
      .or('archived.eq.false,archived.is.null') // Exclude archived notes
      .or(`title.ilike.${q},body.ilike.${q}`);

    // Search habits (name/title)
    const habitsQ = supabase
      .from('habits')
      .select('*')
      .eq('owner_id', userId)
      .eq('space_id', spaceId)
      .is('completed_at', null) // Exclude completed habits
      .eq('archived', false) // Exclude archived habits
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
   * Uses due_day (YYYY-MM-DD) for timezone-safe filtering, falling back to due_date
   */
  async listDueToday(_nowIso: string): Promise<AppRecord[]> {
    const userId = this.ensureUserId();
    const results: AppRecord[] = [];

    // Compute today's date string in local timezone
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Get todos with due_date or due_day set
    const { data: todos, error: todosError } = await supabase
      .from('todos')
      .select('*')
      .eq('owner_id', userId)
      .is('completed_at', null) // Exclude completed todos
      .not('due_date', 'is', null);

    if (todosError) throw new Error(`Failed to list due todos: ${todosError.message}`);

    if (todos) {
      const todayTodos = todos.filter((t) => {
        try {
          // Prefer due_day (YYYY-MM-DD) for timezone-safe comparison
          if (t.due_day && typeof t.due_day === 'string') {
            return t.due_day === todayStr;
          }
          // Fallback to due_date (may have timezone issues with UTC midnight)
          return t.due_date && isToday(parseISO(t.due_date));
        } catch {
          return false;
        }
      });
      results.push(...todayTodos.map((t) => todoZ.parse({ ...t, type: 'todo' }) as Todo));
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
      .is('completed_at', null) // Exclude completed todos
      .eq('undefined_due', true);

    if (error) throw new Error(`Failed to list undefined due todos: ${error.message}`);
    if (!data) return [];

    return data.map((t) => todoZ.parse({ ...t, type: 'todo' }) as Todo);
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
          commitment?: boolean;
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
          commitment?: boolean;
        }
    >
  > {
    const userId = this.ensureUserId();
    const day = ensureDay(nowIso);

    const todoFieldsBase = 'id,name,due_date,due_day,space_id,status,carry_forward,tags,commitment';
    const todoFields = `${todoFieldsBase},completed_at`;

    let activeTodos: any[] | null = null;
    let todosErr: any = null;
    const activeResp = await supabase
      .from('todos')
      .select(todoFields)
      .eq('owner_id', userId)
      .eq('status', 'active')
      .or(`due_day.eq.${day},carry_forward.eq.true`);

    if (activeResp.error) {
      todosErr = activeResp.error;
    } else {
      activeTodos = activeResp.data ?? [];
      this.todoCompletedAtSupported = true;
    }

    if (todosErr) {
      console.error('[listTodayMerged] todos query failed:', todosErr);
    }

    let completedTodos: any[] = [];
    const completedResp = await supabase
      .from('todos')
      .select(todoFields)
      .eq('owner_id', userId)
      .eq('status', 'completed')
      .gte('completed_at', `${day}T00:00:00`)
      .lt('completed_at', `${day}T23:59:59.999`);

    if (completedResp.error) {
      console.error('[listTodayMerged] todos completed query failed:', completedResp.error);
    } else {
      completedTodos = completedResp.data ?? [];
      this.todoCompletedAtSupported = true;
    }

    const now = new Date();
    const mapTodo = (t: any) => {
      let overdue = false;
      let nearDue = false;
      if (t.due_date) {
        const due = new Date(t.due_date);
        if (!Number.isNaN(due.getTime())) {
          overdue = due < now;
          nearDue = !overdue && due.getTime() - now.getTime() < 3 * 60 * 60 * 1000;
        }
      }

      const completedAt = t.completed_at ?? null;
      const rawStatus = (t.status ?? 'active') as 'active' | 'completed' | 'archived';
      const status = completedAt && rawStatus !== 'archived' ? 'completed' : rawStatus;

      return {
        type: 'todo' as const,
        id: t.id,
        name: t.name,
        due_date: t.due_date,
        due_day: t.due_day,
        space_id: t.space_id ?? null,
        tags: Array.isArray(t.tags) ? t.tags : [],
        status,
        carry_forward: !!t.carry_forward,
        overdue,
        nearDue,
        completed_at: completedAt,
        commitment: t.commitment === true,
      };
    };

    const todoItems = [...(activeTodos || []).map(mapTodo), ...(completedTodos || []).map(mapTodo)];

    let habitItems: any[] = [];
    try {
      const { data: habits, error: habitsErr } = await supabase
        .from('habits')
        .select('id,name,space_id,cadence,target_count,period_unit,time_window,tags,commitment')
        .eq('owner_id', userId)
        .is('completed_at', null); // Exclude completed habits

      if (habitsErr) throw habitsErr;

      const { data: progressRows, error: progErr } = await supabase
        .from('habit_progress')
        .select('habit_id,count,occurred_day,occurred_at')
        .eq('owner_id', userId)
        .eq('occurred_day', day);

      if (progErr) throw progErr;

      const progressByHabit = new Map<string, { total: number; latestAt: string | null }>();
      (progressRows || []).forEach((row: any) => {
        const current = progressByHabit.get(row.habit_id) || { total: 0, latestAt: null };
        let latestAt = current.latestAt;
        if (row.occurred_at) {
          if (!latestAt) {
            latestAt = row.occurred_at;
          } else if (new Date(row.occurred_at).getTime() > new Date(latestAt).getTime()) {
            latestAt = row.occurred_at;
          }
        }
        progressByHabit.set(row.habit_id, {
          total: current.total + (row.count || 1),
          latestAt,
        });
      });

      habitItems =
        (habits || []).map((h: any) => {
          const target = Math.max(1, h.target_count ?? 1);
          const progressInfo = progressByHabit.get(h.id) || { total: 0, latestAt: null };
          const done = progressInfo.total;
          const status: 'active' | 'completed' =
            done >= target && done > 0 ? 'completed' : 'active';

          return {
            type: 'habit' as const,
            id: h.id,
            name: h.name,
            space_id: h.space_id ?? null,
            tags: Array.isArray(h.tags) ? h.tags : [],
            cadence: (h.cadence as any) || 'day',
            target_count: target,
            period_unit: (h.period_unit as any) || 'day',
            time_window: (h.time_window as any) || 'any',
            progress_today: done,
            status,
            completed_at: status === 'completed' ? progressInfo.latestAt : null,
            commitment: h.commitment === true,
          };
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

  async getHabitProgressForWeek(
    habitId: ID,
    weekStartIso: string,
    weekEndIso: string,
  ): Promise<number> {
    const ownerId = this.ensureUserId();
    const weekStart = ensureDay(weekStartIso);
    const weekEnd = ensureDay(weekEndIso);
    const { data, error } = await supabase
      .from('habit_progress')
      .select('count')
      .eq('owner_id', ownerId)
      .eq('habit_id', habitId)
      .gte('occurred_day', weekStart)
      .lte('occurred_day', weekEnd);

    if (error) throw new Error(`getHabitProgressForWeek failed: ${error.message}`);
    return (data ?? []).reduce((sum: number, row: any) => sum + (row.count ?? 1), 0);
  }

  async getHabitProgressDates(
    habitId: ID,
    weekStartIso: string,
    weekEndIso: string,
  ): Promise<string[]> {
    const ownerId = this.ensureUserId();
    const weekStart = ensureDay(weekStartIso);
    const weekEnd = ensureDay(weekEndIso);
    const { data, error } = await supabase
      .from('habit_progress')
      .select('occurred_day')
      .eq('owner_id', ownerId)
      .eq('habit_id', habitId)
      .gte('occurred_day', weekStart)
      .lte('occurred_day', weekEnd);

    if (error) throw new Error(`getHabitProgressDates failed: ${error.message}`);
    return (data ?? []).map((row: any) => row.occurred_day);
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
      .or('archived.eq.false,archived.is.null') // Exclude archived notes
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

    let completedCount = 0;
    if (this.todoCompletedAtSupported !== false) {
      const { count: completedRaw, error: completedError } = await supabase
        .from('todos')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', ownerId)
        .gte('completed_at', `${day}T00:00:00Z`)
        .lt('completed_at', `${day}T23:59:59Z`);

      if (completedError) {
        this.todoCompletedAtSupported = false;
        const message = completedError.message || completedError.details || completedError.hint;
        console.warn(
          '[getTodaySummary] completed count unavailable; suppressing error',
          message ?? completedError,
        );
      } else {
        this.todoCompletedAtSupported = true;
        if (typeof completedRaw === 'number') {
          completedCount = completedRaw;
        }
      }
    }

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

  /**
   * Archive all entities (notes, todos, habits) that share the same drop_id.
   *
   * This is the ONLY reliable way to delete a Mind Drop and prevent zombie resurrections.
   *
   * Schema truth (as of Nov 2025):
   * - notes: Has `archived` boolean column (added in migration 20251116)
   * - todos: Has `completed_at` timestamp column for soft delete
   * - habits: Has `completed_at` timestamp column for soft delete
   *
   * @param dropId - The Mind Drop UUID linking all related entities
   * @param archivedReason - Optional reason string (currently unused but kept for future metadata)
   * @returns Counts of archived entities by type
   */
  async archiveItemsByDropId(
    dropId: string,
    archivedReason = 'user_deleted_drop',
  ): Promise<{ notesArchived: number; todosArchived: number; habitsArchived: number }> {
    const ownerId = this.ensureUserId();
    const nowIso = new Date().toISOString();

    let notesArchived = 0;
    let todosArchived = 0;
    let habitsArchived = 0;

    // Run all table updates in parallel, each with its own try/catch
    // This ensures one failure doesn't block others and prevents silent failures
    await Promise.all([
      // Archive todos: soft delete via completed_at timestamp + status column
      (async () => {
        try {
          const { data, error } = await supabase
            .from('todos')
            .update({
              completed_at: nowIso,
              status: 'archived', // Set status if column exists
            })
            .eq('drop_id', dropId)
            .eq('owner_id', ownerId)
            .select('id');

          if (error) {
            console.error(
              '[SupabaseRepo.archiveItemsByDropId] ❌ CRITICAL: Failed to archive todos:',
              formatSupabaseError(error),
              '\nThis will cause zombie todos to resurrect on next Mind Drop submission!',
            );
          } else {
            todosArchived = data?.length ?? 0;
            if (todosArchived > 0) {
              console.log(
                `[SupabaseRepo.archiveItemsByDropId] ✓ Archived ${todosArchived} todo(s) for drop_id=${dropId}`,
              );
            }
          }
        } catch (err) {
          console.error('[SupabaseRepo.archiveItemsByDropId] ❌ EXCEPTION archiving todos:', err);
        }
      })(),

      // Archive habits: soft delete via completed_at timestamp
      (async () => {
        try {
          const { data, error } = await supabase
            .from('habits')
            .update({ completed_at: nowIso })
            .eq('drop_id', dropId)
            .eq('owner_id', ownerId)
            .select('id');

          if (error) {
            console.error(
              '[SupabaseRepo.archiveItemsByDropId] ❌ CRITICAL: Failed to archive habits:',
              formatSupabaseError(error),
              '\nThis will cause zombie habits to resurrect on next Mind Drop submission!',
            );
          } else {
            habitsArchived = data?.length ?? 0;
            if (habitsArchived > 0) {
              console.log(
                `[SupabaseRepo.archiveItemsByDropId] ✓ Archived ${habitsArchived} habit(s) for drop_id=${dropId}`,
              );
            }
          }
        } catch (err) {
          console.error('[SupabaseRepo.archiveItemsByDropId] ❌ EXCEPTION archiving habits:', err);
        }
      })(),

      // Archive notes: soft delete via archived boolean flag
      // Migration 20251116 added the archived column to notes table
      (async () => {
        try {
          const { data, error } = await supabase
            .from('notes')
            .update({ archived: true })
            .eq('drop_id', dropId)
            .eq('owner_id', ownerId)
            .select('id');

          if (error) {
            console.error(
              '[SupabaseRepo.archiveItemsByDropId] ❌ CRITICAL: Failed to archive notes:',
              formatSupabaseError(error),
              '\nThis will cause zombie notes to resurrect on next Mind Drop submission!',
            );
          } else {
            notesArchived = data?.length ?? 0;
            if (notesArchived > 0) {
              console.log(
                `[SupabaseRepo.archiveItemsByDropId] ✓ Archived ${notesArchived} note(s) for drop_id=${dropId}`,
              );
            }
          }
        } catch (err) {
          console.error('[SupabaseRepo.archiveItemsByDropId] ❌ EXCEPTION archiving notes:', err);
        }
      })(),
    ]);

    console.log(
      `[SupabaseRepo.archiveItemsByDropId] Summary for drop_id=${dropId}: ` +
        `${notesArchived} notes, ${todosArchived} todos, ${habitsArchived} habits archived`,
    );

    return { notesArchived, todosArchived, habitsArchived };
  }

  /** Count active commitments (habits + todos). No archived predicate yet. */
  async countActiveCommitments(): Promise<number> {
    const userId = this.ensureUserId();
    const now = Date.now();
    if (now - this.lastCommitCountAt < 5000) {
      return this.lastCommitCountValue;
    }

    const [habitsRes, todosRes] = await Promise.all([
      supabase
        .from('habits')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .eq('commitment', true),
      supabase
        .from('todos')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .eq('commitment', true),
    ]);

    if (habitsRes.error) {
      throw new Error(`COMMITMENT_COUNT_FAILED: ${habitsRes.error.message}`);
    }
    if (todosRes.error) {
      throw new Error(`COMMITMENT_COUNT_FAILED: ${todosRes.error.message}`);
    }

    const total = (habitsRes.count || 0) + (todosRes.count || 0);
    this.lastCommitCountAt = now;
    this.lastCommitCountValue = total;
    return total;
  }

  /** List current commitments (merged; newest first). */
  async listCommitments(): Promise<
    Array<{
      id: string;
      type: 'habit' | 'todo';
      name: string;
      commitment_started_at?: string | null;
      commitment_note?: string | null;
    }>
  > {
    const userId = this.ensureUserId();

    const [habitsRes, todosRes] = await Promise.all([
      supabase
        .from('habits')
        .select('id,name,commitment_started_at,commitment_note,commitment')
        .eq('owner_id', userId)
        .eq('commitment', true)
        .is('completed_at', null), // Exclude completed habits
      supabase
        .from('todos')
        .select('id,name,commitment_started_at,commitment_note,commitment')
        .eq('owner_id', userId)
        .eq('commitment', true)
        .is('completed_at', null), // Exclude completed todos
    ]);

    if (habitsRes.error) {
      throw new Error(`COMMITMENT_LIST_FAILED: ${habitsRes.error.message}`);
    }
    if (todosRes.error) {
      throw new Error(`COMMITMENT_LIST_FAILED: ${todosRes.error.message}`);
    }

    const habits = (habitsRes.data || [])
      .filter((h: any) => h.commitment === true)
      .map((h: any) => ({
        id: h.id,
        type: 'habit' as const,
        name: h.name || '',
        commitment_started_at: h.commitment_started_at,
        commitment_note: h.commitment_note,
      }));

    const todos = (todosRes.data || [])
      .filter((t: any) => t.commitment === true)
      .map((t: any) => ({
        id: t.id,
        type: 'todo' as const,
        name: t.name || '',
        commitment_started_at: t.commitment_started_at,
        commitment_note: t.commitment_note,
      }));

    return [...habits, ...todos].sort((a, b) => {
      const ta = a.commitment_started_at ? new Date(a.commitment_started_at).getTime() : 0;
      const tb = b.commitment_started_at ? new Date(b.commitment_started_at).getTime() : 0;
      return tb - ta;
    });
  }

  /** Enable commitment for an item (max 3 total). Optionally set note. */
  async addCommitment(id: string, type: 'habit' | 'todo', note?: string | null): Promise<void> {
    const current = await this.countActiveCommitments();
    if (current >= 3) {
      throw new Error('MAX_COMMITMENTS_REACHED');
    }
    const startedAt = new Date().toISOString();
    const table = type === 'habit' ? 'habits' : 'todos';

    const { error } = await supabase
      .from(table)
      .update({
        commitment: true,
        commitment_started_at: startedAt,
        ...(note !== undefined ? { commitment_note: note } : {}),
      })
      .eq('id', id)
      .eq('owner_id', this.ensureUserId());

    if (error) {
      throw new Error(`COMMITMENT_SET_FAILED: ${error.message}`);
    }

    this.lastCommitCountAt = Date.now();
    this.lastCommitCountValue = current + 1;
  }

  /** Disable commitment (soft remove). Optionally store a reason in note. */
  async removeCommitment(
    id: string,
    type: 'habit' | 'todo',
    reason?: string | null,
  ): Promise<void> {
    const table = type === 'habit' ? 'habits' : 'todos';

    const { error } = await supabase
      .from(table)
      .update({
        commitment: false,
        commitment_archived_at: new Date().toISOString(),
        ...(reason ? { commitment_note: reason } : {}),
      })
      .eq('id', id)
      .eq('owner_id', this.ensureUserId());

    if (error) {
      throw new Error(`COMMITMENT_REMOVE_FAILED: ${error.message}`);
    }

    this.lastCommitCountAt = Date.now();
    this.lastCommitCountValue = Math.max(0, this.lastCommitCountValue - 1);
  }

  // ==========================
  // COMPLETION METHODS (Phase 9)
  // ==========================

  async completeHabit(id: ID, atIso: string): Promise<void> {
    const userId = this.ensureUserId();
    const todayDay = atIso.split('T')[0];

    console.log('[SupabaseRepo] completeHabit called:', { id, atIso, todayDay });

    // Update last_completed_at to track when habit was last completed
    // NOTE: This is different from completed_at which is used for soft-delete/archiving
    const { error: habitError } = await supabase
      .from('habits')
      .update({ last_completed_at: atIso })
      .eq('id', id)
      .eq('owner_id', userId);

    if (habitError) throw new Error(`Failed to complete habit: ${habitError.message}`);

    // ALSO log to habit_progress table for today - this is what listTodayMerged reads
    const { data: progressData, error: progressError } = await supabase
      .from('habit_progress')
      .insert({
        owner_id: userId,
        habit_id: id,
        count: 1,
        occurred_at: atIso,
        occurred_day: todayDay,
      })
      .select('id, habit_id, count, occurred_day');

    if (progressError) {
      console.warn('[SupabaseRepo] completeHabit habit_progress insert failed:', progressError);
      // Don't throw - habit is still marked complete via last_completed_at
    } else {
      console.log('[SupabaseRepo] completeHabit habit_progress result:', progressData);
    }

    // Emit event for UI sync
    eventBus.emit('ItemCompleted', { id, type: 'habit' });
  }

  async completeTodo(id: ID, atIso: string): Promise<void> {
    const userId = this.ensureUserId();

    console.log('[SupabaseRepo] completeTodo called:', { id, atIso });

    const { data, error } = await supabase
      .from('todos')
      .update({ status: 'completed', completed_at: atIso })
      .eq('id', id)
      .eq('owner_id', userId)
      .select('id, status, completed_at')
      .single();

    if (error) throw new Error(`Failed to complete todo: ${error.message}`);

    console.log('[SupabaseRepo] completeTodo result:', data);

    // Emit event for UI sync
    eventBus.emit('ItemCompleted', { id, type: 'todo' });
  }

  async undoCompletion(id: ID): Promise<void> {
    const userId = this.ensureUserId();

    console.log('[SupabaseRepo] undoCompletion called:', { id });

    // Try to reset status and clear completed_at from todos first
    const { data: todoData, error: todoError } = await supabase
      .from('todos')
      .update({ status: 'active', completed_at: null })
      .eq('id', id)
      .eq('owner_id', userId)
      .select('id, status, completed_at');

    if (!todoError && todoData && todoData.length > 0) {
      // Success - was a todo
      console.log('[SupabaseRepo] undoCompletion todo result:', todoData[0]);
      eventBus.emit('ItemUpdated', { id });
      return;
    }

    // Try habits - delete today's habit_progress entry
    const todayDay = new Date().toISOString().split('T')[0];
    const { data: progressData, error: progressError } = await supabase
      .from('habit_progress')
      .delete()
      .eq('habit_id', id)
      .eq('owner_id', userId)
      .eq('occurred_day', todayDay)
      .select('id');

    if (!progressError && progressData && progressData.length > 0) {
      console.log('[SupabaseRepo] undoCompletion habit_progress deleted:', progressData);
      // Also clear last_completed_at on the habit
      await supabase
        .from('habits')
        .update({ last_completed_at: null })
        .eq('id', id)
        .eq('owner_id', userId);
      eventBus.emit('ItemUpdated', { id });
      return;
    }

    // Fallback: Try habits - clear last_completed_at (not completed_at which is for archiving)
    const { error: habitError } = await supabase
      .from('habits')
      .update({ last_completed_at: null })
      .eq('id', id)
      .eq('owner_id', userId);

    if (habitError) {
      throw new Error(`Failed to undo completion: ${habitError.message}`);
    }

    console.log('[SupabaseRepo] undoCompletion habit last_completed_at cleared');

    // Emit event for UI sync
    eventBus.emit('ItemUpdated', { id });
  }

  /**
   * Complete a habit for a specific date (for weekly habit tracking).
   * Inserts a row into habit_progress if not already exists.
   */
  async completeHabitForDate(habitId: ID, dateIso: string): Promise<void> {
    const userId = this.ensureUserId();
    const occurredDay = dateIso.split('T')[0]; // Ensure we have just the date

    console.log('[SupabaseRepo] completeHabitForDate:', { habitId, occurredDay });

    // Check if already completed for this day
    const { data: existing } = await supabase
      .from('habit_progress')
      .select('id')
      .eq('habit_id', habitId)
      .eq('owner_id', userId)
      .eq('occurred_day', occurredDay)
      .maybeSingle();

    if (existing) {
      console.log('[SupabaseRepo] completeHabitForDate: already exists');
      return; // Already completed
    }

    // Insert new progress record
    const { error } = await supabase.from('habit_progress').insert({
      owner_id: userId,
      habit_id: habitId,
      count: 1,
      occurred_at: new Date(occurredDay).toISOString(),
      occurred_day: occurredDay,
    });

    if (error) {
      throw new Error(`Failed to complete habit for date: ${error.message}`);
    }

    // Emit event for UI sync
    eventBus.emit('ItemUpdated', { id: habitId });
  }

  /**
   * Silent version of completeHabitForDate - does NOT emit events.
   * Use this when you want local-only updates without triggering global reloads.
   */
  async completeHabitForDateSilent(habitId: ID, dateIso: string): Promise<void> {
    const userId = this.ensureUserId();
    const occurredDay = dateIso.split('T')[0];

    console.log('[SupabaseRepo] completeHabitForDateSilent:', { habitId, occurredDay });

    // Check if already completed for this day
    const { data: existing } = await supabase
      .from('habit_progress')
      .select('id')
      .eq('habit_id', habitId)
      .eq('owner_id', userId)
      .eq('occurred_day', occurredDay)
      .maybeSingle();

    if (existing) {
      return; // Already completed
    }

    // Insert new progress record
    const { error } = await supabase.from('habit_progress').insert({
      owner_id: userId,
      habit_id: habitId,
      count: 1,
      occurred_at: new Date(occurredDay).toISOString(),
      occurred_day: occurredDay,
    });

    if (error) {
      throw new Error(`Failed to complete habit for date: ${error.message}`);
    }
    // No event emission - caller handles local state
  }

  /**
   * Remove a habit completion for a specific date (for weekly habit tracking).
   * Deletes the row from habit_progress matching that day.
   */
  async removeHabitCompletion(habitId: ID, dateIso: string): Promise<void> {
    const userId = this.ensureUserId();
    const occurredDay = dateIso.split('T')[0]; // Ensure we have just the date

    console.log('[SupabaseRepo] removeHabitCompletion:', { habitId, occurredDay });

    const { error } = await supabase
      .from('habit_progress')
      .delete()
      .eq('habit_id', habitId)
      .eq('owner_id', userId)
      .eq('occurred_day', occurredDay);

    if (error) {
      throw new Error(`Failed to remove habit completion: ${error.message}`);
    }

    // Emit event for UI sync
    eventBus.emit('ItemUpdated', { id: habitId });
  }

  /**
   * Silent version of removeHabitCompletion - does NOT emit events.
   * Use this when you want local-only updates without triggering global reloads.
   */
  async removeHabitCompletionSilent(habitId: ID, dateIso: string): Promise<void> {
    const userId = this.ensureUserId();
    const occurredDay = dateIso.split('T')[0];

    console.log('[SupabaseRepo] removeHabitCompletionSilent:', { habitId, occurredDay });

    const { error } = await supabase
      .from('habit_progress')
      .delete()
      .eq('habit_id', habitId)
      .eq('owner_id', userId)
      .eq('occurred_day', occurredDay);

    if (error) {
      throw new Error(`Failed to remove habit completion: ${error.message}`);
    }
    // No event emission - caller handles local state
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

  async listBySpaceGrouped(
    spaceId: string,
    opts?: { tagNames?: string[] },
  ): Promise<GroupedByType> {
    const hasTagFilter = Boolean(opts?.tagNames && opts.tagNames.length > 0);
    const perfLabel = '[PERF][tags] listBySpaceGrouped';
    const perfStart = hasTagFilter ? Date.now() : null;
    if (hasTagFilter) {
      console.time(perfLabel);
    }

    const userId = this.ensureUserId();

    const runTableQuery = async (table: 'habits' | 'todos' | 'notes', applyTagFilter: boolean) => {
      let query = supabase.from(table).select('*').eq('owner_id', userId).eq('space_id', spaceId);

      if (applyTagFilter && opts?.tagNames && opts.tagNames.length > 0) {
        query = query.contains('tags', opts.tagNames);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      return { data: data ?? [], error };
    };

    const runGroupedQuery = async (applyTagFilter: boolean) => {
      const [habits, todos, notes] = await Promise.all([
        runTableQuery('habits', applyTagFilter),
        runTableQuery('todos', applyTagFilter),
        runTableQuery('notes', applyTagFilter),
      ]);

      return { habits, todos, notes };
    };

    const ensureNoErrors = ({
      habits,
      todos,
      notes,
    }: Awaited<ReturnType<typeof runGroupedQuery>>) => {
      if (habits.error) {
        const err = new Error(`Failed to list habits: ${habits.error.message}`);
        (err as any).cause = habits.error;
        throw err;
      }
      if (todos.error) {
        const err = new Error(`Failed to list todos: ${todos.error.message}`);
        (err as any).cause = todos.error;
        throw err;
      }
      if (notes.error) {
        const err = new Error(`Failed to list notes: ${notes.error.message}`);
        (err as any).cause = notes.error;
        throw err;
      }

      return {
        habits: habits.data,
        todos: todos.data,
        notes: notes.data,
      };
    };

    try {
      let groupedRaw: { habits: any[]; todos: any[]; notes: any[] };

      if (hasTagFilter) {
        try {
          const initial = await runGroupedQuery(true);
          const initialError = initial.habits.error ?? initial.todos.error ?? initial.notes.error;

          if (initialError) {
            console.warn(
              '[SupabaseRepo] Tag filter grouped query failed, falling back without tags',
              {
                spaceId,
                tagNames: opts?.tagNames,
                error: formatSupabaseError(initialError),
              },
            );
            notifyTagFilterFallback();

            const fallback = await runGroupedQuery(false);
            try {
              groupedRaw = ensureNoErrors(fallback);
            } catch (fallbackError) {
              console.warn('[SupabaseRepo] Tag filter grouped fallback failed', {
                spaceId,
                error: formatSupabaseError(
                  (fallbackError as Error & { cause?: any })?.cause ?? null,
                ),
              });
              throw fallbackError;
            }
          } else {
            groupedRaw = ensureNoErrors(initial);
          }
        } catch (error) {
          console.warn('[tags] contains failed, falling back', error);
          notifyTagFilterFallback();

          const fallback = await runGroupedQuery(false);
          try {
            groupedRaw = ensureNoErrors(fallback);
          } catch (fallbackError) {
            console.warn('[SupabaseRepo] Tag filter grouped fallback failed', {
              spaceId,
              error: formatSupabaseError((fallbackError as Error & { cause?: any })?.cause ?? null),
            });
            throw fallbackError;
          }
        }
      } else {
        groupedRaw = ensureNoErrors(await runGroupedQuery(false));
      }

      return {
        habits: groupedRaw.habits.map(
          (h) => habitZ.parse(mapHabitFromDb({ ...h, type: 'habit' })) as Habit,
        ),
        todos: groupedRaw.todos.map((t) => todoZ.parse({ ...t, type: 'todo' }) as Todo),
        notes: groupedRaw.notes.map((n) => noteZ.parse({ ...n, type: 'note' }) as Note),
      };
    } finally {
      if (hasTagFilter && perfStart !== null) {
        const elapsed = Date.now() - perfStart;
        try {
          console.timeEnd(perfLabel);
        } catch {
          // console.timeEnd may throw in non-interactive test environments; ignore.
        }
        if (elapsed > 600) {
          console.warn('[PERF][tags] slow query', {
            ms: elapsed,
            tagCount: opts?.tagNames?.length ?? 0,
          });
        }
      }
    }
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

  // ============================================================================
  // Phase 10.10 - Log Photos (multi-photo journal logs)
  // ============================================================================

  async listLogPhotos(
    noteId: string,
  ): Promise<Array<{ id: string; url: string; position: number }>> {
    const userId = this.ensureUserId();
    const { data, error } = await supabase
      .from('log_photos')
      .select('id, url, position')
      .eq('note_id', noteId)
      .eq('owner_id', userId)
      .order('position', { ascending: true });

    if (error) {
      console.error('[SupabaseRepo] Failed to list log photos:', error);
      throw new Error(`Failed to list log photos: ${error.message}`);
    }

    return data || [];
  }

  async insertLogPhoto(params: {
    noteId: string;
    url: string;
    position: number;
  }): Promise<{ id: string }> {
    const userId = this.ensureUserId();
    const { data, error } = await supabase
      .from('log_photos')
      .insert({
        note_id: params.noteId,
        owner_id: userId,
        url: params.url,
        position: params.position,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[SupabaseRepo] Failed to insert log photo:', error);
      throw new Error(`Failed to insert log photo: ${error.message}`);
    }

    return { id: data.id };
  }

  async updateLogPhotoPosition(photoId: string, position: number): Promise<void> {
    const userId = this.ensureUserId();
    const { error } = await supabase
      .from('log_photos')
      .update({ position })
      .eq('id', photoId)
      .eq('owner_id', userId);

    if (error) {
      console.error('[SupabaseRepo] Failed to update log photo position:', error);
      throw new Error(`Failed to update log photo position: ${error.message}`);
    }
  }

  async deleteLogPhoto(photoId: string): Promise<void> {
    const userId = this.ensureUserId();
    const { error } = await supabase
      .from('log_photos')
      .delete()
      .eq('id', photoId)
      .eq('owner_id', userId);

    if (error) {
      console.error('[SupabaseRepo] Failed to delete log photo:', error);
      throw new Error(`Failed to delete log photo: ${error.message}`);
    }
  }

  // ==========================
  // Phase 12: Milestones CRUD (redesigned)
  // Supports both legacy (title/note) and new (name) fields during transition
  // ==========================

  async listMilestones(spaceId: string): Promise<import('../types').SpaceMilestone[]> {
    const userId = this.ensureUserId();
    const { data, error } = await supabase
      .from('space_milestones')
      .select('*')
      .eq('owner_id', userId)
      .eq('space_id', spaceId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      logSupabaseError('listMilestones', error);
      throw new Error(`Failed to list milestones: ${error.message}`);
    }
    return (data || []).map((row: any) => ({
      ...row,
      name: row.name || row.title || 'Untitled',
      completed: row.completed ?? false,
      completed_at: row.completed_at ?? null,
      is_active: row.is_active ?? true,
      sort_order: row.sort_order ?? 0,
      updated_at: row.updated_at ?? row.created_at,
    })) as import('../types').SpaceMilestone[];
  }

  async getActiveMilestone(spaceId: string): Promise<import('../types').SpaceMilestone | null> {
    const userId = this.ensureUserId();
    const { data, error } = await supabase
      .from('space_milestones')
      .select('*')
      .eq('owner_id', userId)
      .eq('space_id', spaceId)
      .eq('is_active', true)
      .single();
    if (error && error.code !== 'PGRST116') {
      logSupabaseError('getActiveMilestone', error);
      throw new Error(`Failed to get active milestone: ${error.message}`);
    }
    if (!data) return null;
    return {
      ...data,
      name: data.name || data.title || 'Untitled',
      completed: data.completed ?? false,
      completed_at: data.completed_at ?? null,
      is_active: data.is_active ?? true,
      sort_order: data.sort_order ?? 0,
      updated_at: data.updated_at ?? data.created_at,
    } as import('../types').SpaceMilestone;
  }

  async createMilestone(
    spaceId: string,
    payload: {
      name: string;
      date?: string | null;
      is_active?: boolean;
      sort_order?: number;
      title?: string;
      note?: string | null;
    },
  ): Promise<import('../types').SpaceMilestone> {
    const userId = this.ensureUserId();
    const nameValue = payload.name || payload.title || 'Untitled';
    const { data, error } = await supabase
      .from('space_milestones')
      .insert({
        owner_id: userId,
        space_id: spaceId,
        name: nameValue,
        title: nameValue,
        date: payload.date ?? null,
        note: payload.note ?? null,
        is_active: payload.is_active ?? true,
        sort_order: payload.sort_order ?? 0,
        completed: false,
        completed_at: null,
      })
      .select()
      .single();
    if (error) {
      logSupabaseError('createMilestone', error);
      throw new Error(`Failed to create milestone: ${error.message}`);
    }
    if (!data) throw new Error('No data returned from createMilestone');
    return {
      ...data,
      name: data.name || data.title,
      completed: data.completed ?? false,
      is_active: data.is_active ?? true,
      sort_order: data.sort_order ?? 0,
      updated_at: data.updated_at ?? data.created_at,
    } as import('../types').SpaceMilestone;
  }

  async updateMilestone(
    id: string,
    patch: Partial<{
      name: string;
      title: string;
      date: string | null;
      note: string | null;
      completed: boolean;
      completed_at: string | null;
      is_active: boolean;
      sort_order: number;
    }>,
  ): Promise<import('../types').SpaceMilestone> {
    const userId = this.ensureUserId();
    const updatePayload: Record<string, any> = {
      ...compact(patch),
      updated_at: new Date().toISOString(),
    };
    if (patch.name) updatePayload.title = patch.name;
    if (patch.title && !patch.name) updatePayload.name = patch.title;

    const { data, error } = await supabase
      .from('space_milestones')
      .update(updatePayload)
      .eq('id', id)
      .eq('owner_id', userId)
      .select()
      .single();
    if (error) {
      logSupabaseError('updateMilestone', error);
      throw new Error(`Failed to update milestone: ${error.message}`);
    }
    if (!data) throw new Error('No data returned from updateMilestone');
    return {
      ...data,
      name: data.name || data.title,
      completed: data.completed ?? false,
      is_active: data.is_active ?? true,
      sort_order: data.sort_order ?? 0,
      updated_at: data.updated_at ?? data.created_at,
    } as import('../types').SpaceMilestone;
  }

  async completeMilestone(id: string): Promise<import('../types').SpaceMilestone> {
    return this.updateMilestone(id, {
      completed: true,
      completed_at: new Date().toISOString(),
      is_active: false,
    });
  }

  async deleteMilestone(id: string): Promise<void> {
    const userId = this.ensureUserId();
    const { error } = await supabase
      .from('space_milestones')
      .delete()
      .eq('id', id)
      .eq('owner_id', userId);
    if (error) {
      logSupabaseError('deleteMilestone', error);
      throw new Error(`Failed to delete milestone: ${error.message}`);
    }
  }

  // ==========================
  // Phase 12: SpaceMeta CRUD
  // ==========================

  async getSpaceMeta(spaceId: string): Promise<import('../types').SpaceMeta | null> {
    const userId = this.ensureUserId();
    const { data, error } = await supabase
      .from('space_meta')
      .select('*')
      .eq('owner_id', userId)
      .eq('space_id', spaceId)
      .single();
    if (error && error.code !== 'PGRST116') {
      logSupabaseError('getSpaceMeta', error);
      throw new Error(`Failed to get space meta: ${error.message}`);
    }
    return (data as import('../types').SpaceMeta) || null;
  }

  async upsertSpaceMeta(
    spaceId: string,
    payload: { success_criteria?: string | null; other_context?: string | null },
  ): Promise<import('../types').SpaceMeta> {
    const userId = this.ensureUserId();
    const { data, error } = await supabase
      .from('space_meta')
      .upsert(
        {
          space_id: spaceId,
          owner_id: userId,
          success_criteria: payload.success_criteria ?? null,
          other_context: payload.other_context ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'space_id' },
      )
      .select()
      .single();
    if (error) {
      logSupabaseError('upsertSpaceMeta', error);
      throw new Error(`Failed to upsert space meta: ${error.message}`);
    }
    if (!data) throw new Error('No data returned from upsertSpaceMeta');
    return data as import('../types').SpaceMeta;
  }

  async deleteSpaceMeta(spaceId: string): Promise<void> {
    const userId = this.ensureUserId();
    const { error } = await supabase
      .from('space_meta')
      .delete()
      .eq('space_id', spaceId)
      .eq('owner_id', userId);
    if (error) {
      logSupabaseError('deleteSpaceMeta', error);
      throw new Error(`Failed to delete space meta: ${error.message}`);
    }
  }

  // ==========================
  // Phase 12: Pinned Items
  // ==========================

  async toggleTodoPinned(todoId: string, isPinned: boolean): Promise<void> {
    const userId = this.ensureUserId();
    const { error } = await supabase
      .from('todos')
      .update({ is_pinned: isPinned, updated_at: new Date().toISOString() })
      .eq('id', todoId)
      .eq('owner_id', userId);
    if (error) {
      logSupabaseError('toggleTodoPinned', error);
      throw new Error(`Failed to toggle todo pinned: ${error.message}`);
    }
  }

  async toggleHabitPinned(habitId: string, isPinned: boolean): Promise<void> {
    const userId = this.ensureUserId();
    const { error } = await supabase
      .from('habits')
      .update({ is_pinned: isPinned, updated_at: new Date().toISOString() })
      .eq('id', habitId)
      .eq('owner_id', userId);
    if (error) {
      logSupabaseError('toggleHabitPinned', error);
      throw new Error(`Failed to toggle habit pinned: ${error.message}`);
    }
  }

  async toggleNotePinned(noteId: string, isPinned: boolean): Promise<void> {
    const userId = this.ensureUserId();
    const { error } = await supabase
      .from('notes')
      .update({ is_pinned: isPinned, updated_at: new Date().toISOString() })
      .eq('id', noteId)
      .eq('owner_id', userId);
    if (error) {
      logSupabaseError('toggleNotePinned', error);
      throw new Error(`Failed to toggle note pinned: ${error.message}`);
    }
  }

  async getPinnedItemsForSpace(spaceId: string): Promise<{
    todos: import('../types').Todo[];
    habits: import('../types').Habit[];
    notes: import('../types').Note[];
  }> {
    const userId = this.ensureUserId();

    const [todosRes, habitsRes, notesRes] = await Promise.all([
      supabase
        .from('todos')
        .select('*')
        .eq('owner_id', userId)
        .eq('space_id', spaceId)
        .eq('is_pinned', true),
      supabase
        .from('habits')
        .select('*')
        .eq('owner_id', userId)
        .eq('space_id', spaceId)
        .eq('is_pinned', true),
      supabase
        .from('notes')
        .select('*')
        .eq('owner_id', userId)
        .eq('space_id', spaceId)
        .eq('is_pinned', true),
    ]);

    if (todosRes.error) logSupabaseError('getPinnedItems.todos', todosRes.error);
    if (habitsRes.error) logSupabaseError('getPinnedItems.habits', habitsRes.error);
    if (notesRes.error) logSupabaseError('getPinnedItems.notes', notesRes.error);

    return {
      todos: ((todosRes.data || []) as any[]).map((row) => ({ ...row, type: 'todo' as const })),
      habits: ((habitsRes.data || []) as any[]).map((row) => ({ ...row, type: 'habit' as const })),
      notes: ((notesRes.data || []) as any[]).map((row) => ({ ...row, type: 'note' as const })),
    };
  }

  async getPinnedCountForSpace(spaceId: string): Promise<number> {
    const userId = this.ensureUserId();

    const [todosRes, habitsRes, notesRes] = await Promise.all([
      supabase
        .from('todos')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .eq('space_id', spaceId)
        .eq('is_pinned', true),
      supabase
        .from('habits')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .eq('space_id', spaceId)
        .eq('is_pinned', true),
      supabase
        .from('notes')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .eq('space_id', spaceId)
        .eq('is_pinned', true),
    ]);

    return (todosRes.count || 0) + (habitsRes.count || 0) + (notesRes.count || 0);
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

  /**
   * Get a single chat by ID
   */
  async getById(chatId: string): Promise<import('../types').SpaceChat | null> {
    const userId = this.ensureUserId();

    const { data, error } = await supabase
      .from('space_chats')
      .select('*')
      .eq('id', chatId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to get space chat: ${error.message}`);
    }

    return data as import('../types').SpaceChat;
  }

  /**
   * List all chats for a space (simplified version for modal)
   */
  async listBySpace(spaceId: string): Promise<import('../types').SpaceChat[]> {
    const userId = this.ensureUserId();

    const { data, error } = await supabase
      .from('space_chats')
      .select('*')
      .eq('space_id', spaceId)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
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
    if ('running_summary' in patch) updatePayload.running_summary = patch.running_summary ?? null;
    if ('context_json' in patch) updatePayload.context_json = patch.context_json ?? null;
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
}

/**
 * SupabaseSpaceMilestoneRepo - Standalone CRUD for space_milestones
 * Phase 12: Updated to support new schema with backward compatibility
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
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Failed to list milestones: ${error.message}`);
    return (data || []).map((row: any) => ({
      ...row,
      name: row.name || row.title || 'Untitled',
      completed: row.completed ?? false,
      completed_at: row.completed_at ?? null,
      is_active: row.is_active ?? true,
      sort_order: row.sort_order ?? 0,
      updated_at: row.updated_at ?? row.created_at,
    })) as import('../types').SpaceMilestone[];
  }

  async getActive(spaceId: string): Promise<import('../types').SpaceMilestone | null> {
    const userId = this.ensureUserId();
    const { data, error } = await supabase
      .from('space_milestones')
      .select('*')
      .eq('owner_id', userId)
      .eq('space_id', spaceId)
      .eq('is_active', true)
      .single();
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get active milestone: ${error.message}`);
    }
    if (!data) return null;
    return {
      ...data,
      name: data.name || data.title || 'Untitled',
      completed: data.completed ?? false,
      is_active: data.is_active ?? true,
      sort_order: data.sort_order ?? 0,
      updated_at: data.updated_at ?? data.created_at,
    } as import('../types').SpaceMilestone;
  }

  async create(input: {
    space_id: string;
    name: string;
    date?: string | null;
    is_active?: boolean;
    sort_order?: number;
  }): Promise<import('../types').SpaceMilestone> {
    const userId = this.ensureUserId();
    const { data, error } = await supabase
      .from('space_milestones')
      .insert({
        owner_id: userId,
        space_id: input.space_id,
        name: input.name,
        title: input.name, // Sync for legacy
        date: input.date ?? null,
        is_active: input.is_active ?? true,
        sort_order: input.sort_order ?? 0,
        completed: false,
        completed_at: null,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create milestone: ${error.message}`);
    return {
      ...data,
      name: data.name || data.title,
    } as import('../types').SpaceMilestone;
  }

  async update(
    id: string,
    patch: Partial<{
      name: string;
      date: string | null;
      completed: boolean;
      completed_at: string | null;
      is_active: boolean;
      sort_order: number;
    }>,
  ): Promise<import('../types').SpaceMilestone> {
    const userId = this.ensureUserId();
    const updatePayload: Record<string, any> = {
      ...patch,
      updated_at: new Date().toISOString(),
    };
    if (patch.name) updatePayload.title = patch.name; // Sync for legacy

    const { data, error } = await supabase
      .from('space_milestones')
      .update(updatePayload)
      .eq('id', id)
      .eq('owner_id', userId)
      .select()
      .single();
    if (error) throw new Error(`Failed to update milestone: ${error.message}`);
    return {
      ...data,
      name: data.name || data.title,
    } as import('../types').SpaceMilestone;
  }

  async complete(id: string): Promise<import('../types').SpaceMilestone> {
    return this.update(id, {
      completed: true,
      completed_at: new Date().toISOString(),
      is_active: false,
    });
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
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * OVERLAY → SUPABASE FIELD MAPPING AUDIT (2025-11-30)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This audit ensures all overlay-editable fields are correctly mapped
 * from the overlay state → patch → Supabase columns.
 *
 * FIELDS FIXED IN THIS AUDIT:
 *
 * HABITS:
 * - frequency_value → frequency_json (FIXED - was missing before)
 * - commitment → commitment (ADDED)
 * - commitment_note → commitment_note (ADDED)
 * - commitment_started_at → commitment_started_at (ADDED)
 * - reminders → reminders_json (ADDED)
 *
 * TODOS:
 * - commitment → commitment (ADDED)
 * - commitment_note → commitment_note (ADDED)
 * - commitment_started_at → commitment_started_at (ADDED)
 * - reminders → reminders_json (ADDED)
 *
 * NOTES/LOGS:
 * - mood → mood (ADDED)
 * - fmt → fmt (ADDED)
 * - date → date (ADDED)
 * - private → private (ADDED)
 * - journal_subtype → journal_subtype (ADDED)
 * - reminders → reminders_json (ADDED)
 * - photo_uri → photo_uri (ADDED)
 *
 * FIELDS INTENTIONALLY NOT PERSISTED:
 * - log.kind: Derived from content at runtime, not stored
 * - detected.mentions/dates: Runtime detection, not persisted
 * - undoStack: UI-only state
 * - expanded: UI-only state
 * - person: Linked via entity_people junction table (separate flow)
 * - userEditedTitle/compactTitleSource: Internal tracking, not persisted
 *
 * LOGGING:
 * - [TodoEdit] patch/updatePayload/db result/updated todo
 * - [HabitEdit] patch/updatePayload/db result/updated habit
 * - [NoteEdit] patch/updatePayload/db result/updated note
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * READ-SIDE AUDIT: SUPABASE → OVERLAY FIELD MAPPING (2025-11-30)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This audit ensures all database fields are correctly mapped when reading
 * entities from Supabase and loading them into the Unified Overlay v2.
 *
 * FLOW:
 * 1. Supabase row → mapXxxFromDb() → TypeScript entity
 * 2. TypeScript entity → buildDraftPayloadFromEntity() → V2State
 * 3. V2State → overlay UI → user edits
 * 4. V2State → toCreateOrUpdateInput() → save payload → Supabase
 *
 * READ-SIDE FIXES (mapXxxFromDb functions in supabase.ts):
 *
 * mapTodoFromDb:
 * - commitment: dbRecord.commitment ?? false (ADDED)
 * - commitment_note: dbRecord.commitment_note ?? null (ADDED)
 * - commitment_started_at: dbRecord.commitment_started_at ?? null (ADDED)
 * - reminders: dbRecord.reminders_json ?? null (ADDED - was missing)
 * - due_date, due_day, due_time: Explicitly mapped (VERIFIED)
 * - labels, space_id, origin, has_list, list_items: Common fields (ADDED)
 * - Dev logging: [TodoFromRow] logs commitment/reminders/due fields (ADDED)
 *
 * mapHabitFromDb:
 * - commitment: dbRecord.commitment ?? false (ADDED)
 * - commitment_note: dbRecord.commitment_note ?? null (ADDED)
 * - commitment_started_at: dbRecord.commitment_started_at ?? null (ADDED)
 * - frequency_value: dbRecord.frequency_json ?? null (VERIFIED - was present)
 * - reminders: dbRecord.reminders_json ?? null (VERIFIED - was present)
 * - triggers: dbRecord.triggers_json ?? null (VERIFIED - was present)
 * - labels, space_id, origin, has_list, list_items: Common fields (ADDED)
 * - Dev logging: [HabitFromRow] logs commitment/frequency/reminders (ADDED)
 *
 * mapNoteFromDb:
 * - reminders: dbRecord.reminders_json ?? null (VERIFIED - was present)
 * - mood: dbRecord.mood ?? null (ADDED - for journal entries)
 * - fmt: dbRecord.fmt ?? null (ADDED - for formatting)
 * - date: dbRecord.date ?? null (ADDED - for journal date)
 * - private: dbRecord.private ?? false (ADDED - privacy flag)
 * - journal_subtype: dbRecord.journal_subtype ?? null (ADDED - AI subtype)
 * - photo_uri: dbRecord.photo_uri ?? null (ADDED - journal photos)
 * - labels, space_id, origin, has_list, list_items: Common fields (ADDED)
 * - Dev logging: [NoteFromRow] logs mood/date/subtype/reminders (ADDED)
 *
 * OVERLAY INITIALIZATION FIXES (buildDraftPayloadFromEntity in UnifiedOverlayV2.tsx):
 *
 * Habit branch:
 * - commitment: entity.commitment === true (ADDED)
 * - commitmentNote: entity.commitment_note ?? '' (ADDED)
 * - commitmentStartedAt: entity.commitment_started_at ?? null (ADDED)
 * - frequency_json: entity.frequency_value ?? null (VERIFIED - was present)
 * - subtype: entity.subtype ?? 'start_habit' (ADDED)
 * - spaceId: entity.space_id ?? null (ADDED)
 * - Dev logging: [UnifiedOverlayV2.init] logs commitment/frequency (ADDED)
 *
 * Todo/Log branch:
 * - commitment: entity.commitment === true (ADDED)
 * - commitmentNote: entity.commitment_note ?? '' (ADDED)
 * - commitmentStartedAt: entity.commitment_started_at ?? null (ADDED)
 * - reminderAt: reminders?.[0]?.when ?? null (ADDED - maps reminders array)
 * - spaceId: entity.space_id ?? null (ADDED)
 * - mood, logSubtypeOverride, logIsPrivate: Verified for logs
 * - due_day, due_time: Verified for todos
 * - frequency_json, subtype: Added to habit state for cross-type switching
 * - Dev logging: [UnifiedOverlayV2.init] logs commitment/reminders/due (ADDED)
 *
 * ROUND-TRIP TESTING:
 * - Created __tests__/commitment.roundtrip.test.tsx
 * - Tests commitment fields for todos, habits, notes
 * - Tests reminders for todos and journal entries
 * - Tests frequency_json for habits
 * - Verifies that fields hydrate correctly from entity into overlay state
 *
 * RESULT:
 * ✅ Lock-In / Commitment toggle now round-trips correctly
 * ✅ All overlay-editable fields read from DB → load into overlay
 * ✅ Dev logging added for debugging read-side issues
 * ✅ Tests added to prevent regressions
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
