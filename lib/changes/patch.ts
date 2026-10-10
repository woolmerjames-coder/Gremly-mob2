/**
 * What a change writes: the store columns for each field of the change model,
 * and what to write back for Undo, read from the item at the moment of the
 * change. Fields that must agree are written together here and nowhere else:
 * a todo's day and the two date fields that follow it, an event's date and
 * time and the copy kept in views, and a habit's schedule (its label, its
 * tracking target and period, and its days), which fixes chat changing only
 * the label.
 */
import { canonicalToFrequencyJson } from '../habits/frequencyUtils';
import { generateDropId } from '../minddrop/ids';
import {
  fieldDef,
  noteKindOf,
  scheduleLabel,
  scheduleOf,
  type ItemType,
  type Schedule,
} from './model';

type Item = Record<string, any>;

export interface LinkOps {
  add: string[];
  remove: string[];
}

export interface FieldWrite {
  /** Columns for the store's update action */
  patch: Record<string, unknown>;
  /** The same columns as they were, for Undo */
  undo: Record<string, unknown>;
  /** An event's date and time, copied into views when the item keeps a copy there */
  viewsCopy: Record<string, unknown>;
  viewsCopyBack: Record<string, unknown>;
  /** Worlds and Chapters to link and unlink */
  links: { worlds?: LinkOps; chapters?: LinkOps };
  /** A habit's new schedule: the tracking target goes through setHabitTarget */
  schedule?: { to: Schedule; from: Schedule };
}

const CADENCE = { day: 'daily', week: 'weekly', month: 'monthly' } as const;

/** Everything a schedule is stored as, so the label, target and days always agree. */
export function scheduleColumns(s: Schedule) {
  const cadence = CADENCE[s.per];
  return {
    cadence,
    target_per_period: s.times,
    frequency: scheduleLabel(s),
    days_active: s.days ?? null,
    frequency_value: s.days
      ? { type: 'days' as const, days: s.days }
      : canonicalToFrequencyJson(cadence, s.times),
  };
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** What one change's fields write to the item, and what Undo writes back. */
export function writeFor(type: ItemType, item: Item, fields: Record<string, any>): FieldWrite {
  const w: FieldWrite = { patch: {}, undo: {}, viewsCopy: {}, viewsCopyBack: {}, links: {} };
  const views = asObject(item.views);
  const set = (column: string, value: unknown) => {
    w.patch[column] = value;
    if (!(column in w.undo)) w.undo[column] = item[column] ?? null;
  };
  const copyToViews = (column: string, value: unknown) => {
    if (type !== 'note' || !(column in views)) return;
    w.viewsCopy[column] = value;
    w.viewsCopyBack[column] = views[column];
  };

  for (const [field, value] of Object.entries(fields)) {
    const def = fieldDef(type, field);
    if (!def) throw new Error(`No field ${field} on a ${type}`);
    switch (def.kind) {
      case 'text': {
        const current = typeof item[def.column] === 'string' ? (item[def.column] as string) : '';
        const next =
          value && typeof value === 'object'
            ? current.trim()
              ? `${current.trimEnd()}\n\n${value.add}`
              : value.add
            : value;
        set(def.column, next);
        if (type === 'todo' && field === 'name') set('title', next);
        break;
      }
      case 'day':
        if (type === 'todo' && field === 'day') {
          set('due_day', value);
          set('due_date', value);
          set('scheduled_date', value);
          // A todo given a day is no longer put off: its own day decides
          // where it shows, so the day it was to come back on is cleared.
          if (value && item.resurface_at) set('resurface_at', null);
        } else {
          set(def.column, value);
          copyToViews(def.column, value);
        }
        break;
      case 'time':
        set(def.column, value);
        copyToViews(def.column, value);
        break;
      case 'minutes':
      case 'enum':
      case 'flag':
        set(def.column, value);
        break;
      case 'note_kind':
        // a plain note is stored as catchall, as Mind Drop saves one
        set(def.column, value === 'note' ? 'catchall' : value);
        break;
      case 'tags': {
        const current = strings(item.tags);
        const next = current
          .filter((t) => !value.remove.includes(t))
          .concat(value.add.filter((t: string) => !current.includes(t)));
        set('tags', next);
        break;
      }
      case 'list': {
        const current: Array<{ id: string; text: string; checked: boolean }> = Array.isArray(
          item.list_items,
        )
          ? item.list_items
          : [];
        const next = current
          .filter((i) => !value.remove.includes(i.id))
          .map((i) =>
            value.tick.includes(i.id)
              ? { ...i, checked: true }
              : value.untick.includes(i.id)
                ? { ...i, checked: false }
                : i,
          )
          .concat(
            value.add.map((text: string) => ({ id: generateDropId(), text, checked: false })),
          );
        set('list_items', next);
        set('has_list', next.length > 0);
        break;
      }
      case 'reminder': {
        const current: Array<{ id: string }> = Array.isArray(item.reminders) ? item.reminders : [];
        const next = current
          .filter((r) => !value.remove.includes(r.id))
          .concat(
            value.add.map((r: { time: string; repeat: string; day?: string; days?: number[] }) => ({
              id: generateDropId(),
              time: r.time,
              frequency: r.repeat,
              ...(r.day ? { date: r.day } : {}),
              ...(r.days ? { days_of_week: r.days } : {}),
            })),
          );
        set('reminders', next);
        break;
      }
      case 'links':
        w.links[field as 'worlds' | 'chapters'] = value;
        break;
      case 'schedule': {
        const cols = scheduleColumns(value);
        w.schedule = { to: value, from: scheduleOf(item) };
        set('frequency', cols.frequency);
        set('days_active', cols.days_active);
        w.patch.frequency_value = cols.frequency_value;
        if (!('frequency_value' in w.undo)) {
          w.undo.frequency_value = item.frequency_value ?? item.frequency_json ?? null;
        }
        break;
      }
      default:
        throw new Error(`No way to write ${field}`);
    }
  }
  // A plain note given a day is an event from then on, as a new note with a
  // day is (createColumns) and as Mind Drop saves one; the week ahead and the
  // calendar read events by their kind. A kind they asked for is kept.
  if (type === 'note' && fields.day && !('kind' in fields) && noteKindOf(item.subtype) === 'note') {
    set('subtype', 'event');
  }
  return w;
}

/** The columns a new item starts with, from the fields of an add or a convert. */
export function createColumns(
  type: ItemType,
  fields: Record<string, any>,
): Record<string, unknown> {
  const w = writeFor(type, {}, fields);
  const cols: Record<string, unknown> = { ...w.patch };
  if (type === 'todo') {
    // the database fills in the title from the name, and the two dates that follow the day
    delete cols.title;
    delete cols.due_date;
    delete cols.scheduled_date;
  }
  if (type === 'habit') {
    Object.assign(cols, scheduleColumns(fields.schedule ?? { per: 'day', times: 1 }));
    cols.subtype = 'start_habit';
  }
  if (type === 'note' && !('kind' in fields)) {
    cols.subtype = cols.target_date ? 'event' : 'catchall';
  }
  return cols;
}
