/**
 * Gremly's questions in the evening wrap up.
 *
 * In this build the app shows questions Gremly already has open, picked by
 * rule: the oldest first, two at most, none he asked in the last few days,
 * none already asked in today's thread, and none tied to an item the Sweep
 * just decided. Deciding what is worth asking tonight, and checking a
 * question against everything the Sweep settled, is Gremly's side (step 10
 * of the agent plan).
 */
import { supabase } from '../supabase/client';
import type { OfferButton } from '../brief/types';
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
  /** About something they marked private: never asked here */
  private: boolean;
}

export const MOST_QUESTIONS = 2;
/** A question skipped or asked this recently waits (the brief's rule, context/daily.js). */
export const ASKED_WAIT_DAYS = 3;

/** Open questions, oldest first, with what the rule needs. */
export async function fetchWrapQuestions(): Promise<WrapQuestion[]> {
  const { data, error } = await supabase
    .from('gremly_questions')
    .select(
      'id,question,choices,created_at,asked_at,record_table,record_id,fact:life_facts(private)',
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
    private: !!(Array.isArray(q.fact) ? q.fact[0]?.private : q.fact?.private),
  }));
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The questions to ask tonight, in order. Pure. */
export function pickQuestions(
  open: WrapQuestion[],
  ctx: {
    /** The person's day */
    day: string;
    /** Items the Sweep decided tonight */
    decidedIds: ReadonlySet<string>;
    /** Questions already put to them in today's thread */
    askedToday: ReadonlySet<string>;
  },
): WrapQuestion[] {
  const askedSince = addDays(ctx.day, -ASKED_WAIT_DAYS);
  return open
    .filter((q) => q.question && !q.private)
    .filter((q) => !ctx.askedToday.has(q.id))
    .filter((q) => !q.asked_at || q.asked_at.slice(0, 10) < askedSince)
    .filter((q) => !q.record_id || !ctx.decidedIds.has(q.record_id))
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, MOST_QUESTIONS);
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
