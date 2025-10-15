import { z } from 'zod';
import type { AppRecord, Habit, Todo, Note, NoteSubtype, RecordType } from './types';

export const recordTypeZ = z.union([
  z.literal('habit'),
  z.literal('todo'),
  z.literal('note'),
]) as z.ZodType<RecordType>;
export const noteSubtypeZ = z.union([
  z.literal('journal'),
  z.literal('list'),
  z.literal('catchall'),
]) as z.ZodType<NoteSubtype>;

const baseRecordZ = z.object({
  id: z.string().min(1),
  type: recordTypeZ,
  title: z.string().min(1),
  body: z.string().optional(),
  spaceId: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  frequency: z
    .union([z.literal('daily'), z.literal('weekly'), z.literal('monthly')])
    .optional()
    .nullable(),
  aiPlaced: z.boolean().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const habitZ = baseRecordZ.extend({
  type: z.literal('habit'),
  frequency: z.union([z.literal('daily'), z.literal('weekly'), z.literal('monthly')]),
}) satisfies z.ZodType<Habit>;

export const todoZ = baseRecordZ.extend({
  type: z.literal('todo'),
}) satisfies z.ZodType<Todo>;

export const noteZ = baseRecordZ.extend({
  type: z.literal('note'),
  body: z.string(),
  subtype: noteSubtypeZ,
}) satisfies z.ZodType<Note>;

export const recordZ = z.union([habitZ, todoZ, noteZ]) as z.ZodType<AppRecord>;

// helpers
export const parseRecord = (data: unknown): AppRecord => recordZ.parse(data);
export const isHabit = (r: AppRecord): r is Habit => r.type === 'habit';
export const isTodo = (r: AppRecord): r is Todo => r.type === 'todo';
export const isNote = (r: AppRecord): r is Note => r.type === 'note';
