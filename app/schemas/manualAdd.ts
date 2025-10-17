/**
 * Manual Add Schemas - Phase 6
 * Zod schemas for all manual-add form data types
 */

import { z } from 'zod';
import type { Frequency } from '../../lib/types';

// ============================================================================
// REMINDER RULE
// ============================================================================

export const FrequencyKindSchema = z.enum(['daily', 'weekly', 'monthly', 'custom']);
export type FrequencyKind = z.infer<typeof FrequencyKindSchema>;

export const CustomWeeklyRuleSchema = z.object({
  type: z.literal('weekly'),
  daysOfWeek: z.array(z.number().min(0).max(6)), // 0=Sun, 6=Sat
});
export type TCustomWeeklyRule = z.infer<typeof CustomWeeklyRuleSchema>;

export const CustomNthWeekdayRuleSchema = z.object({
  type: z.literal('nthWeekday'),
  nth: z.number().min(1).max(5), // 1st, 2nd, 3rd, 4th, 5th
  weekday: z.number().min(0).max(6), // 0=Sun, 6=Sat
});
export type TCustomNthWeekdayRule = z.infer<typeof CustomNthWeekdayRuleSchema>;

export const CustomFrequencySchema = z.union([CustomWeeklyRuleSchema, CustomNthWeekdayRuleSchema]);
export type TCustomFrequency = z.infer<typeof CustomFrequencySchema>;

export const ReminderRuleSchema = z.object({
  id: z.string(),
  timeISO: z.string(), // HH:MM format
  daysOfWeek: z.array(z.number().min(0).max(6)).optional(),
  frequency: FrequencyKindSchema,
  customRule: CustomFrequencySchema.optional(),
});
export type TReminderRule = z.infer<typeof ReminderRuleSchema>;

// ============================================================================
// HABIT START
// ============================================================================

export const HabitStartSchema = z.object({
  name: z.string().min(1, 'Habit name is required').max(120),
  frequency: z.string().min(1, 'Frequency is required'),
  // Optional fields
  notes: z.string().max(500).optional(),
  category: z.string().optional(),
  buddy: z.string().optional(),
  stack: z.string().optional(),
  startDate: z.string().optional(), // ISO date string
  endDate: z.string().optional(),
  spaceId: z.string().optional(),
  reminders: z.array(ReminderRuleSchema).optional(),
});
export type THabitStart = z.infer<typeof HabitStartSchema>;

// ============================================================================
// HABIT BREAK
// ============================================================================

export const HabitBreakSchema = z.object({
  name: z.string().min(1, 'Habit name is required').max(120),
  // Optional fields
  category: z.string().optional(),
  spaceId: z.string().optional(),
  buddy: z.string().optional(),
  notes: z.string().max(500).optional(),
  triggerPattern: z.string().max(500).optional(),
  reminders: z.array(ReminderRuleSchema).optional(),
});
export type THabitBreak = z.infer<typeof HabitBreakSchema>;

// ============================================================================
// TO-DO
// ============================================================================

export const TodoSchema = z.object({
  name: z.string().min(1, 'To-do name is required').max(120),
  deadline: z.string().optional(), // ISO date string or empty
  notes: z.string().max(500).optional(),
  reminders: z.array(ReminderRuleSchema).optional(),
});
export type TTodo = z.infer<typeof TodoSchema>;

// ============================================================================
// JOURNAL
// ============================================================================

export const JournalSchema = z.object({
  date: z.string().min(1, 'Date is required'), // ISO date string
  entry: z.string().min(1, 'Entry is required').max(5000),
  spaceId: z.string().optional(),
  category: z.string().optional(),
  reminders: z.array(ReminderRuleSchema).optional(),
});
export type TJournal = z.infer<typeof JournalSchema>;

// ============================================================================
// CATCH-ALL
// ============================================================================

export const CatchAllSchema = z.object({
  entry: z.string().min(1, 'Entry is required').max(5000),
});
export type TCatchAll = z.infer<typeof CatchAllSchema>;

// ============================================================================
// UNION TYPE FOR SUBMISSION
// ============================================================================

export type ManualAddPayload =
  | { type: 'habits'; subType: 'start'; data: THabitStart }
  | { type: 'habits'; subType: 'break'; data: THabitBreak }
  | { type: 'todos'; data: TTodo }
  | { type: 'journal'; data: TJournal }
  | { type: 'catchall'; data: TCatchAll };

const repoFrequencies: readonly Frequency[] = ['daily', 'weekly', 'monthly'] as const;

const isRepoFrequency = (value: string): value is Frequency =>
  repoFrequencies.some((frequency) => frequency === value);

export const toRepoFrequency = (value: string): Frequency => {
  if (isRepoFrequency(value)) {
    return value;
  }
  return 'daily';
};
