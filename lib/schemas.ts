import { z } from 'zod';
import type {
  AppRecord,
  Habit,
  Todo,
  Note,
  NoteSubtype,
  HabitSubtype,
  RecordType,
  Frequency,
} from './types';

/**
 * Zod schemas for runtime validation of app records.
 *
 * Row schemas: Validate complete records returned from the database (includes all fields)
 * Insert schemas: Validate data before inserting (excludes auto-generated fields like id, timestamps, owner_id)
 *
 * Used by both memory and Supabase repos.
 */

export const recordTypeZ = z.union([
  z.literal('habit'),
  z.literal('todo'),
  z.literal('note'),
]) as z.ZodType<RecordType>;

export const noteSubtypeZ = z.union([
  z.literal('journal'),
  z.literal('list'),
  z.literal('catchall'),
  z.literal('idea'),
  z.literal('reference'),
]) as z.ZodType<NoteSubtype>;

export const habitSubtypeZ = z.union([
  z.literal('start_habit'),
  z.literal('break_habit'),
  z.literal('routine'),
]) as z.ZodType<HabitSubtype>;

// Phase 14: Accept any string for frequency to support custom frequencies like "3x/week"
// Legacy frequencies (daily/weekly/monthly) are preserved, but now accepts any format
export const frequencyZ = z.string().min(1) as z.ZodType<Frequency>;

const tagsZ = z.array(z.string()).nullable().optional();
const tagsMetaZ = z
  .object({
    sticky: z.array(z.string()).optional(),
    tombstones: z.array(z.string()).optional(),
  })
  .nullable()
  .optional();

// ==========================
// ROW SCHEMAS (from database)
// ==========================

const baseRecordZ = z.object({
  id: z.string().min(1),
  type: recordTypeZ,
  space_id: z.string().optional().nullable(),
  ai_placed: z.boolean(),
  why_string: z.string().optional().nullable(),
  origin: z.enum(['catchall', 'space_chat', 'manual', 'overlay']).optional().nullable(),
  canonicalType: z.enum(['habit', 'todo', 'log', 'unsorted', 'note', 'journal']).optional(),
  labels: z.array(z.string()).optional(),
  // Views is a flexible JSONB bag for UI/AI metadata - passthrough to allow any fields
  views: z
    .object({
      alsoShowIn: z.array(z.string()).optional(),
      // MindDrop Phase 2 enrichment fields
      ai_pending: z.boolean().optional(),
      ai_failed: z.boolean().optional(),
      minddrop_stage: z.string().optional(),
      minddrop_prefilled_v1: z.boolean().optional(),
      confirmation_message: z.string().optional(),
    })
    .passthrough() // Allow any additional fields not explicitly defined
    .optional(),
  source_message_id: z.string().optional().nullable(),
  drop_id: z.string().uuid().nullable().optional(),
  tags_meta: tagsMetaZ,
  created_at: z.string(), // Accept any string format from DB
  updated_at: z.string(), // Accept any string format from DB
  owner_id: z.string().min(1),
});

export const habitZ = baseRecordZ.extend({
  type: z.literal('habit'),
  name: z.preprocess(
    (val) => (typeof val === 'string' && val.trim().length > 0 ? val : 'Untitled'),
    z.string().min(1),
  ), // Changed from 'title' per Phase 7 spec, fallback for null/undefined/empty
  frequency: frequencyZ,
  subtype: z.preprocess(
    (val) =>
      val === 'start_habit' || val === 'break_habit' || val === 'routine' ? val : 'start_habit',
    habitSubtypeZ,
  ), // Resilient to null/undefined, defaults to start_habit
  // Extended habit fields (Phase 7+)
  frequency_value: z.any().optional(),
  reminders: z.array(z.any()).nullable().optional(), // Allow null from DB
  notes: z.string().nullable().optional(),
  tags: tagsZ, // Searchable, AI-editable JSON array persisted in DB
  buddy_id: z.string().nullable().optional(),
  buddy_email: z.string().nullable().optional(),
  stack_with_id: z.string().nullable().optional(),
  stack_position: z.enum(['before', 'after']).nullable().optional(),
  stack_offset_minutes: z.number().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  taper_plan: z.any().nullable().optional(),
  triggers: z.array(z.string()).nullable().optional(),
  replacement_habit_id: z.string().nullable().optional(),
  replacement_text: z.string().nullable().optional(),
  // Commitment/Lock-In fields (Phase X)
  commitment: z.boolean().nullable().optional(),
  commitmentNote: z.string().nullable().optional(),
  commitmentStartedAt: z.string().nullable().optional(),
  is_pinned: z.boolean().optional(),
}); // Removed satisfies for flexibility with preprocess

export const todoZ = baseRecordZ.extend({
  type: z.literal('todo'),
  // Phase 7+: name is the primary field
  name: z.preprocess(
    (val) => (typeof val === 'string' && val.trim().length > 0 ? val : 'Untitled'),
    z.string().min(1),
  ), // Fallback for null/undefined/empty
  title: z.string().optional(), // Backwards compatibility (NOT nullable per type definition)
  body: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(), // Accept any string format from DB
  due_day: z.string().nullable().optional(), // YYYY-MM-DD format - canonical field for day-based logic
  due_time: z.string().nullable().optional(), // HH:mm format
  undefined_due: z.boolean().optional(), // Now optional (legacy field)
  subtype: z.enum(['reminder', 'microproject']).nullable().optional(), // AI-only (already permissive)
  reminders: z.array(z.any()).nullable().optional(), // ReminderRow[]
  notes: z.string().nullable().optional(), // Additional notes
  tags: tagsZ, // Searchable, AI-editable JSON array persisted in DB
  // Completion fields
  status: z.enum(['active', 'completed', 'archived']).nullable().optional(),
  completed_at: z.string().nullable().optional(),
  // Commitment/Lock-In fields (Phase X)
  commitment: z.boolean().nullable().optional(),
  commitmentNote: z.string().nullable().optional(),
  commitmentStartedAt: z.string().nullable().optional(),
  // Make Actionable: reference to source note (when todo was created from a note)
  source_note_id: z.string().uuid().nullable().optional(),
  is_pinned: z.boolean().optional(),
}); // Removed satisfies for flexibility with preprocess

export const noteZ = baseRecordZ.extend({
  type: z.literal('note'),
  title: z.string().optional().nullable(),
  body: z.string().optional().nullable(),
  subtype: z.preprocess(
    (val) =>
      val === 'journal' ||
      val === 'list' ||
      val === 'catchall' ||
      val === 'idea' ||
      val === 'reference'
        ? val
        : 'catchall',
    noteSubtypeZ,
  ), // Resilient to null/undefined, defaults to catchall
  // Journal-specific fields (Phase 7+) - only used when subtype='journal'
  date: z.string().nullable().optional(), // ISO date for journal entry
  mood: z.enum(['ecstatic', 'happy', 'neutral', 'low', 'sad', 'tired']).nullable().optional(),
  fmt: z.enum(['bullets', 'numbers', 'checkboxes']).nullable().optional(),
  reminders: z.array(z.any()).nullable().optional(), // ReminderRow[]
  tags: tagsZ,
  journal_subtype: z.enum(['reflection', 'gratitude', 'dream', 'review']).nullable().optional(), // AI-only
  // Commitment/Lock-In fields (Phase X)
  commitment: z.boolean().nullable().optional(),
  commitmentNote: z.string().nullable().optional(),
  commitmentStartedAt: z.string().nullable().optional(),
  // Make Actionable feature fields
  is_favorite: z.boolean().optional(),
  has_list: z.boolean().optional(),
  list_items: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        checked: z.boolean(),
      }),
    )
    .nullable()
    .optional(),
  is_pinned: z.boolean().optional(),
}); // Removed satisfies for flexibility with preprocess

export const recordZ = z.union([habitZ, todoZ, noteZ]) as z.ZodType<AppRecord>;

// ==========================
// INSERT SCHEMAS (for database writes)
// Omit: id, owner_id, created_at, updated_at (DB defaults)
// ==========================

export const habitInsertSchema = z
  .object({
    space_id: z.string().uuid().nullable().optional(),
    name: z.string().min(1), // Required by database
    title: z.string().min(1).optional(), // Database column is non-null; repo ensures fallback when absent
    frequency: z.string().min(1),
    subtype: z.enum(['start_habit', 'break_habit']).optional(), // Strictly enforce valid subtypes
    ai_placed: z.boolean().default(false),
    why_string: z.string().optional().nullable(),
    origin: z.enum(['catchall', 'space_chat', 'manual', 'overlay']).optional(),
    canonicalType: z.enum(['habit', 'todo', 'log', 'unsorted', 'note', 'journal']).optional(),
    labels: z.array(z.string()).optional(),
    views: z
      .object({
        alsoShowIn: z.array(z.string()).optional(),
      })
      .optional(),
    tags_meta: tagsMetaZ,
    // Extended habit fields (Phase 7+) - using database column names (_json suffix for jsonb)
    frequency_json: z.any().optional().nullable(), // Maps to frequency_json column (jsonb)
    reminders_json: z.array(z.any()).optional().nullable(), // Maps to reminders_json column (jsonb)
    notes: z.string().nullable().optional(),
    tags: tagsZ,
    buddy_id: z.string().uuid().nullable().optional(),
    buddy_email: z.string().email().nullable().optional(),
    stack_with_id: z.string().uuid().nullable().optional(),
    stack_position: z.enum(['before', 'after']).nullable().optional(),
    stack_offset_minutes: z.number().nullable().optional(),
    start_date: z.string().nullable().optional(), // ISO date
    end_date: z.string().nullable().optional(), // ISO date
    taper_plan: z.any().nullable().optional(), // Maps to taper_plan column (jsonb)
    triggers_json: z.array(z.string()).nullable().optional(), // Maps to triggers_json column (jsonb) - nullable
    replacement_habit_id: z.string().uuid().nullable().optional(),
    replacement_text: z.string().nullable().optional(),
  })
  .passthrough(); // Allow additional fields to pass through

export const todoInsertSchema = z.object({
  space_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1), // Required - DATABASE TRUTH: todos table has 'name' column (NO 'title')
  body: z.string().optional().nullable(),
  // Accept both datetime (ISO) and date-only (YYYY-MM-DD) formats
  // Date-only prevents timezone issues where "today at 5pm" becomes "tomorrow" in UTC
  due_date: z
    .string()
    .refine(
      (val) => {
        // Accept YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return true;
        // Accept ISO datetime format
        const d = new Date(val);
        return !isNaN(d.getTime());
      },
      { message: 'Invalid date or datetime format' },
    )
    .nullable()
    .optional(),
  due_day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(), // YYYY-MM-DD format - canonical field for day-based logic
  due_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(), // HH:mm format
  undefined_due: z.boolean().optional(), // Now optional (legacy)
  subtype: z.enum(['reminder', 'microproject']).nullable().optional(), // AI-only, never set by front-end
  reminders_json: z.array(z.any()).nullable().optional(), // ReminderRow[] stored as jsonb
  notes: z.string().nullable().optional(), // Additional notes field
  tags: tagsZ, // Searchable, AI-editable JSON array persisted in DB
  ai_placed: z.boolean().default(false),
  why_string: z.string().optional().nullable(),
  origin: z.enum(['catchall', 'space_chat', 'manual', 'overlay']).optional(),
  canonicalType: z.enum(['habit', 'todo', 'log', 'unsorted', 'note', 'journal']).optional(),
  source_message_id: z.string().min(1).optional(),
  source_note_id: z.string().uuid().nullable().optional(), // Make Actionable: reference to source note
  drop_id: z.string().uuid().nullable().optional(),
  labels: z.array(z.string()).optional(),
  views: z
    .object({
      alsoShowIn: z.array(z.string()).optional(),
    })
    .optional(),
  tags_meta: tagsMetaZ,
});

export const noteInsertSchema = z.object({
  space_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1), // Required - DATABASE TRUTH: notes table has 'title' column (NO 'name')
  body: z.string().optional().nullable(),
  subtype: z.enum(['journal', 'list', 'catchall', 'idea', 'reference']).nullable().optional(), // Optional in database
  ai_placed: z.boolean().default(false),
  why_string: z.string().optional().nullable(),
  origin: z.enum(['catchall', 'space_chat', 'manual', 'overlay']).optional(),
  canonicalType: z.enum(['habit', 'todo', 'log', 'unsorted', 'note', 'journal']).optional(),
  source_message_id: z.string().min(1).optional(),
  drop_id: z.string().uuid().nullable().optional(),
  labels: z.array(z.string()).optional(),
  views: z
    .object({
      alsoShowIn: z.array(z.string()).optional(),
    })
    .optional(),
  tags_meta: tagsMetaZ,
  // Journal-specific fields (from generated schema - notes table has these)
  date: z.string().nullable().optional(), // ISO date for journal entry
  mood: z.enum(['ecstatic', 'happy', 'neutral', 'low', 'sad', 'tired']).nullable().optional(),
  fmt: z.enum(['bullets', 'numbers', 'checkboxes']).nullable().optional(),
  reminders_json: z.array(z.any()).nullable().optional(), // ReminderRow[]
  tags: tagsZ,
  journal_subtype: z.enum(['reflection', 'gratitude', 'dream', 'review']).nullable().optional(), // AI-only
  // Make Actionable feature fields
  is_favorite: z.boolean().optional(),
  has_list: z.boolean().optional(),
  list_items: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        checked: z.boolean(),
      }),
    )
    .nullable()
    .optional(),
});

// ==========================
// SPACE SCHEMAS
// ==========================

export const spaceThemeEnum = z.enum(['deepTeal', 'mint', 'cream', 'periwinkle']);

export const spaceInsertSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  icon: z.string().optional(),
  theme: spaceThemeEnum.optional(),
  // Phase 8+ Spaces v2 fields
  summary_cached: z.string().optional(),
  summary_updated_at: z.string().optional(),
  layout_state_json: z.any().optional(),
  archived_at: z.string().optional(),
});

export type SpaceInsert = z.infer<typeof spaceInsertSchema>;

// ==========================
// TAG SCHEMAS
// ==========================

export const entityTypeZ = z.enum(['habit', 'todo', 'note', 'space']);

export const tagInsertSchema = z.object({
  name: z.string().min(1, 'Tag name is required'),
  color: z.string().optional().nullable(),
});

export const tagMapInsertSchema = z.object({
  tag_id: z.string().uuid(),
  entity_type: entityTypeZ,
  entity_id: z.string().uuid(),
});

// ==========================
// PERSON SCHEMAS
// ==========================

const personDateZ = z.object({
  date: z.string(), // ISO date (YYYY-MM-DD)
  label: z.string(), // birthday, anniversary, moving, custom, or freeform
});

export const personZ = z.object({
  id: z.string().min(1),
  owner_id: z.string().min(1),
  display_name: z.string(),
  name: z.string().optional(), // Deprecated, kept for backwards compatibility
  email: z.string().email().optional().nullable(),
  avatar: z.string().optional().nullable(),
  // Phase 7+ enhancements
  dates: z.array(personDateZ).nullable().optional(),
  notes: z.string().nullable().optional(),
  notes_fmt: z.enum(['bullets', 'numbers', 'checkboxes']).nullable().optional(),
  reminders: z.array(z.any()).nullable().optional(), // ReminderRow[]
  space_id: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
}) satisfies z.ZodType<import('./types').Person>;

export const personInsertSchema = z.object({
  display_name: z.string().min(1, 'Name is required'),
  name: z.string().optional().nullable(), // Deprecated
  email: z.string().email().optional().nullable(),
  avatar: z.string().optional().nullable(),
  // Phase 7+ enhancements
  dates_json: z.array(personDateZ).nullable().optional(), // Stored as jsonb in DB
  notes: z.string().nullable().optional(),
  notes_fmt: z.enum(['bullets', 'numbers', 'checkboxes']).nullable().optional(),
  reminders_json: z.array(z.any()).nullable().optional(), // Stored as jsonb in DB
  space_id: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
});

export const entityPersonInsertSchema = z.object({
  person_id: z.string().uuid(),
  entity_type: entityTypeZ,
  entity_id: z.string().uuid(),
});

// ==========================
// MILESTONE SCHEMAS (Phase 12)
// ==========================

/**
 * Row schema - validates data from database
 * Supports both legacy (title/note) and new (name) fields
 */
export const milestoneZ = z.object({
  id: z.string().uuid(),
  space_id: z.string().uuid(),
  owner_id: z.string().uuid(),
  // New field (preferred)
  name: z.string().optional(),
  // Legacy field (backward compat)
  title: z.string().optional(),
  date: z.string().nullable(),
  // Legacy field
  note: z.string().nullable().optional(),
  completed: z.boolean().default(false),
  completed_at: z.string().nullable(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
  created_at: z.string(),
  updated_at: z.string(),
});

/**
 * Insert schema - for creating new milestones
 * Uses `name` (new spec), not `title`
 */
export const milestoneInsertZ = z.object({
  space_id: z.string().uuid(),
  name: z.string().min(1, 'Milestone name is required'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format')
    .nullable()
    .optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

/**
 * Update schema - for partial updates
 */
export const milestoneUpdateZ = z.object({
  name: z.string().min(1).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  completed: z.boolean().optional(),
  completed_at: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

export type Milestone = z.infer<typeof milestoneZ>;
export type MilestoneInsert = z.infer<typeof milestoneInsertZ>;
export type MilestoneUpdate = z.infer<typeof milestoneUpdateZ>;

// ==========================
// SPACE META SCHEMAS (Phase 12)
// ==========================

export const spaceMetaZ = z.object({
  id: z.string().uuid(),
  space_id: z.string().uuid(),
  success_criteria: z.string().nullable(),
  other_context: z.string().nullable(),
  owner_id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const spaceMetaUpsertZ = z.object({
  space_id: z.string().uuid(),
  success_criteria: z.string().nullable().optional(),
  other_context: z.string().nullable().optional(),
});

export type SpaceMetaRow = z.infer<typeof spaceMetaZ>;
export type SpaceMetaUpsert = z.infer<typeof spaceMetaUpsertZ>;

// ==========================
// Helper functions
// ==========================

export const parseRecord = (data: unknown): AppRecord => recordZ.parse(data);
export const isHabit = (r: AppRecord): r is Habit => r.type === 'habit';
export const isTodo = (r: AppRecord): r is Todo => r.type === 'todo';
export const isNote = (r: AppRecord): r is Note => r.type === 'note';
