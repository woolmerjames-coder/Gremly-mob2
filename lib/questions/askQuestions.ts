/**
 * Answer some Gremly questions, on Ask Gremly (data fabric stage 4f, the
 * mockup James approved on 8 October): the questions Gremly has open, one at
 * a time, and the one place a tidy up is put to them.
 *
 * Which questions may be asked today is the rule every place that asks keeps
 * to (lib/wrapup/questions.ts askableQuestions, whose numbers a test holds to
 * workers/shared/questionRules.js). The way in shows only when one of them
 * needs an answer or several are waiting (questionsWaiting, the twin of the
 * workers' rule of the same name).
 */

import { supabase } from '../supabase/client';
import { askableQuestions, type WrapQuestion } from '../wrapup/questions';

/** At least this many waiting, or one that needs an answer, and the way in shows (questionRules.js QUESTIONS_ENTRY_AT). */
export const QUESTIONS_ENTRY_AT = 3;

/** What a tidy up proposes, done only on their tap (inngest-jobs context/review.js). */
export interface TidyChange {
  type: 'set_aside' | 'happened';
  fact_ids: string[];
  /** Their yes and their no, as the review wrote them */
  yes: string;
  no: string;
  /** What it holds, in the ledger's words */
  statements: string[];
  /** Every one came from their calendar, which keeps them whatever they answer */
  from_calendar: boolean;
}

export interface AskQuestion extends WrapQuestion {
  /** What it is about in a few words, as the model that asked wrote it */
  topic: string | null;
  /** Where Gremly's versions came from, in a few words, shown under the question */
  why: string | null;
  /** A tidy up's proposal; null for every other question */
  tidy: TidyChange | null;
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** A tidy up's proposal as stored, or null when it is not one this screen can put. */
export function tidyOf(kind: unknown, change: unknown): TidyChange | null {
  if (kind !== 'tidy' || !change || typeof change !== 'object') return null;
  const c = change as Record<string, unknown>;
  const type = c.type === 'set_aside' || c.type === 'happened' ? c.type : null;
  const yes = text(c.yes);
  const no = text(c.no);
  const ids = Array.isArray(c.fact_ids)
    ? c.fact_ids.filter((x): x is string => typeof x === 'string')
    : [];
  if (!type || !yes || !no || !ids.length) return null;
  return {
    type,
    fact_ids: ids,
    yes,
    no,
    // kept in place beside the facts they name, so a tick always names the right one
    statements: ids.map((_, k) => {
      const v = Array.isArray(c.statements) ? c.statements[k] : null;
      return typeof v === 'string' ? v.trim() : '';
    }),
    from_calendar: c.from_calendar === true,
  };
}

/** Every question Gremly has open, oldest first, with what the screen and the rules need. */
export async function fetchAskQuestions(): Promise<AskQuestion[]> {
  const { data, error } = await supabase
    .from('gremly_questions')
    .select(
      'id,kind,question,choices,weight,topic,why,proposed_change,created_at,asked_at,hold_until,record_table,record_id,fact:life_facts(private,health)',
    )
    .in('status', ['open', 'asked'])
    // those that need an answer first, so none is cut off behind older ones
    .order('weight', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(30);
  if (error) throw error;
  const out: AskQuestion[] = [];
  for (const q of (data ?? []) as Record<string, any>[]) {
    // a welcome back's questions travel together, in the brief
    if (q.kind === 'while_away') continue;
    const tidy = tidyOf(q.kind, q.proposed_change);
    // a tidy up this screen cannot put is left for a later build, never half asked
    if (q.kind === 'tidy' && !tidy) continue;
    const f = Array.isArray(q.fact) ? q.fact[0] : q.fact;
    out.push({
      id: q.id,
      kind: q.kind ?? null,
      question: String(q.question || '').trim(),
      choices: Array.isArray(q.choices)
        ? q.choices.filter((c: unknown) => typeof c === 'string')
        : [],
      created_at: q.created_at,
      asked_at: q.asked_at ?? null,
      record_table: q.record_table ?? null,
      record_id: q.record_id ?? null,
      private: !!(f?.private || f?.health),
      hold_until: typeof q.hold_until === 'string' ? q.hold_until.slice(0, 10) : null,
      weight: q.weight === 'needs' || q.weight === 'helps' ? q.weight : null,
      topic: text(q.topic),
      why: text(q.why),
      tidy,
    });
  }
  return out;
}

/** The questions that may be asked on this day, those that need an answer first. Pure. */
export function askQuestionsFor(open: AskQuestion[], day: string): AskQuestion[] {
  return askableQuestions(open, { day, decidedIds: new Set(), askedToday: new Set() });
}

/**
 * Whether Answer some Gremly questions shows, and with what count, from the
 * questions askable today. Pure; the twin of questionRules.js questionsWaiting.
 */
export function questionsWaiting(askable: readonly Pick<WrapQuestion, 'weight'>[]): {
  show: boolean;
  count: number;
  needs: number;
} {
  const needs = askable.filter((q) => q.weight === 'needs').length;
  return { show: needs > 0 || askable.length >= QUESTIONS_ENTRY_AT, count: askable.length, needs };
}
