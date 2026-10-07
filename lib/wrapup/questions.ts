/**
 * Gremly's questions in the evening wrap up.
 *
 * Only questions Gremly already has open are asked: never one about
 * something private or about health, one held until a later day, one asked in
 * the last few days or already in today's thread, or one tied to an item the
 * Sweep just decided. These are the rules every place that asks keeps to,
 * held in workers/shared/questionRules.js; a test holds the numbers here to
 * them. Among those Gremly
 * chooses what is worth asking tonight, checked against everything the Sweep
 * settled, and gives each its answers to tap (gremlyWords.ts, step 10 of the
 * agent plan). When he cannot be reached, the oldest two are asked as they
 * are.
 */
import { supabase } from '../supabase/client';
import type { OfferButton } from '../brief/types';
import type { DueCheckIn } from '../repo/weekReviewRepo';
import { WRAP_COPY } from './words';

export interface WrapQuestion {
  id: string;
  question: string;
  choices: string[];
  created_at: string;
  asked_at: string | null;
  /** The item it is about, when it has one */
  record_table: string | null;
  record_id: string | null;
  /** About something they marked private, or about health: never asked here */
  private: boolean;
  /** Not asked before this day (YYYY-MM-DD), or null */
  hold_until?: string | null;
  /**
   * A milestone's check in from their weekly review, asked as a question on
   * its day (lib/wrapup/checkIns.ts). It is not one of Gremly's questions: its
   * answer goes to their journal, and it is settled on the review that keeps it.
   */
  checkin?: DueCheckIn;
}

export const MOST_QUESTIONS = 2;
/** A question skipped or asked this recently waits (the brief's rule, context/daily.js). */
export const ASKED_WAIT_DAYS = 3;

/** Open questions, oldest first, with what the rule needs. */
export async function fetchWrapQuestions(): Promise<WrapQuestion[]> {
  const { data, error } = await supabase
    .from('gremly_questions')
    .select(
      'id,question,choices,created_at,asked_at,hold_until,record_table,record_id,fact:life_facts(private,health)',
    )
    .in('status', ['open', 'asked'])
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) throw error;
  return ((data ?? []) as Record<string, any>[]).map((q) => ({
    id: q.id,
    question: String(q.question || '').trim(),
    choices: Array.isArray(q.choices)
      ? q.choices.filter((c: unknown) => typeof c === 'string')
      : [],
    created_at: q.created_at,
    asked_at: q.asked_at ?? null,
    record_table: q.record_table ?? null,
    record_id: q.record_id ?? null,
    private: (() => {
      const f = Array.isArray(q.fact) ? q.fact[0] : q.fact;
      return !!(f?.private || f?.health);
    })(),
    hold_until: typeof q.hold_until === 'string' ? q.hold_until.slice(0, 10) : null,
  }));
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface PickContext {
  /** The person's day */
  day: string;
  /** Items the Sweep decided tonight */
  decidedIds: ReadonlySet<string>;
  /** Questions already put to them in today's thread */
  askedToday: ReadonlySet<string>;
}

/**
 * The questions that may be asked tonight at all, oldest first: never one
 * about something private or about health, one held until a later day, one
 * already asked today or lately, or one tied to an item the Sweep just
 * decided. Gremly chooses among these (gremlyWords.ts). Pure.
 */
export function askableQuestions(open: WrapQuestion[], ctx: PickContext): WrapQuestion[] {
  const askedSince = addDays(ctx.day, -ASKED_WAIT_DAYS);
  return open
    .filter((q) => q.question && !q.private)
    .filter((q) => !q.hold_until || q.hold_until <= ctx.day)
    .filter((q) => !ctx.askedToday.has(q.id))
    .filter((q) => !q.asked_at || q.asked_at.slice(0, 10) < askedSince)
    .filter((q) => !q.record_id || !ctx.decidedIds.has(q.record_id))
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** The questions to ask tonight by rule, in order: the oldest two that may be asked. Pure. */
export function pickQuestions(open: WrapQuestion[], ctx: PickContext): WrapQuestion[] {
  return askableQuestions(open, ctx).slice(0, MOST_QUESTIONS);
}

/**
 * The question's buttons: its choices, then Something else and Skip. One with
 * no choices is answered by typing, so it only offers that and Skip. The
 * brief's rule for the choices (workers/inngest-jobs/brief/offer.js).
 */
export function questionButtons(choices: string[]): OfferButton[] {
  const clean: string[] = [];
  for (const c of choices || []) {
    const s = String(c || '').trim();
    if (s && s.length <= 40 && !clean.some((x) => x.toLowerCase() === s.toLowerCase())) {
      clean.push(s);
    }
  }
  const answers: OfferButton[] = clean
    .slice(0, 4)
    .map((c, i) => ({ id: `answer_${i}`, label: c, action: 'answer', value: c }));
  return [
    ...answers,
    {
      id: 'answer_other',
      label: answers.length ? WRAP_COPY.questionOther : WRAP_COPY.questionType,
      action: 'answer_other',
    },
    { id: 'skip', label: WRAP_COPY.questionSkip, action: 'skip' },
  ];
}

/** The kind of item a question is about, for the card that shows it. */
export function itemKindOf(table: string | null): 'todo' | 'habit' | 'note' | null {
  if (table === 'todos') return 'todo';
  if (table === 'habits') return 'habit';
  if (table === 'notes') return 'note';
  return null;
}
