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

// Accept both lowercase (correct) and capitalized (legacy data) frequencies
// Transform to lowercase to ensure consistency
export const frequencyZ = z
  .union([
    z.literal('daily'),
    z.literal('weekly'),
    z.literal('monthly'),
    z.literal('Daily'),
    z.literal('Weekly'),
    z.literal('Monthly'),
  ])
  .transform((val) => val.toLowerCase() as Frequency) as z.ZodType<Frequency>;

// ==========================
// ROW SCHEMAS (from database)
// ==========================

const baseRecordZ = z.object({
  id: z.string().min(1),
  type: recordTypeZ,
  space_id: z.string().optional().nullable(),
  ai_placed: z.boolean(),
  why_string: z.string().optional().nullable(),
  origin: z.literal('catchall').optional().nullable(),
  canonicalType: z.enum(['note', 'todo', 'habit', 'journal']).optional(),
  labels: z.array(z.string()).optional(),
  views: z
    .object({
      alsoShowIn: z.array(z.string()).optional(),
    })
    .optional(),
  created_at: z.string(), // Accept any string format from DB
  updated_at: z.string(), // Accept any string format from DB
  owner_id: z.string().min(1),
});

export const habitZ = baseRecordZ.extend({
  type: z.literal('habit'),
  name: z.string().min(1), // Changed from 'title' per Phase 7 spec
  frequency: frequencyZ,
  subtype: habitSubtypeZ, // Required (not optional)
  // Extended habit fields (Phase 7+)
  frequency_value: z.any().optional(),
  reminders: z.array(z.any()).optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
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
}) satisfies z.ZodType<Habit>;

export const todoZ = baseRecordZ.extend({
  type: z.literal('todo'),
  title: z.string().min(1),
  body: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(), // Accept any string format from DB
  undefined_due: z.boolean(),
}) satisfies z.ZodType<Todo>;

export const noteZ = baseRecordZ.extend({
  type: z.literal('note'),
  title: z.string().optional().nullable(),
  body: z.string().optional().nullable(),
  subtype: noteSubtypeZ,
}) satisfies z.ZodType<Note>;

export const recordZ = z.union([habitZ, todoZ, noteZ]) as z.ZodType<AppRecord>;

// ==========================
// INSERT SCHEMAS (for database writes)
// Omit: id, owner_id, created_at, updated_at (DB defaults)
// ==========================

export const habitInsertSchema = z.object({
  space_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1), // Changed from 'title' per Phase 7 spec
  frequency: z.string().min(1),
  subtype: habitSubtypeZ, // Required
  ai_placed: z.boolean().default(false),
  why_string: z.string().optional().nullable(),
  origin: z.literal('catchall').optional(),
  canonicalType: z.enum(['note', 'todo', 'habit', 'journal']).optional(),
  labels: z.array(z.string()).optional(),
  views: z
    .object({
      alsoShowIn: z.array(z.string()).optional(),
    })
    .optional(),
  // Extended habit fields (Phase 7+) - using database column names (_json suffix for jsonb)
  frequency_json: z.any().optional(), // Maps to frequency_json column (jsonb)
  reminders_json: z.array(z.any()).optional(), // Maps to reminders_json column (jsonb)
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
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
});

export const todoInsertSchema = z.object({
  space_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  body: z.string().optional().nullable(),
  due_date: z.string().datetime().nullable().optional(),
  undefined_due: z.boolean().default(true),
  ai_placed: z.boolean().default(false),
  why_string: z.string().optional().nullable(),
  origin: z.literal('catchall').optional(),
  canonicalType: z.enum(['note', 'todo', 'habit', 'journal']).optional(),
  labels: z.array(z.string()).optional(),
  views: z
    .object({
      alsoShowIn: z.array(z.string()).optional(),
    })
    .optional(),
});

export const noteInsertSchema = z.object({
  space_id: z.string().uuid().nullable().optional(),
  title: z.string().optional().nullable(),
  body: z.string().optional().nullable(),
  subtype: z.enum(['journal', 'list', 'catchall', 'idea', 'reference']),
  ai_placed: z.boolean().default(false),
  why_string: z.string().optional().nullable(),
  origin: z.literal('catchall').optional(),
  canonicalType: z.enum(['note', 'todo', 'habit', 'journal']).optional(),
  labels: z.array(z.string()).optional(),
  views: z
    .object({
      alsoShowIn: z.array(z.string()).optional(),
    })
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

export const personInsertSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().nullable(),
  avatar: z.string().optional().nullable(),
});

export const entityPersonInsertSchema = z.object({
  person_id: z.string().uuid(),
  entity_type: entityTypeZ,
  entity_id: z.string().uuid(),
});

// ==========================
// Helper functions
// ==========================

export const parseRecord = (data: unknown): AppRecord => recordZ.parse(data);
export const isHabit = (r: AppRecord): r is Habit => r.type === 'habit';
export const isTodo = (r: AppRecord): r is Todo => r.type === 'todo';
export const isNote = (r: AppRecord): r is Note => r.type === 'note';
