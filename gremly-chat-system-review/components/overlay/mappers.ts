/**
 * DB → Form Mappers for UnifiedCreateOverlay
 * Pure helpers to hydrate edit mode from database entities
 */

import type { AppRecord, Habit, Todo, Note, Person, HabitSubtype } from '../../lib/types';
import type { HabitDetailsState, BreakHabitState } from './fields/HabitFields';
import type { TodoDetailsState } from './fields/TodoFields';
import type { JournalDetailsState, MoodType } from './fields/JournalFields';
import type { NoteDetailsState } from './fields/NoteFields';
import type { PersonDetailsState, PersonDate } from './fields/PersonFields';
import type { FrequencyValue } from './fields/HabitFrequency';

export interface FormHabit {
  name: string;
  frequency: string;
  frequencyValue: FrequencyValue;
  subtype: HabitSubtype | null;
  reminders: any[];
  details: HabitDetailsState;
  breakState: BreakHabitState;
}

export interface FormTodo {
  name: string;
  dueDate: string | null;
  dueTime: string | null;
  details: TodoDetailsState;
}

export interface FormJournal {
  date: string;
  entry: string;
  mood: MoodType | null;
  details: JournalDetailsState;
}

export interface FormNote {
  title: string;
  body: string;
  details: NoteDetailsState;
}

export interface FormPerson {
  name: string;
  details: PersonDetailsState;
}

/**
 * Map Habit from DB to form state
 */
export function mapHabitToForm(h: Habit | AppRecord): FormHabit {
  if (h.type !== 'habit') {
    throw new Error(`Expected habit, got ${h.type}`);
  }

  const habit = h as Habit;

  // Parse frequency value from stored frequency
  const frequencyValue: FrequencyValue = (() => {
    if (habit.frequency === 'daily') {
      return { kind: 'daily' };
    } else if (habit.frequency === 'weekly') {
      return { kind: 'weekly', count: 1 };
    } else {
      // Default to daily for any other value
      return { kind: 'daily' };
    }
  })();

  return {
    name: habit.name || '',
    frequency: habit.frequency || 'daily',
    frequencyValue,
    subtype: habit.subtype || null,
    reminders: habit.reminders || [],
    details: {
      spaceId: habit.space_id || null,
      tags: habit.tags || [],
      notes: habit.notes || '',
    },
    breakState: {
      taperPlan: habit.taper_plan || undefined,
      triggers: habit.triggers || [],
      replacementHabitId: habit.replacement_habit_id || null,
      replacementHabitName: undefined, // Not stored in DB
      replacementFreeText: habit.replacement_text || '',
    },
  };
}

/**
 * Map Todo from DB to form state
 */
export function mapTodoToForm(t: Todo | AppRecord): FormTodo {
  if (t.type !== 'todo') {
    throw new Error(`Expected todo, got ${t.type}`);
  }

  const todo = t as Todo;

  return {
    name: todo.name || todo.title || '',
    dueDate: todo.due_date || null,
    dueTime: todo.due_time || null,
    details: {
      reminders: todo.reminders || [],
      spaceId: todo.space_id || null,
      notes: todo.notes || '',
      tags: todo.tags || [],
    },
  };
}

/**
 * Map Journal (Note with subtype='journal') from DB to form state
 */
export function mapJournalToForm(j: Note | AppRecord): FormJournal {
  if (j.type !== 'note' || j.subtype !== 'journal') {
    throw new Error(`Expected journal note, got ${j.type}/${j.subtype}`);
  }

  const journal = j as Note;

  return {
    date:
      journal.date || journal.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
    entry: journal.body || '',
    mood: (journal.mood as MoodType) || null,
    details: {
      formatting: journal.fmt || null,
      reminders: journal.reminders || [],
      tags: journal.tags || [],
      spaceId: journal.space_id || null,
    },
  };
}

/**
 * Map Note from DB to form state
 */
export function mapNoteToForm(n: Note | AppRecord): FormNote {
  if (n.type !== 'note') {
    throw new Error(`Expected note, got ${n.type}`);
  }

  const note = n as Note;

  return {
    title: note.title || '',
    body: note.body || '',
    details: {
      formatting: note.fmt || null,
      spaceId: note.space_id || null,
      tags: note.tags || [],
    },
  };
}

/**
 * Map Person from DB to form state
 */
export function mapPersonToForm(p: Person): FormPerson {
  return {
    name: p.display_name || '',
    details: {
      email: p.email || '',
      dates: (p.dates || []).map((d, index) => ({
        id: `date-${index}-${Date.now()}`, // Generate UI id
        date: d.date,
        label: d.label as PersonDate['label'],
      })),
      notes: p.notes || '',
      notesFormatting: p.notes_fmt || null,
      reminders: p.reminders || [],
      spaceId: p.space_id || null,
      tags: p.tags || [],
    },
  };
}
