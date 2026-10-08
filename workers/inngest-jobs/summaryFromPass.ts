/**
 * The weekly summary from the weekly pass (data fabric stage 5): the plan the
 * pass made for the week, the records it names, and the figures code works
 * out, worded and checked (summaryPlanWriter.ts).
 *
 * This takes the place of the 21 day fetch, the analyst on Haiku, the
 * observations it saved and the Life Map rebuild: the week is read once, by
 * the weekly pass, and the summary is written from its result.
 *
 * SUMMARY_FROM_PASS says which summary a person on the context pipeline gets:
 *   off     the old summary only (the default)
 *   beside  the old summary is sent, and this one is written beside it and
 *           kept in shadow_runs for James to read (two weekly days)
 *   on      this summary only
 */

import { loadFacts } from './factsLoader';
import { renderInspectionDeck } from './summaryRender';
import {
  PLAN_WRITER_VERSION,
  writePlannedDeck,
  type AskWords,
  type PlannedDeckResult,
} from './summaryPlanWriter';
import type { UserMessage } from './summaryWriter';
import { WORDS_PROMPT_VERSION } from '../shared/check/words.js';
import { asOfToday } from '../shared/factTiming.js';
import type {
  AdaptiveSummaryContent,
  AnalystObservationFull,
  CardShape,
  HardFacts,
  SummaryBrief,
} from './summaryTypes';

type FetchRows = (path: string) => Promise<unknown[]>;
type RunRpc = (fn: string, params: Record<string, unknown>) => Promise<unknown>;

export type SummaryFromPassMode = 'off' | 'beside' | 'on';

export function summaryFromPassMode(env: Record<string, string | undefined>): SummaryFromPassMode {
  const v = String(env.SUMMARY_FROM_PASS || 'off').toLowerCase();
  return v === 'on' || v === 'beside' ? v : 'off';
}

export interface WeeklyPassRun {
  id: string;
  model: string | null;
  prompt_version: string | null;
  status: string;
  input_stats: {
    refs?: Array<[string, Record<string, unknown>]>;
    counts?: Record<string, unknown> | null;
    today?: string;
  } | null;
  output: Record<string, unknown> | null;
}

/**
 * The weekly pass for the week ending on weekEnd: the latest one applied (or,
 * for a summary written beside, one run in shadow too) that has a plan.
 */
export async function loadWeeklyPass(
  fetchRows: FetchRows,
  userId: string,
  weekEnd: string,
  statuses: string[] = ['applied'],
): Promise<WeeklyPassRun | null> {
  const rows = (await fetchRows(
    `synthesis_runs?user_id=eq.${userId}&kind=in.(weekly,catch_up,first_look)&period_end=eq.${weekEnd}` +
      `&status=in.(${statuses.join(',')})&select=id,model,prompt_version,status,input_stats,output` +
      `&order=created_at.desc&limit=5`,
  )) as WeeklyPassRun[];
  return rows.find((r) => r?.output && typeof r.output.summary_plan === 'object') ?? null;
}

interface PlannedCard {
  about?: string;
  /** Everything the card rests on, each by its ref: facts, journal entries, people and counts. */
  refs?: string[];
}

export interface PlanBrief {
  brief: SummaryBrief;
  /** Planned cards that rest only on private or health facts, or on nothing given. */
  dropped: Array<{ about: string; why: string }>;
  /** The people the planned cards name, as their records hold them. */
  people: Array<{ name: string; relationship: string | null }>;
  /** Each planned card that is in the brief, by its id, with the refs it rests on. */
  planned: Array<{ id: string; about: string; refs: string[] }>;
  /** Every date the plan's records carry. */
  dates: string[];
}

/**
 * The plan as the writer's brief. Each planned card becomes one entry, with
 * the records it rests on spelled out. Nothing private or about health is
 * put in front of the writer: a card that rests on any of it is dropped, as is
 * a card that rests on nothing it was given.
 */
export function planBrief(run: WeeklyPassRun, facts: HardFacts, userId: string): PlanBrief {
  const plan = (run.output?.summary_plan ?? {}) as {
    character?: string;
    through_line?: string;
    cards?: PlannedCard[];
  };
  const refs = new Map<string, Record<string, unknown>>(run.input_stats?.refs ?? []);
  // a journal entry a private fact, or one about health, was read from is as
  // private as the fact: its words never reach the writer either
  const privateNotes = privateNotesOf(run);
  const quoteByNote = new Map(
    facts.journal_quotes.filter((q) => q.note_id).map((q) => [q.note_id, q]),
  );
  const observations: AnalystObservationFull[] = [];
  const dropped: PlanBrief['dropped'] = [];
  const people = new Map<string, { name: string; relationship: string | null }>();
  const planned: PlanBrief['planned'] = [];
  const dates = new Set<string>();
  for (const card of Array.isArray(plan.cards) ? plan.cards : []) {
    const about = String(card?.about ?? '').trim();
    const pick = (list: unknown, type: string) =>
      (Array.isArray(list) ? list : [])
        .map((r) => [String(r), refs.get(String(r))] as const)
        .filter(([, v]) => v && v.type === type) as Array<
        readonly [string, Record<string, unknown>]
      >;
    const allFacts = pick(card?.refs, 'fact');
    const open = allFacts.filter(([, f]) => !f.private && !f.health);
    const allMoments = pick(card?.refs, 'journal');
    const moments = allMoments
      .filter(([, j]) => !privateNotes.has(String(j.id)))
      .map(([r, j]) => [r, quoteByNote.get(String(j.id))] as const)
      .filter(([, q]) => q);
    const persons = pick(card?.refs, 'person');
    const counts = pick(card?.refs, 'count');
    const allItems = pick(card?.refs, 'item');
    // a card that rests on anything private or about health may speak of it in
    // what it says it shows, which the writer reads: it is not written at all
    const restsOnPrivate =
      open.length < allFacts.length ||
      allMoments.some(([, j]) => privateNotes.has(String(j.id)) || j.private || j.health) ||
      allItems.some(([, t]) => t.private || t.health) ||
      counts.some(([, c]) => c.private || c.health);
    if (
      !about ||
      restsOnPrivate ||
      (!open.length && !moments.length && !persons.length && !counts.length && !allItems.length)
    ) {
      dropped.push({
        about,
        why: !about
          ? 'it says nothing about what it shows'
          : restsOnPrivate
            ? 'it rests on what is private or about health'
            : 'it rests on nothing it was given',
      });
      continue;
    }
    const id = `p${observations.length + 1}`;
    // a yearly fact on its day as the week has it, a standing one with no date
    const asOfWeek = open.map(
      ([, f]) => asOfToday(f, facts.week.canonical_start) as Record<string, unknown>,
    );
    for (const f of asOfWeek)
      for (const d of [f.about_date, f.about_date_end])
        if (typeof d === 'string') dates.add(d.slice(0, 10));
    // a person with no name recorded is not one the writer can name
    for (const [, p] of persons)
      if (typeof p.name === 'string' && p.name.trim())
        people.set(p.name, {
          name: p.name,
          relationship: (p.relationship as string | null) ?? null,
        });
    observations.push({
      id,
      kind: 'planned_card',
      claim_summary: about,
      evidence_snapshot: {
        facts: asOfWeek.map((f) => ({
          statement: f.statement,
          date: f.about_date ?? null,
          ...(f.about_date_end && f.about_date_end !== f.about_date
            ? { to: f.about_date_end }
            : {}),
          ...(f.every_year ? { every_year: true } : {}),
          state: f.state ?? null,
          // when it was told, so a line about what lies ahead is read from then
          ...(typeof f.observed_at === 'string' ? { recorded: f.observed_at.slice(0, 10) } : {}),
        })),
        moments: moments.map(([, q]) => ({ quote_id: q!.id, date: q!.date })),
        people: persons
          .filter(([, p]) => typeof p.name === 'string' && p.name.trim())
          .map(([, p]) => ({ name: p.name, relationship: p.relationship ?? null })),
        counts: counts.map(([, c]) => ({ line: c.line, paths: c.paths })),
        items: allItems.map(([, t]) => ({
          title: t.title,
          added: t.added ?? null,
          done: t.done ?? null,
          ...(t.due ? { due: t.due } : {}),
        })),
      },
    });
    planned.push({
      id,
      about,
      refs: [...open, ...moments, ...persons, ...counts, ...allItems].map(([r]) => r),
    });
  }
  return {
    brief: {
      source: 'plan',
      user_id: userId,
      week_shape: {
        classification: String(plan.character ?? '').trim(),
        // the plan's line is Gremly's own: the writer finds the deck's own line
        // from the planned cards, so nothing in it reaches the deck unchecked
        dominant_theme: '',
        mood_arc_text: '',
        highlight: '',
        concern: '',
      },
      observations,
      prior_surfaced: [],
    },
    dropped,
    people: [...people.values()],
    planned,
    dates: [...dates],
  };
}

/** The notes that a private fact, or one about health, in the pass's records was read from. */
export function privateNotesOf(run: WeeklyPassRun): Set<string> {
  const out = new Set<string>();
  for (const [, v] of run.input_stats?.refs ?? [])
    if (v?.type === 'fact' && (v.private || v.health) && typeof v.note_id === 'string')
      out.add(v.note_id);
  return out;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The figures, with the plan's people and dates and the week's counts added. */
export function factsForPlan(facts: HardFacts, built: PlanBrief, run: WeeklyPassRun): HardFacts {
  const lookup = { ...facts.week.date_lookup };
  for (const d of built.dates)
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && !lookup[d])
      lookup[d] = WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()];
  const privateNotes = privateNotesOf(run);
  // only the entries the planned cards rest on are put in front of the writer,
  // and never one a private or health fact was read from
  const cited = new Set(
    built.brief.observations.flatMap((o) =>
      ((o.evidence_snapshot as { moments?: Array<{ quote_id: string }> }).moments ?? []).map(
        (m) => m.quote_id,
      ),
    ),
  );
  const counts = run.input_stats?.counts as { habits?: Array<Record<string, unknown>> } | null;
  return {
    ...facts,
    ledger_context: null,
    journal_quotes: facts.journal_quotes.filter(
      (q) => cited.has(q.id) && (!q.note_id || !privateNotes.has(q.note_id)),
    ),
    // a habit marked private or about health keeps its numbers and loses its name
    week_counts: counts
      ? {
          ...counts,
          habits: (counts.habits ?? []).map((h) => (h.private || h.health ? { ...h, name: null } : h)),
        }
      : null,
    week: { ...facts.week, date_lookup: lookup },
    entities: {
      ...facts.entities,
      other_people: built.people.map((p) => ({
        name: p.name,
        ...(p.relationship ? { relationship: p.relationship } : {}),
        source: 'people_record' as const,
      })),
    },
  };
}

export interface SummaryFromPassResult {
  outcome: 'written' | 'no_pass' | 'no_deck';
  content: AdaptiveSummaryContent | null;
  html: string;
  run_id: string | null;
  deck: PlannedDeckResult | null;
  dropped: PlanBrief['dropped'];
  why?: string;
}

/** Their first name and pronouns from person_identity, or nothing when it cannot be read. */
async function whoTheyAre(
  runRpc: RunRpc,
  userId: string,
): Promise<{ first_name: string | null; pronouns: string | null } | null> {
  try {
    const rows = (await runRpc('person_identity', { p_user: userId })) as unknown;
    const r = (Array.isArray(rows) ? rows[0] : rows) as
      | { first_name?: string | null; pronouns?: string | null }
      | undefined;
    return { first_name: r?.first_name || null, pronouns: r?.pronouns || null };
  } catch (err) {
    // said, not hidden: the summary is then written without their name
    console.warn(
      `[ALERT][summaryFromPass] person_identity failed for ${userId}: ${String((err as Error)?.message || err).slice(0, 160)}`,
    );
    return null;
  }
}

/**
 * The summary for one person's week from their weekly pass. Nothing is saved
 * here: the worker saves what this returns, or keeps it beside the old one.
 */
export async function generateSummaryFromPass(params: {
  userId: string;
  weekStart: string;
  weekEnd: string;
  label: string;
  env: Record<string, string>;
  runRpc: RunRpc;
  fetchRows: FetchRows;
  ask: AskWords;
  /** The second reader, asked only when the first says a part does not hold (stage 7). */
  confirm?: AskWords;
  statuses?: string[];
  run?: WeeklyPassRun | null;
  write?: (user: UserMessage) => Promise<Record<string, unknown>>;
}): Promise<SummaryFromPassResult> {
  const { userId, weekStart, weekEnd, label, env, runRpc, fetchRows, ask } = params;
  const run = params.run ?? (await loadWeeklyPass(fetchRows, userId, weekEnd, params.statuses));
  if (!run)
    return { outcome: 'no_pass', content: null, html: '', run_id: null, deck: null, dropped: [] };
  // who they are, as the weekly pass and the morning read it: the writer and
  // the check both need to know who "you" is when the records name them
  const person = await whoTheyAre(runRpc, userId);
  const base = await loadFacts({
    userId,
    canonicalWeekStart: weekStart,
    canonicalWeekEnd: weekEnd,
    runRpc,
    fetchRows,
    useAnalyst: false,
    person,
  });
  const built = planBrief(run, base, userId);
  const facts = factsForPlan(base, built, run);
  const result = await writePlannedDeck(env, built.brief, facts, {
    ask,
    // read on their weekly day, the last day of the week it looks back on
    today: weekEnd,
    person: { first_name: facts.user.name },
    write: params.write,
    confirm: params.confirm,
  });
  if (!result.deck)
    return {
      outcome: 'no_deck',
      content: null,
      html: '',
      run_id: run.id,
      deck: result,
      dropped: built.dropped,
      why: result.none,
    };
  const deck = result.deck;
  // what it showed, so next week's plan can move on from it
  const anchorOf = new Map(
    deck.cards.map((c, i) => [i, c.anchor?.observation_id ?? null] as const),
  );
  const shown = [
    { about: built.brief.week_shape?.classification ?? '', refs: [] as string[] },
    ...deck.cards
      .map((_, i) => built.planned.find((p) => p.id === anchorOf.get(i)))
      .filter((p): p is PlanBrief['planned'][number] => !!p)
      .map((p) => ({ about: p.about, refs: p.refs })),
  ].filter((x) => x.about);
  const content: AdaptiveSummaryContent = {
    content_version: 4,
    generated_for_week: weekStart,
    classification: deck.classification,
    through_line: deck.through_line,
    cards: deck.cards,
    shown,
    pass: {
      run_id: run.id,
      model: run.model,
      prompt_version: run.prompt_version,
      writer_version: PLAN_WRITER_VERSION,
    },
    metadata: {
      deck_size: deck.cards.length,
      card_shapes: deck.cards.map((c) => c.shape as CardShape),
      fill_model: `${result.writer_model} + check`,
      fill_attempts: result.attempts,
      fill_errors: [],
      // what was left out, by part and step; never the words
      review_flags: result.left_out.map((x) => `left out ${x.shape} ${x.key}`),
      run_mode: 'shadow',
      user_tenure_days: facts.user.tenure_days,
      is_first_weekly: facts.user.is_first_weekly,
      fed_days_in_window: facts.fed.days_in_window,
    },
  };
  return {
    outcome: 'written',
    content,
    html: renderInspectionDeck(label, content),
    run_id: run.id,
    deck: result,
    dropped: built.dropped,
  };
}

/** The check's row for public.check_runs: which parts did not pass at once, and how they ended. */
export function summaryCheckRow(
  userId: string,
  weekEnd: string,
  r: PlannedDeckResult,
): Record<string, unknown> {
  const first = r.tries[0];
  const last = r.tries[r.tries.length - 1];
  const keys = new Set(Object.keys(first?.parts ?? {}));
  const leftOut = new Set(r.left_out.map((x) => x.key));
  return {
    user_id: userId,
    job: 'weekly-summary',
    day: weekEnd,
    checked: first?.checked ?? 0,
    sent_back: r.tries.length > 1 ? keys.size + (first?.deck.length ? 1 : 0) : 0,
    left_out: r.left_out.length + (r.deck ? 0 : 1),
    details: [
      ...[...keys].map((k) => ({
        field: `card_${k}`,
        // the opening that fell back to the plan's character is said as such (stage 7)
        outcome: !r.deck || leftOut.has(k) ? 'left_out' : k === '0' && r.hero_fell_back ? 'fell_back' : 'rewritten',
        first: [...new Set((first.parts[k] ?? []).map((p) => p.step))],
        ...(last && last !== first && last.parts[k]
          ? { second: [...new Set(last.parts[k].map((p) => p.step))] }
          : {}),
      })),
      // what the first reader said did not hold and the second said did
      ...(r.held_by_second ?? []).map((k) => ({ field: `card_${k}`, outcome: 'held_by_second', first: ['words'] })),
    ],
    words_prompt_version: WORDS_PROMPT_VERSION,
    model: r.writer_model,
  };
}
