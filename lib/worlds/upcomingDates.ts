/**
 * Unified upcoming-dates feed for a world. Merges chapter end dates,
 * todo due dates, note target/end/reminder dates from drops linked to
 * the world. Sorted ascending by date. Only returns dates in
 * [today, +90d] so the feed stays actionable.
 */
import type { Chapter } from '../supabase/types';
import type { Todo, Note } from '../types';

export type UpcomingDateKind = 'chapter_end' | 'todo_due' | 'note_event' | 'note_reminder';

export interface UpcomingDate {
  kind: UpcomingDateKind;
  entityId: string;
  entityType: 'chapter' | 'todo' | 'note';
  title: string;
  date: string; // ISO YYYY-MM-DD
  daysFromNow: number;
  label: string; // short display label — "in 3 days", "tomorrow", "today", "2 days ago"
}

function daysBetween(isoDate: string, now: Date): number {
  const d = new Date(isoDate + 'T00:00:00');
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function labelForDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`;
  return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
}

export function buildUpcomingDatesForWorld(
  chapters: Chapter[],
  todos: Todo[],
  notes: Note[],
  now: Date,
): UpcomingDate[] {
  const out: UpcomingDate[] = [];

  for (const c of chapters) {
    if (!c.end_date || c.phase === 'closed') continue;
    const days = daysBetween(c.end_date, now);
    if (days < 0 || days > 90) continue;
    out.push({
      kind: 'chapter_end',
      entityId: c.id,
      entityType: 'chapter',
      title: c.title,
      date: c.end_date,
      daysFromNow: days,
      label: labelForDays(days),
    });
  }

  for (const t of todos) {
    if (!t.due_date || t.completed_at) continue;
    const days = daysBetween(t.due_date, now);
    if (days < -1 || days > 30) continue; // show 1 day overdue + 30d out
    out.push({
      kind: 'todo_due',
      entityId: t.id,
      entityType: 'todo',
      title: t.title || t.name || '(untitled)',
      date: t.due_date,
      daysFromNow: days,
      label: labelForDays(days),
    });
  }

  for (const n of notes) {
    const primary = n.target_date ?? n.reminder_date ?? n.end_date;
    if (!primary) continue;
    const days = daysBetween(primary, now);
    if (days < 0 || days > 30) continue;
    out.push({
      kind: n.reminder_date ? 'note_reminder' : 'note_event',
      entityId: n.id,
      entityType: 'note',
      title: n.title || '(untitled note)',
      date: primary,
      daysFromNow: days,
      label: labelForDays(days),
    });
  }

  out.sort((a, b) => a.daysFromNow - b.daysFromNow);
  return out;
}
