/**
 * Today's two proposal shapes, read into the change model: chat's item card
 * (EntityCardChange, from cortex entityMatch, the Save items pill and Mind
 * Drop) and the day turn's card (DayChange, from inngest-jobs). The Workers
 * keep sending them as they are; the app reads them here, so one apply, one
 * set of checks and one Undo serve every surface. From step 4 the agent sends
 * the change model's own shape.
 */
import type { DayChange } from '../cortex/CortexClient';
import type { EntityCardChange, EntityCardEntity } from '../types';
import { parseFrequencyStringStrict } from '../habits/frequencyUtils';
import type { Schedule } from './model';

type Raw = Record<string, any>;

const PER = { daily: 'day', weekly: 'week', monthly: 'month' } as const;

/**
 * A habit frequency in the words chat's card carries, as a schedule. Null
 * when the words don't say how often in a way the app tracks: the card then
 * can't apply, rather than changing only the label.
 */
export function scheduleFromWords(words: string | null | undefined): Schedule | null {
  const canon = parseFrequencyStringStrict(words);
  if (!canon) return null;
  return { per: PER[canon.cadence], times: canon.target_per_period };
}

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** Chat's item card as a change. Throws when the change can't be read. */
export function fromEntityCard(entity: EntityCardEntity, change: EntityCardChange): Raw {
  const base = { cid: 'c1', type: entity.type, id: entity.id };
  switch (change.field) {
    case 'due_day':
      return { ...base, op: 'change', fields: { day: change.to } };
    case 'due_time':
      return { ...base, op: 'change', fields: { time: change.to } };
    case 'target_date':
      // a todo's deadline, never the day they plan to do it (final check item 6)
      if (entity.type !== 'todo') throw new Error('That change did not go through.');
      return { ...base, op: 'change', fields: { deadline: change.to } };
    case 'name':
      return { ...base, op: 'change', fields: { name: change.to } };
    case 'frequency': {
      const schedule = scheduleFromWords(change.to);
      if (!schedule)
        throw new Error(
          `I can't set “${change.to}” from here yet. You can change it on the habit.`,
        );
      return { ...base, op: 'change', fields: { schedule } };
    }
    case 'body':
      return { ...base, op: 'change', fields: { text: change.to } };
    case 'body_add':
      return { ...base, op: 'change', fields: { text: { add: change.to } } };
    case 'completed':
      return { ...base, op: 'done' };
    case 'logged':
      return { ...base, op: 'log', days: change.days?.length ? change.days : [change.to] };
    default:
      throw new Error('That change did not go through.');
  }
}

/** One of the day turn's changes as a change. `date` is the thread's day. */
export function fromDayChange(c: DayChange, date: string): Raw {
  const base = { cid: c.cid, type: c.item ?? 'todo', id: c.id ?? null };
  const plan = (kind: string) => ({
    cid: c.cid,
    op: 'plan',
    type: c.item ?? null,
    id: c.id ?? null,
    plan: {
      kind,
      id: c.id,
      item: c.item,
      title: c.title,
      start: c.start ?? null,
      end: c.end ?? null,
      minutes: c.minutes ?? null,
      travel: c.travel === true,
      label: c.label,
    },
  });
  switch (c.kind) {
    case 'create_todo':
      return {
        cid: c.cid,
        op: 'add',
        type: 'todo',
        fields: {
          name: c.title,
          day: c.day ?? date,
          ...(c.start != null ? { time: hhmm(c.start) } : {}),
          ...(c.minutes ? { length: c.minutes } : {}),
        },
      };
    case 'retime':
      // a habit's time today lives in the plan
      if (c.item === 'habit') return plan('plan_move');
      return {
        ...base,
        op: 'change',
        fields: {
          time: hhmm(c.start as number),
          ...(c.day && c.day !== date ? { day: c.day } : {}),
        },
      };
    case 'move_day':
      return { ...base, op: 'change', fields: { day: c.day } };
    case 'rename':
      return { ...base, op: 'change', fields: { name: c.title } };
    case 'complete':
      return c.item === 'habit' ? { ...base, op: 'log', days: [date] } : { ...base, op: 'done' };
    case 'cancel':
      // a habit is never stopped from a chat line: it is skipped today
      return c.item === 'habit' ? { ...base, op: 'skip_today' } : { ...base, op: 'archive' };
    case 'skip_habit':
      return { ...base, type: 'habit', op: 'skip_today' };
    case 'add_block':
    case 'remove_block':
    case 'plan_add':
    case 'plan_remove':
    case 'plan_move':
      return plan(c.kind);
    default:
      throw new Error(`unknown change ${(c as DayChange).kind}`);
  }
}
