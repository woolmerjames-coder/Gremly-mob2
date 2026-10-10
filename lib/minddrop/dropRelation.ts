/**
 * dropRelation.ts: a Mind Drop that is about something the user already has.
 *
 * After a drop is classified, the Worker (route minddrop-relate, in
 * workers/cortex/minddropRelate.js) may say the drop is the same as one of
 * their items, a change to one, a detail for one, a todo now done, a habit
 * they did, or an item no longer needed. From the Mind Drop rethink (stages 4
 * and 6) the drop is saved as its own kind and the proposal attaches to it in
 * views.relation; the card asks with its strip, or shows the quiet duplicate
 * line for a same, and Sweep asks the rest (lib/minddrop/asks.ts). An older
 * build held the drop as a note until answered; those still work. Nothing
 * changes until the user taps.
 *
 * This file is pure (types, words and checks), so the store selectors, the
 * card and the tests can use it without the store. What changes things is in
 * relationActions.ts.
 * Authored text follows the house rule: no em or en dashes.
 */
import type { EntityCardChange, EntityCardEntity } from '../types';

export type RelationIntent = 'same' | 'edit' | 'add' | 'complete' | 'logged' | 'remove';

export interface RelationEntity extends EntityCardEntity {
  /** habits: the days logged lately, newest first */
  logged_days?: string[];
  /** habits: one to build, or one to cut out (a slip is never logged) */
  habit_kind?: 'build' | 'break' | null;
}

export interface RelationChange extends EntityCardChange {
  /** a new day that came with a new time: the time changes with it */
  time_from?: string | null;
  time_to?: string | null;
}

/** The change as the model gave it, before it was checked against one item. */
export interface RelationRawChange {
  field?: string | null;
  value?: string | null;
  time?: string | null;
}

interface RelationBase {
  entity: RelationEntity;
  /** other items the model looked at, for "Not that one" */
  others: RelationEntity[];
  confidence: number;
  /** done or logged: the drop says more than that it happened, so it stays as their entry */
  own_entry?: boolean | null;
}

export type DropRelation =
  | (RelationBase & { kind: 'same'; intent: 'same'; extra: string | null })
  | (RelationBase & {
      kind: 'edit';
      intent: 'edit' | 'add' | 'complete' | 'logged';
      change: RelationChange;
    })
  | (RelationBase & { kind: 'remove'; intent: 'remove' })
  | {
      kind: 'choose';
      intent: RelationIntent;
      candidates: RelationEntity[];
      change: RelationRawChange | null;
      value: string | null;
      confidence: number;
      own_entry?: boolean | null;
    };

/** How the drop was classified before it was held, so keeping it files it exactly that way. */
export interface RelationClassified {
  bucket: 'todo' | 'habit' | 'log';
  subtype: string | null;
  habitSubtype: string | null;
  needsClarification: boolean;
  ambiguityType: string | null;
  clarificationQuestion: string | null;
  clarificationOptions: unknown[] | null;
}

/**
 * pending: waiting for a tap. applied: the user said yes. kept: filed as its
 * own item. lapsed: never answered, so let go with both items as they were
 * (Mind Drop rethink stage 6, lib/minddrop/asks.ts).
 */
export type RelationStatus = 'pending' | 'applied' | 'kept' | 'lapsed';

export type HeldRelation = DropRelation & {
  status: RelationStatus;
  classified: RelationClassified;
  /** the closing line once the user said yes */
  summary?: string | null;
  /** the item a yes changed: the one shown, or the one picked from a which one */
  applied_to?: { id: string; type: RelationEntity['type']; title: string } | null;
  /**
   * Where it is asked (Mind Drop rethink stage 4): 'card' when the answer
   * reached the saved item before its card settled, 'sweep' after. Missing on
   * a drop an older build held as a note.
   */
  surface?: 'card' | 'sweep';
};

const INTENTS = new Set(['same', 'edit', 'add', 'complete', 'logged', 'remove']);
const ENTITY_TYPES = new Set(['todo', 'habit', 'note']);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/**
 * What a drop may change on each kind of item; mirrors the Worker. A todo's
 * deadline (target_date) is apart from the day they plan to do it (due_day):
 * this build sends deadlines: true, so the Worker may propose it (final check
 * item 6).
 */
const EDIT_FIELDS: Record<string, string[]> = {
  todo: ['due_day', 'due_time', 'target_date', 'name'],
  note: ['due_day', 'due_time', 'name'],
  habit: ['name', 'frequency'],
};
/** Check-ins older than this are not offered; mirrors RELATE_LOG_WINDOW_DAYS. */
const LOG_WINDOW_DAYS = 14;

function isEntity(e: unknown): e is RelationEntity {
  const x = e as RelationEntity | null;
  return !!x && typeof x.id === 'string' && ENTITY_TYPES.has(x.type) && typeof x.title === 'string';
}

/** The Worker's answer, checked; anything malformed is treated as no relation. */
export function parseRelation(raw: unknown): DropRelation | null {
  const r = raw as Record<string, any> | null;
  if (!r || typeof r !== 'object' || !INTENTS.has(r.intent)) return null;
  const others = Array.isArray(r.others) ? r.others.filter(isEntity) : [];
  const confidence = Number(r.confidence) || 0;
  const ownEntry = typeof r.own_entry === 'boolean' ? r.own_entry : null;
  if (r.kind === 'choose') {
    const candidates = Array.isArray(r.candidates) ? r.candidates.filter(isEntity) : [];
    if (candidates.length < 2) return null;
    return {
      kind: 'choose',
      intent: r.intent,
      candidates,
      change: r.change && typeof r.change === 'object' ? r.change : null,
      value: typeof r.value === 'string' ? r.value : null,
      confidence,
      own_entry: ownEntry,
    };
  }
  if (!isEntity(r.entity)) return null;
  const base = { entity: r.entity, others, confidence };
  if (r.kind === 'same' && r.intent === 'same') {
    return {
      ...base,
      kind: 'same',
      intent: 'same',
      extra: typeof r.extra === 'string' && r.extra.trim() ? r.extra.trim() : null,
    };
  }
  if (r.kind === 'remove' && r.intent === 'remove')
    return { ...base, kind: 'remove', intent: 'remove' };
  if (
    r.kind === 'edit' &&
    r.intent !== 'same' &&
    r.intent !== 'remove' &&
    r.change &&
    typeof r.change.field === 'string' &&
    typeof r.change.to === 'string'
  ) {
    return { ...base, kind: 'edit', intent: r.intent, change: r.change, own_entry: ownEntry };
  }
  return null;
}

export function relationOf(views: unknown): HeldRelation | null {
  const rel = (views as { relation?: HeldRelation } | null | undefined)?.relation;
  return rel && typeof rel === 'object' && rel.classified ? rel : null;
}

/** Waiting for the user: the card asks, or Sweep does. */
export function isRelationPending(views: unknown): boolean {
  return relationOf(views)?.status === 'pending';
}

/**
 * An older build held the drop as a note until it was answered (no surface on
 * its relation): keeping it files it as it was classified. A drop saved by
 * the rethink is already its own kind, so keeping it only marks the answer.
 */
export function keepsHeldNote(rel: HeldRelation): boolean {
  return !rel.surface;
}

/** What the drop would have been, for the chip on its card while it waits. */
export function heldKindOf(rel: HeldRelation): {
  kind: 'todo' | 'habit' | 'note';
  subtype: string | null;
} {
  const c = rel.classified;
  if (c.bucket === 'todo') return { kind: 'todo', subtype: null };
  if (c.bucket === 'habit') return { kind: 'habit', subtype: null };
  return { kind: 'note', subtype: c.subtype };
}

/**
 * Whether the drop stays after a yes. A todo ticked off or a habit logged
 * already records that it happened, so the drop stays only when the relate
 * check found it says more than that (how it went, how they felt). Anything
 * else: a journal entry stays as the user's entry, and the rest was only the
 * ask. A drop held before the check said so keeps the journal rule.
 */
export function keepsDropAfterYes(rel: HeldRelation): boolean {
  if (
    (rel.intent === 'complete' || rel.intent === 'logged') &&
    typeof rel.own_entry === 'boolean'
  ) {
    return rel.own_entry;
  }
  return rel.classified.bucket === 'log' && rel.classified.subtype === 'journal';
}

const quoted = (t: string, n = 30) => `“${t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t}”`;

/** The one line on the drop's card. */
export function relationLine(rel: DropRelation): string {
  if (rel.kind === 'choose') return 'Is this about one you already have? Tap to check';
  const t = quoted(rel.entity.title);
  if (rel.kind === 'same') return 'Looks like one you already have. Tap to check';
  if (rel.kind === 'remove') return `Remove ${t}? Tap to check`;
  if (rel.intent === 'edit' && rel.change.field === 'target_date')
    return `Move the deadline for ${t}? Tap to check`;
  switch (rel.intent) {
    case 'complete':
      return `Mark ${t} done? Tap to check`;
    case 'logged':
      return `Log it for ${t}? Tap to check`;
    case 'add':
      return `Add this to ${t}? Tap to decide`;
    default:
      return `Is this about ${t}? Tap to check`;
  }
}

/** "today’s", "yesterday’s", or the weekday’s, for the day a habit is logged. */
function dayOwn(day: string | null | undefined, today: string | undefined): string {
  if (!day || !today) return 'today’s';
  if (day === today) return 'today’s';
  if (day === addDays(today, -1)) return 'yesterday’s';
  const d = new Date(`${day}T12:00:00Z`);
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `${names[d.getUTCDay()]}’s`;
}

/**
 * The card's question. A yes or no about one item names it, from the item's
 * own title as it is now (`title`), as the prototype does: Log today’s Run?
 * (final check item 23). `day` puts a day in the card's words (Fri), for a
 * deadline moved: Move the deadline for Report to Fri? (final check item 6).
 */
export function relationQuestion(
  rel: DropRelation,
  opts: { title?: string; today?: string; day?: (day: string) => string } = {},
): string {
  if (rel.kind === 'choose') return 'Which one did you mean?';
  if (rel.kind === 'same') return 'Same as this one?';
  if (rel.kind === 'remove') return 'Remove this from your list?';
  const title = (opts.title ?? rel.entity.title ?? '').trim();
  if (rel.intent === 'edit' && rel.change.field === 'target_date') {
    const day = opts.day ? opts.day(rel.change.to) : '';
    const to = day === 'Today' || day === 'Tomorrow' ? day.toLowerCase() : day;
    const what = title || 'this one';
    return to ? `Move the deadline for ${what} to ${to}?` : `Move the deadline for ${what}?`;
  }
  switch (rel.intent) {
    case 'complete':
      return title ? `Mark ${title} done?` : 'Mark this one done?';
    case 'logged':
      return title
        ? `Log ${dayOwn(rel.change.field === 'logged' ? rel.change.to : null, opts.today)} ${title}?`
        : 'Log this for your habit?';
    case 'add':
      return rel.entity.type === 'todo' ? 'Add this to its notes?' : 'Add this to your note?';
    default:
      return 'Is this the one?';
  }
}

/** The two buttons, and the small line under them when there is one. */
export function relationButtons(rel: DropRelation): {
  primary: string;
  secondary: string;
  hint: string | null;
} {
  if (rel.kind === 'same') {
    return {
      primary: 'Keep just one',
      secondary: 'Keep both',
      hint: 'Keeping one keeps the first and adds anything new from this drop to it.',
    };
  }
  if (rel.kind === 'remove') {
    return {
      primary: 'Yes, remove it',
      secondary: 'Keep it',
      hint: 'Nothing goes until you tap, and you can undo it for a few seconds.',
    };
  }
  if (rel.kind === 'choose')
    return { primary: '', secondary: 'None of these, keep it as new', hint: null };
  switch (rel.change.field) {
    case 'due_day':
      return { primary: 'Yes, move it', secondary: 'Not that one', hint: null };
    case 'due_time':
      return { primary: 'Yes, change the time', secondary: 'Not that one', hint: null };
    case 'target_date':
      return { primary: 'Move the deadline', secondary: 'Not that one', hint: null };
    case 'name':
      return { primary: 'Yes, rename it', secondary: 'Not that one', hint: null };
    case 'completed':
      return { primary: 'Yes, mark it done', secondary: 'Not that one', hint: null };
    case 'logged':
      // the prototype's Log it
      return { primary: 'Log it', secondary: 'Not that one', hint: null };
    case 'body_add':
      return {
        primary: rel.entity.type === 'todo' ? 'Add to its notes' : 'Add to note',
        secondary: 'Keep separate',
        hint: null,
      };
    default:
      return { primary: 'Yes, change it', secondary: 'Not that one', hint: null };
  }
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The change a card proposed, as the model gave it, to check against another item. */
export function rawChangeOf(rel: DropRelation): RelationRawChange | null {
  if (rel.kind === 'choose') {
    return rel.change
      ? { ...rel.change, value: rel.change.value ?? rel.value }
      : { value: rel.value };
  }
  if (rel.kind === 'edit') {
    return { field: rel.change.field, value: rel.change.to, time: rel.change.time_to ?? null };
  }
  if (rel.kind === 'same') return { field: 'extra', value: rel.extra };
  return null;
}

/**
 * The change a relation proposes for one item, checked against that item, or
 * null when there is nothing to ask. Mirrors changeFor in the Worker; used
 * when the user picks an item other than the one first shown.
 */
export function changeForEntity(
  intent: RelationIntent,
  entity: RelationEntity,
  raw: RelationRawChange | null,
  todayIso: string,
): RelationChange | null {
  const field = raw?.field ?? null;
  const value = typeof raw?.value === 'string' ? raw.value.trim() : null;
  if (intent === 'edit') {
    if (!field || !EDIT_FIELDS[entity.type]?.includes(field) || !value) return null;
    if ((field === 'due_day' || field === 'target_date') && !DAY.test(value)) return null;
    if (field === 'due_time' && !TIME.test(value)) return null;
    const from =
      field === 'name'
        ? entity.title
        : field === 'frequency'
          ? (entity.frequency ?? null)
          : ((entity as unknown as Record<string, string | null | undefined>)[field] ?? null);
    const time =
      field === 'due_day' && typeof raw?.time === 'string' && TIME.test(raw.time.trim())
        ? raw.time.trim()
        : null;
    const newTime = time && time !== (entity.due_time ?? null) ? time : null;
    if (from && String(from).toLowerCase() === value.toLowerCase() && !newTime) return null;
    const out: RelationChange = {
      field: field as RelationChange['field'],
      from: from ?? null,
      to: field === 'name' ? value.slice(0, 120) : value,
    };
    if (newTime) {
      out.time_from = entity.due_time ?? null;
      out.time_to = newTime;
    }
    return out;
  }
  if (intent === 'add') {
    if (entity.type === 'habit' || !value) return null;
    return { field: 'body_add', from: null, to: value.slice(0, 500) };
  }
  if (intent === 'complete') {
    return entity.type === 'todo' ? { field: 'completed', from: null, to: 'done' } : null;
  }
  if (intent === 'logged') {
    // a slip on a habit to cut out is not a check-in
    if (entity.type !== 'habit' || entity.habit_kind === 'break') return null;
    const day = value && DAY.test(value) ? value : todayIso;
    if (day > todayIso || day < addDays(todayIso, -(LOG_WINDOW_DAYS - 1))) return null;
    if ((entity.logged_days || []).includes(day)) return null;
    return { field: 'logged', from: null, to: day };
  }
  return null;
}

/** Whether an item could take this relation (trims "Not that one" to items that fit). */
export function fitsRelation(
  intent: RelationIntent,
  entity: RelationEntity,
  raw: RelationRawChange | null,
  todayIso: string,
): boolean {
  if (intent === 'same' || intent === 'remove') return true;
  return !!changeForEntity(intent, entity, raw, todayIso);
}
