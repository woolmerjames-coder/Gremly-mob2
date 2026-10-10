/**
 * The item history a change leaves (views.change_log, lib/chat/changeHistory):
 * one line per field, worded from the item as it was and as it will be. A day
 * and a time changed together are one line, as the history has always shown
 * a move. Done and check ins are not history: the item shows those itself.
 */
import { historyDay, historyWhen } from '../chat/changeHistory';
import { noteKindOf, scheduleLabel, scheduleOf, type Change, type ItemType } from './model';
import { listWords, minutesWords, scheduleWords, type NameLookup } from './words';

type Item = Record<string, any>;

export interface HistoryLine {
  field: string;
  from: string | null;
  to: string;
  was: string | null;
  now: string | null;
}

const DAY_COLUMN: Record<ItemType, string | null> = {
  todo: 'due_day',
  habit: null,
  note: 'target_date',
};
const TIME_COLUMN: Record<ItemType, string | null> = {
  todo: 'due_time',
  habit: null,
  note: 'event_time',
};

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

function day(v: unknown): string | null {
  const s = str(v);
  return s ? s.slice(0, 10) : null;
}

function time(v: unknown): string | null {
  const s = str(v);
  return s ? s.slice(0, 5) : null;
}

/** The history lines for one change of fields on one item. */
export function historyLines(
  type: ItemType,
  item: Item,
  fields: Record<string, any>,
  names: NameLookup,
): HistoryLine[] {
  const lines: HistoryLine[] = [];
  const dayCol = DAY_COLUMN[type];
  const timeCol = TIME_COLUMN[type];
  const dayWas = dayCol ? day(item[dayCol]) : null;
  const timeWas = timeCol ? time(item[timeCol]) : null;

  if (dayCol && 'day' in fields) {
    const to: string | null = fields.day;
    const t = 'time' in fields ? fields.time : timeWas;
    lines.push({
      field: 'due_day',
      from: dayWas,
      to: to ?? '',
      was: dayWas ? historyWhen(dayWas, timeWas) : null,
      now: to ? historyWhen(to, t) || null : null,
    });
  } else if (timeCol && 'time' in fields) {
    const to: string | null = fields.time;
    lines.push({
      field: 'due_time',
      from: timeWas,
      to: to ?? '',
      was: timeWas ? historyWhen(dayWas, timeWas) : null,
      now: to ? historyWhen(dayWas, to) || null : null,
    });
  }

  for (const [field, value] of Object.entries(fields)) {
    switch (field) {
      case 'day':
      case 'time':
        break;
      case 'name': {
        const was = str(type === 'note' ? item.title : item.name) ?? str(item.title);
        lines.push({ field: 'name', from: was, to: value, was, now: value });
        break;
      }
      case 'text':
        lines.push(
          value && typeof value === 'object'
            ? { field: 'body_add', from: null, to: value.add, was: null, now: value.add }
            : { field: 'body', from: null, to: '', was: null, now: null },
        );
        break;
      case 'schedule': {
        // in the words the habit showed and will show: its label, or its days
        const was = str(item.frequency) ?? scheduleLabel(scheduleOf(item));
        lines.push({
          field: 'frequency',
          from: was,
          to: scheduleLabel(value),
          was,
          now: value.days ? scheduleWords(value) : scheduleLabel(value),
        });
        break;
      }
      case 'deadline':
      case 'start_day':
      case 'end_day':
      case 'reminder_day': {
        const column = {
          deadline: 'target_date',
          start_day: 'start_date',
          end_day: 'end_date',
          reminder_day: 'reminder_date',
        }[field];
        const was = day(item[column]);
        lines.push({
          field,
          from: was,
          to: value ?? '',
          was: was ? historyDay(was) : null,
          now: value ? historyDay(value) : null,
        });
        break;
      }
      case 'end_time': {
        const was = time(item.end_time);
        lines.push({
          field,
          from: was,
          to: value ?? '',
          was: was ? historyWhen(null, was) : null,
          now: value ? historyWhen(null, value) : null,
        });
        break;
      }
      case 'length': {
        const was = item.time_estimate_minutes ?? null;
        lines.push({
          field,
          from: was == null ? null : String(was),
          to: value == null ? '' : String(value),
          was: was ? minutesWords(was) : null,
          now: value ? minutesWords(value) : null,
        });
        break;
      }
      case 'kind': {
        const was = noteKindOf(item.subtype);
        lines.push({ field, from: was, to: value, was, now: value });
        break;
      }
      case 'part_of_day':
        lines.push({
          field,
          from: str(item.time_window),
          to: value ?? '',
          was: str(item.time_window),
          now: value,
        });
        break;
      case 'reminder': {
        const now = value.add.length
          ? `Reminder added${value.add.length > 1 ? 's' : ''}`
          : 'Reminder taken off';
        lines.push({ field, from: null, to: String(value.add.length), was: null, now });
        break;
      }
      case 'list': {
        const parts: string[] = [];
        if (value.add.length) parts.push(`Added ${listWords(value.add)}`);
        if (value.tick.length) parts.push(`ticked ${value.tick.length}`);
        if (value.untick.length) parts.push(`unticked ${value.untick.length}`);
        if (value.remove.length) parts.push(`took off ${value.remove.length}`);
        const now = parts.join(', ');
        lines.push({
          field,
          from: null,
          to: now,
          was: null,
          now: now.charAt(0).toUpperCase() + now.slice(1),
        });
        break;
      }
      case 'worlds':
      case 'chapters': {
        const parts: string[] = [];
        if (value.add.length)
          parts.push(`Added to ${listWords(value.add.map((id: string) => names(field, id)))}`);
        if (value.remove.length)
          parts.push(
            `taken out of ${listWords(value.remove.map((id: string) => names(field, id)))}`,
          );
        const now = parts.join(', ');
        lines.push({
          field,
          from: null,
          to: now,
          was: null,
          now: now.charAt(0).toUpperCase() + now.slice(1),
        });
        break;
      }
      case 'tags': {
        const parts: string[] = [];
        if (value.add.length) parts.push(`Tagged ${listWords(value.add)}`);
        if (value.remove.length) parts.push(`untagged ${listWords(value.remove)}`);
        const now = parts.join(', ');
        lines.push({
          field,
          from: null,
          to: now,
          was: null,
          now: now.charAt(0).toUpperCase() + now.slice(1),
        });
        break;
      }
      case 'pinned':
      case 'favourite':
        lines.push({ field, from: null, to: String(value), was: null, now: null });
        break;
      default:
        break;
    }
  }
  return lines;
}

/** Whether a change leaves history at all. */
export function leavesHistory(change: Change): boolean {
  return change.op === 'change';
}
