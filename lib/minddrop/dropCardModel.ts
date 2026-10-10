/**
 * dropCardModel.ts: what the Mind Drop card shows, worked out from the item's
 * own fields (Mind Drop rethink stage 5, look A from the prototype).
 *
 * The card's state follows the fields stage 4 writes, never a timer:
 * - landed: the drop is in the queue and not yet sorted (your words, a
 *   breathing dot, three waiting dots);
 * - sorted: the kind is known (`bucket_confirmed` on a queued drop, or a saved
 *   row at `minddrop_stage` 'saved');
 * - settled: the saved row at 'settled' (or an older row with no stage, or one
 *   an older build marked enriched).
 *
 * The meta line, in order: the kind word, when, how long, how often (a habit),
 * the mood (a journal), and where it lives (stage 9). People and tags are not
 * on the card (decided 9 October). Every part after the kind word arrives at
 * the settle.
 *
 * Pure: no React, so the card and its tests share it.
 */
import type { UnifiedDrop } from '../../types/UnifiedDrop';
import { getDateService } from '../date/DateService';
import { formatDay } from '../chat/dayWords';
import { MOOD_CONFIG, type Mood } from '../shared/moods';
import { plannedDayOf } from '../../workers/shared/todoDay';
import { asksOf, isAskLive, keptForSweep } from './asks';
import { relationOf } from './dropRelation';

export type DropCardKind = 'todo' | 'habit' | 'event' | 'journal' | 'idea' | 'note' | 'ask';
export type DropCardStage = 'landed' | 'sorted' | 'settled';
export type MetaIcon =
  | 'calendar'
  | 'clock'
  | 'repeat'
  | 'sunrise'
  | 'sunset'
  | 'heart'
  | 'compass'
  | 'sticky-note'
  | 'moon'
  | 'check'
  | 'notebook-pen';

export interface MetaPart {
  key: 'when' | 'long' | 'often' | 'starts' | 'mood' | 'where' | 'kept' | 'sweep' | 'outcome';
  icon: MetaIcon | null;
  text: string;
}

export const KIND_WORDS: Record<DropCardKind, string> = {
  todo: 'Todo',
  habit: 'Habit',
  event: 'Event',
  journal: 'Journal',
  idea: 'Idea',
  note: 'Note',
  ask: 'One quick question',
};

/** The kind's wash (tile) and ink (icon and kind word), from the prototype. */
export const KIND_COLORS: Record<DropCardKind, { wash: string; ink: string }> = {
  todo: { wash: '#EAF2E8', ink: '#2E5540' },
  habit: { wash: '#ECEEFA', ink: '#454A86' },
  event: { wash: '#F8EDE4', ink: '#9A6232' },
  journal: { wash: '#F3E8EF', ink: '#7A4467' },
  idea: { wash: '#F6EDD2', ink: '#6E5413' },
  note: { wash: '#EFEDE6', ink: '#55605A' },
  ask: { wash: '#EEF4EC', ink: '#2E5540' },
};

type CardItem = Partial<UnifiedDrop> & { views?: Record<string, any> | null };

/** The item asks a question that is still open (column or views, both are written). */
export function hasOpenQuestion(item: CardItem): boolean {
  const views = item.views || {};
  const asks = item.needs_clarification === true || views.needs_clarification === true;
  const resolved = item.clarification_resolved === true || views.clarification_resolved === true;
  return asks && !resolved;
}

/**
 * What the card calls the item. Notes map by subtype; general and catchall
 * are a Note. One quick question while its question is live on the card
 * (lib/minddrop/asks.ts); after Not now, or once it has lapsed, the card is
 * the kind it was saved as.
 */
export function dropCardKind(item: CardItem): DropCardKind {
  const clarify = asksOf(item).find((a) => a.kind === 'clarify');
  if (clarify && clarify.onCard && isAskLive(clarify)) return 'ask';
  if (item.kind === 'todo') return 'todo';
  if (item.kind === 'habit') return 'habit';
  const sub = item.noteSubtype;
  if (sub === 'event' || sub === 'journal' || sub === 'idea') return sub;
  return 'note';
}

/** Where the card is: landed, sorted or settled (see the header). */
export function dropCardStage(item: CardItem, isPending: boolean): DropCardStage {
  const views = item.views || {};
  if (isPending) return views.bucket_confirmed === true ? 'sorted' : 'landed';
  const stage = views.minddrop_stage;
  // an answer being filed: the details are on their way
  if (views.clarification_processing === true || views.ai_pending === true) return 'sorted';
  if (stage === 'saved' || stage === 'pending' || stage === 'enriching' || stage === 'streaming') {
    return 'sorted';
  }
  return 'settled';
}

/**
 * The new title differs from the drop's own words only by the first capital
 * (or not at all): the card shows it at once, with no crossfade.
 */
export function onlyCapitalDiffers(raw: string, title: string): boolean {
  const a = (raw || '').trim();
  const b = (title || '').trim();
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.slice(1) === b.slice(1) && a[0].toLowerCase() === b[0].toLowerCase();
}

/** How long: "5 min", "About 45 min", "About 2 hrs". */
export function estimateWords(minutes: number | null | undefined): string | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return null;
  const m = Math.round(minutes);
  if (m < 10) return `${m} min`;
  if (m < 60) return `About ${m} min`;
  const hours = Math.round((m / 60) * 2) / 2;
  return hours === 1 ? 'About 1 hr' : `About ${hours} hrs`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A day: Today, Tomorrow, Fri (within the week ahead), or Thu 22 Oct. */
export function dayWords(day: string | null | undefined): string {
  if (!day) return '';
  const ds = getDateService();
  const d = day.slice(0, 10);
  if (ds.isToday(d)) return 'Today';
  if (ds.isTomorrow(d)) return 'Tomorrow';
  const ahead = ds.daysBetween(ds.today(), d);
  if (ahead > 1 && ahead < 7) {
    const date = ds.fromLocalDate(d);
    if (date) return WEEKDAYS[date.getDay()];
  }
  return formatDay(d);
}

/** A time: 7:30pm, or 3pm on the hour. */
export function timeWords(time: string | null | undefined): string {
  if (!time) return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return '';
  const h = parseInt(m[1], 10);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m[2] === '00' ? `${h12}${suffix}` : `${h12}:${m[2]}${suffix}`;
}

const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** When: the day it is planned for (with its time), its deadline, or No date yet. */
export function whenWords(item: CardItem, kind: DropCardKind): string | null {
  if (kind === 'todo') {
    const planned = plannedDayOf(item);
    if (planned) {
      const time = timeWords(item.due_time);
      return time ? `${dayWords(planned)}, ${time}` : dayWords(planned);
    }
    const deadline = (item.target_date || '').slice(0, 10);
    if (deadline) {
      const ds = getDateService();
      if (ds.daysBetween(ds.today(), deadline) < 0) return 'Overdue';
      const day = dayWords(deadline);
      return `Due ${day === 'Today' || day === 'Tomorrow' ? lowerFirst(day) : day}`;
    }
    return 'No date yet';
  }
  if (kind === 'event') {
    const day = (item.target_date || '').slice(0, 10);
    if (!day) return null;
    const time = timeWords(item.event_time);
    return time ? `${dayWords(day)}, ${time}` : dayWords(day);
  }
  return null;
}

/** How often, for a habit, from what was saved (its days, or its cadence and part of the day). */
export function howOftenWords(item: CardItem): { text: string; icon: MetaIcon } | null {
  const days = Array.isArray(item.days_active)
    ? [...new Set(item.days_active.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
    : [];
  if (days.length > 0 && days.length < 7) {
    return {
      text: days
        .sort((a, b) => a - b)
        .map((d) => WEEKDAYS[d])
        .join(', '),
      icon: 'repeat',
    };
  }
  const cadence = item.cadence;
  const n = item.target_per_period ?? 1;
  if (cadence === 'weekly') {
    if (n >= 7) return everyDay(item);
    return { text: n === 1 ? 'Once a week' : `${n} times a week`, icon: 'repeat' };
  }
  if (cadence === 'monthly') {
    return { text: n === 1 ? 'Once a month' : `${n} times a month`, icon: 'repeat' };
  }
  if (cadence === 'daily') {
    return n > 1 ? { text: `${n} times a day`, icon: 'repeat' } : everyDay(item);
  }
  return null;
}

function everyDay(item: CardItem): { text: string; icon: MetaIcon } {
  if (item.time_window === 'morning') return { text: 'Every morning', icon: 'sunrise' };
  if (item.time_window === 'evening') return { text: 'Every evening', icon: 'sunset' };
  return { text: 'Every day', icon: 'repeat' };
}

/** A habit that starts on a day ahead: Starts tomorrow, Starts Fri. */
export function startsWords(item: CardItem): string | null {
  const start = (item.start_date || '').slice(0, 10);
  if (!start) return null;
  const ds = getDateService();
  if (ds.daysBetween(ds.today(), start) <= 0) return null;
  return `Starts ${lowerFirst(dayWords(start))}`;
}

/** The mood of a journal entry, in its own words. */
export function moodWords(item: CardItem): string | null {
  const moods = Array.isArray(item.mood) ? item.mood : [];
  const words = moods
    .filter((m): m is Mood => typeof m === 'string' && !!m.trim())
    .map((m) => MOOD_CONFIG[m as Mood]?.label ?? m.trim()[0].toUpperCase() + m.trim().slice(1));
  return words.length ? words.join(', ') : null;
}

/** What a relation answer left on a journal entry that stays: Logged to Run, or Kept as a journal entry. */
function outcomePart(item: CardItem, kind: DropCardKind): MetaPart | null {
  if (kind !== 'journal') return null;
  const rel = relationOf(item.views);
  if (!rel) return null;
  if (rel.status === 'applied' && rel.intent === 'logged' && rel.kind !== 'choose') {
    return { key: 'outcome', icon: 'check', text: `Logged to ${rel.entity.title}` };
  }
  if (rel.status === 'kept') {
    return { key: 'outcome', icon: 'notebook-pen', text: 'Kept as a journal entry' };
  }
  return null;
}

/**
 * The parts of the meta line after the kind word, in order. A question sent
 * off the card with Not now reads Kept as it is and Sweep will ask again
 * until it is answered or lets go (Mind Drop rethink stage 6).
 */
export function metaParts(item: CardItem, kind: DropCardKind): MetaPart[] {
  const parts: MetaPart[] = [];
  if (keptForSweep(item)) {
    return [
      { key: 'kept', icon: 'sticky-note', text: 'Kept as it is' },
      { key: 'sweep', icon: 'moon', text: 'Sweep will ask again' },
    ];
  }
  if (kind === 'ask') return parts;
  const outcome = outcomePart(item, kind);
  if (outcome) parts.push(outcome);
  const when = whenWords(item, kind);
  if (when) parts.push({ key: 'when', icon: 'calendar', text: when });
  if (kind === 'todo' || kind === 'habit') {
    const long = estimateWords(item.time_estimate_minutes);
    if (long) parts.push({ key: 'long', icon: 'clock', text: long });
  }
  if (kind === 'habit') {
    const often = howOftenWords(item);
    if (often) parts.push({ key: 'often', icon: often.icon, text: often.text });
    const starts = startsWords(item);
    if (starts) parts.push({ key: 'starts', icon: null, text: starts });
  }
  if (kind === 'journal') {
    const mood = moodWords(item);
    if (mood) parts.push({ key: 'mood', icon: 'heart', text: mood });
  }
  return parts;
}

/** One label for the whole card: the kind, the title and the meta line. */
export function cardAccessibilityLabel(
  kind: DropCardKind,
  title: string,
  parts: MetaPart[],
  stage: DropCardStage,
): string {
  if (stage === 'landed') return `${title}. Gremly is sorting it.`;
  const meta = stage === 'settled' ? parts.map((p) => p.text) : [];
  return [KIND_WORDS[kind], title, ...meta].filter(Boolean).join('. ');
}

/** "Every morning" reads "every morning" mid sentence; "Mon, Wed, Fri" keeps its capitals. */
function inSentence(text: string): string {
  return /^(Every|Once|Starts|Due|Overdue|No date)\b/.test(text) ? lowerFirst(text) : text;
}

/**
 * An item they already have, in a few words for the middle of a sentence
 * (the quiet duplicate line, and the item row in a relation strip): due
 * today, due Fri, overdue, no date yet, every morning, 3 times a week, Fri,
 * 7:30pm, added today.
 */
export function itemStateWords(item: CardItem, type: 'todo' | 'habit' | 'note'): string | null {
  if (type === 'habit') {
    const often = howOftenWords(item);
    return often ? inSentence(often.text) : null;
  }
  if (type === 'todo') {
    const planned = plannedDayOf(item);
    if (planned) {
      const ds = getDateService();
      if (ds.daysBetween(ds.today(), planned) < 0) return 'overdue';
      const day = dayWords(planned);
      return `due ${day === 'Today' || day === 'Tomorrow' ? lowerFirst(day) : day}`;
    }
    const when = whenWords(item, 'todo');
    return when ? inSentence(when) : null;
  }
  // a store note carries its subtype as subtype, a drop card's as noteSubtype
  const sub = item.noteSubtype ?? (item as { subtype?: string | null }).subtype;
  if (sub === 'event') {
    const views = item.views || {};
    const when = whenWords(
      {
        target_date: item.target_date ?? views.target_date ?? null,
        event_time: item.event_time ?? views.event_time ?? null,
      },
      'event',
    );
    if (when) {
      return when.startsWith('Today') || when.startsWith('Tomorrow')
        ? lowerFirst(when)
        : `on ${when}`;
    }
  }
  const ds = getDateService();
  const added = ds.dayOf(item.created_at ?? null);
  if (!added) return null;
  const ago = ds.daysBetween(added, ds.today());
  if (ago <= 0) return 'added today';
  if (ago === 1) return 'added yesterday';
  if (ago < 7) {
    const date = ds.fromLocalDate(added);
    if (date) return `added ${WEEKDAYS[date.getDay()]}`;
  }
  return `added ${formatDay(added)}`;
}
