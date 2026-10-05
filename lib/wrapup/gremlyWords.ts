/**
 * Gremly's own words in the evening wrap up (step 10 of the agent plan).
 *
 * Where a friend would speak from the day, the wrap up asks Gremly
 * (workers/cortex/wrap/words.js): his first words looking back on the day,
 * the journal question, his reply to what they wrote, the close, and which of
 * his open questions to ask tonight. What he is told is what the app holds
 * about the day and tonight's wrap up. When his words do not come in time,
 * the wrap up says its fixed sentence (words.ts), so the evening never waits
 * long and never stops.
 */
import {
  callWrapWords,
  type WrapMoment,
  type WrapTurnContext,
  type WrapWordsRequest,
  type WrapWordsResponse,
} from '../cortex/CortexClient';
import { ampm, clock } from '../brief/dayCard';
import type { SweepRecapMeta, WrapUpState } from '../brief/types';
import type { SweepRecord } from '../changes/sweep';
import { dayRecordFromStore, meetingsFromStore } from '../plan/storePlan';
import type { WrapNow } from './day';
import { weekdayOf } from './day';
import type { WrapQuestion } from './questions';
import { keptFor } from './state';

/** Habits checked in during the wrap up, by name. */
export interface HabitsTonight {
  logged: string[];
  held: string[];
  notHeld: string[];
}

/** "3 AM", "midnight": when their day ends. */
export function dayEndWords(hour: number): string {
  if (hour === 0) return 'midnight';
  return `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** "9:00 AM Team standup" */
function meetingWords(m: { title: string; start: number }): string {
  return `${clock(m.start)} ${ampm(m.start)} ${m.title}`;
}

/** What one decision on a card came to, in words Gremly reads. */
export function outcomeWords(d: SweepRecord, now: WrapNow): string {
  if (d.out === 'let_go') return 'let go';
  if (d.out === 'left') return 'left for the next Sweep';
  const day = typeof d.fields?.day === 'string' ? d.fields.day : null;
  if (day) {
    if (day === now.tomorrow) return `kept for ${now.words.tomorrow}`;
    if (day === now.day) return 'kept for today';
    return `kept for ${weekdayOf(day) || day}`;
  }
  return 'kept';
}

/** Travel today, from the day record, in words. */
function travelWords(day: string): string {
  try {
    const t = dayRecordFromStore(day).travel;
    if (!t) return '';
    const off = t.departs !== null ? `, setting off at ${clock(t.departs)} ${ampm(t.departs)}` : '';
    return `${t.label || 'travelling'}${off}`;
  } catch {
    return '';
  }
}

export interface WrapFactsInput {
  moment: WrapMoment;
  now: WrapNow;
  /** "8:40 PM" */
  clock: string;
  recap: Omit<SweepRecapMeta, 'type'>;
  /** Cards waiting to be sorted */
  cards: number;
  wrap: WrapUpState | null;
  habits?: HabitsTonight | null;
  entry?: string;
  questions?: WrapQuestion[];
  /** The item each question is about, when it has one */
  aboutOf?: (q: WrapQuestion) => { kind: string; title: string; when?: string } | null;
}

/** What Gremly is told for one moment. Pure apart from reading the day record and calendar. */
export function wrapFacts(i: WrapFactsInput): WrapWordsRequest {
  const { now } = i;
  const w = i.wrap;
  const live = (w?.decisions ?? []).filter((d) => !d.undone_at);
  return {
    moment: i.moment,
    day: now.day,
    weekday: now.words.weekday,
    part: now.words.late ? 'late' : now.words.early ? 'early' : 'evening',
    clock: i.clock,
    day_end: dayEndWords(now.dayEndHour),
    tomorrow_word: now.words.tomorrow,
    recap: {
      counts: i.recap.counts,
      done: i.recap.done,
      missed: i.recap.missed,
      planned: i.recap.planned ?? null,
    },
    meetings: meetingsFromStore(now.day).map(meetingWords).slice(0, 12),
    travel: travelWords(now.day) || undefined,
    cards: i.cards,
    tonight: {
      decisions: live.map((d) => ({ title: d.title, outcome: outcomeWords(d, now) })),
      logged: i.habits?.logged ?? [],
      held: i.habits?.held ?? [],
      not_held: i.habits?.notHeld ?? [],
      journal: w?.journal ?? null,
      path: w?.path ?? null,
    },
    next: {
      meetings: meetingsFromStore(now.tomorrow).map(meetingWords).slice(0, 10),
      lined: keptFor(w, now.tomorrow).slice(0, 10),
    },
    ...(i.entry ? { entry: i.entry } : {}),
    ...(i.questions
      ? {
          questions: i.questions.slice(0, 12).map((q) => {
            const about = i.aboutOf?.(q) ?? null;
            return { id: q.id, question: q.question, ...(about ? { about } : {}) };
          }),
        }
      : {}),
  };
}

/** Ask Gremly for one moment's words. Null when there are none in time. */
export function gremlyWords(req: WrapWordsRequest): Promise<WrapWordsResponse | null> {
  return callWrapWords(req);
}

/** His line, for the moments that are one line. */
export function lineOf(res: WrapWordsResponse | null): string | null {
  return res && 'line' in res && res.line ? res.line : null;
}

/** His reply to a journal entry, and whether it was one at all. */
export function journalOf(
  res: WrapWordsResponse | null,
): { journal: boolean; reply: string } | null {
  return res && 'journal' in res ? res : null;
}

/**
 * Tonight's questions as Gremly chose them, in his words and with his answers
 * to tap, from those that may be asked. Null when he could not choose, so the
 * rule picks.
 */
export function chosenQuestions(
  res: WrapWordsResponse | null,
  askable: WrapQuestion[],
): WrapQuestion[] | null {
  if (!res || !('ask' in res)) return null;
  const byId = new Map(askable.map((q) => [q.id, q]));
  const out: WrapQuestion[] = [];
  for (const a of res.ask) {
    const q = byId.get(String(a?.id));
    if (!q || out.some((x) => x.id === q.id)) continue;
    const question =
      typeof a.question === 'string' && a.question.trim() ? a.question.trim() : q.question;
    const choices = (Array.isArray(a.choices) ? a.choices : []).filter(
      (c): c is string => typeof c === 'string' && !!c.trim(),
    );
    out.push({ ...q, question, choices: choices.length ? choices : q.choices });
    if (out.length >= 2) break;
  }
  return out;
}

/**
 * Tonight's wrap up for a message typed while it is under way: where it is
 * and what was sorted, so Gremly answers knowing it (agent/brief.js
 * readWrap). Null when there is none or it is finished.
 */
export function wrapTurnContext(w: WrapUpState | null, now: WrapNow): WrapTurnContext | null {
  if (!w || w.step === 'done') return null;
  return {
    step: w.step,
    decisions: w.decisions
      .filter((d) => !d.undone_at)
      .map((d) => ({ title: d.title, outcome: outcomeWords(d, now) })),
  };
}
