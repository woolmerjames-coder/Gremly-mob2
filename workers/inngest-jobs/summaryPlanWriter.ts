/**
 * The weekly summary written from the weekly pass's plan (data fabric stage 5).
 *
 * The weekly pass (context/weekly.js) reads the week once and plans the deck:
 * the week's character, the line through it, and the cards it wants, each
 * with the facts, journal entries, people and counts behind it. Here that plan
 * is worded into a deck and checked:
 *
 *  1. The writer words the plan (Sonnet 5.5 unless SUMMARY_WRITER_MODEL says
 *     another model, on any provider).
 *  2. Code checks the deck as before (summaryWriter.ts factCheckDeterministic):
 *     its shape, every source it cites, every date, number, weekday and quote.
 *  3. The shared check's one question (workers/shared/check/words.js) is asked
 *     of each card, and of each paragraph of the letter, with only the records
 *     it cites: does it say anything about who someone is, when something is,
 *     or how many, that those records do not hold? This replaces the advice
 *     only checker on Haiku.
 *  4. A deck with problems is written again once, told what was wrong. What is
 *     still wrong after that is left out: a middle card, or a paragraph of the
 *     letter. A hero that is still wrong means no deck at all: blank is better
 *     than wrong, and a blank deck is never sent.
 *
 * The pieces are exported one by one, so a replay can run them where each
 * model can be reached (scripts/summary-replay).
 */

import { CARE_RULES } from './careRules';
import {
  WRITER_SCHEMA_REFERENCE,
  callAnthropic,
  factCheckDeterministic,
  sanitizeDeckProse,
  type UserMessage,
} from './summaryWriter';
import { jsonCall } from './context/llm';
import { weekCountLines } from './context/weekCounts';
import { wordsRequest, wordsProblem } from '../shared/check/words.js';
import type { Card, Deck, HardFacts, SummaryBrief, SourceRef } from './summaryTypes';

export const PLAN_WRITER_VERSION = 'summary-plan-2026-10-15f';
const DEFAULT_WRITER_MODEL = 'claude-sonnet-5-5';

// ── The writer ─────────────────────────────────────────────────────────────

export const PLAN_WRITER_SYSTEM = `You write the weekly summary deck for one person who uses Gremly, a companion app. They open it on purpose at the end of their week to look back on it.

${CARE_RULES}

Gremly's weekly pass has already read the week and planned the deck: the week's character, the line that runs through it, and the cards it wants between the opening and the closing note, each with the records behind it. You word that plan. You do not add cards, leave any out or change their order, and each card says only what its records hold.

THE DECK
- The first card is the hero. It names the week's character and carries the week's figures. Then come the planned cards, in the plan's order, and last a short letter from their Gremly that brings the named threads together.
- For each planned card, choose the shape that lets its strongest element lead: a quote they wrote, one number, the people in it, a short list, a few dated moments, or a question the week leaves open. Cite the planned card by its id in the card's anchor and in its sources, with the records each part rests on.
- A person is named only as the planned card's records name them, and described only as those records describe them, given no pronoun or gender their records do not give. When who they are to the person is not recorded, it is left out.
- Figures come from the hard facts and the week's counts, cited by their path. A count is never a judgement of how they did.
- A quote is their own words, exactly as written in the journal entries given.
- Nothing private or about their health is in what you are given, and the deck never speaks of it, in any words, even where the week turned on it. The hero is the first thing seen when the summary opens, and others may see it too.
- The hero names what the week was like without saying more about its days than the records show: nothing about every day or the whole week that the records do not bear out.
- A record holds what it says as of the day it was recorded, which is not always the day it is about. Something recorded as planned is said as planned, even once its day has passed, unless a record says it happened.

HOW IT READS
- Second person, direct and warm. Never address them by their own name. The companion is their Gremly, with a capital G.
- Nothing tells them what to do or how to feel, the word should is never used, and the letter closes without asking anything of them.
- The deck speaks of their week as the records show it, and says nothing of Gremly itself: where it was, what it did or what it will do. It never speaks of records, of the app or of how Gremly knows what it says.
- It is read on the last day of the week it looks back on, so it never says whether that week is over or still going.
- Nothing counts days in a row, and nothing left undone is framed as a failing.
- Prose never names a day of the week: a date is written as a month and day, and the day of the week appears only in the fields that echo it from the input.
- No dashes as punctuation.
- image_hint is a few broad scenic or textural words for a stock photo matched to the card's tone, never a person, an activity or an object.

Output JSON only, matching the schema below.`;

/** The schema reference, read for a deck written from the plan. */
export function planSchemaReference(): string {
  return WRITER_SCHEMA_REFERENCE.replace(
    '"classification": "<EXACT classification string from the brief>",',
    '"classification": "<the week\'s character in a few words, from the plan\'s, as the records bear it out>",',
  )
    .replace(
      'classification_chip: the classification echoed as a small chip,',
      'classification_chip: the classification, as a small chip,',
    )
    .replace(
      '/* cards 2..N-1: 2 to 5 middle cards from {moment, people, pattern, question, stat, timeline} */',
      "/* then one card for each planned card, in the plan's order, each one of {moment, people, pattern, question, stat, timeline} */",
    )
    .replace(
      '{ "type": "observation",   "id": "<analyst observation UUID present in inputs>" }',
      '{ "type": "observation",   "id": "<the id of a planned card, as given>" }',
    )
    .replace(
      'source_observation_id: optional; the analyst observation that surfaced this quote,',
      'source_observation_id: the id of the planned card this is,',
    )
    .replace(
      'sources: SourceRef array; the analyst observations the synthesis draws from',
      'sources: SourceRef array; the planned card and the records it draws from',
    )
    .replace(
      '"observation_id": "<uuid from observations OR null>"',
      '"observation_id": "<the id of the planned card>"',
    )
    .replace(
      'an observation id must be in the analyst observations list',
      'an observation id must be the id of a planned card',
    )
    .replace(
      `If you cannot honestly produce a deck because critical context is missing, return:
  { "classification": "<from brief or ''>", "through_line": "insufficient data", "cards": [], "surfaced_anchors": [] }`,
      'The plan always has enough to write from: a deck is always written, with fewer words where the records are few.',
    );
}

const json = (v: unknown): string => JSON.stringify(v, null, 0);

/** What the writer is given: the plan, its records, and the figures code worked out. */
export function buildPlanWriterPrompt(brief: SummaryBrief, facts: HardFacts): string {
  const out: string[] = [];
  out.push(`ABOUT THEM:
- pronouns: ${facts.user.pronouns ?? '(not given)'}
- gremly_level: ${facts.user.gremly_level}
- first weekly summary: ${facts.user.is_first_weekly}`);
  out.push(`THE WEEK: ${facts.week.display_start} to ${facts.week.display_end}, ${facts.week.days_in_display} days.

DATE LOOKUP (every date in the input, with its day of the week):
${json(facts.week.date_lookup)}`);
  out.push(`WHO IS WHO (name people only from here; the person is never addressed by their own name):
${JSON.stringify(facts.entities, null, 2)}`);
  out.push(`THE PLAN (from Gremly's weekly pass):
- character: ${JSON.stringify(brief.week_shape?.classification ?? '')}`);
  const cards = brief.observations.map(
    (o) =>
      `  id: ${o.id}\n  about: ${JSON.stringify(o.claim_summary)}\n  records: ${json(o.evidence_snapshot)}`,
  );
  out.push(
    `PLANNED CARDS, IN ORDER (cite each by its id):\n${cards.join('\n\n') || '  (none: the deck is the hero and the letter)'}`,
  );
  out.push(`HARD FACTS (each cited by its path: the section and field names below, joined by dots):

mood_arc:
${json(facts.mood_arc)}

day_by_day_activity:
${json(facts.day_by_day)}

fed:
- days_in_window: ${facts.fed.days_in_window}
- target: ${facts.fed.target}

totals:
- drops: ${facts.totals.drops}
- journals: ${facts.totals.journals}
- todos_completed: ${facts.totals.todos_completed}

durations (use these as they are):
- days_since_onboarding: ${facts.durations.days_since_onboarding}
- days_since_last_fed: ${facts.durations.days_since_last_fed ?? '(no fed day recorded)'}

week_counts (worked out by code; each cited by its path, starting week_counts and following the names below, joined by dots):
${facts.week_counts ? JSON.stringify(facts.week_counts, null, 2) : '(not counted this week)'}

journal_quotes (their own words; a moment card's quote must be part of one of these exactly, cited by id):
${json(facts.journal_quotes)}`);
  out.push(planSchemaReference());
  return out.join('\n\n');
}

/**
 * One call to the writer. Claude models go to Anthropic with the system
 * prompt cached; any other model goes through the context pipeline's call
 * (OpenAI or Gemini) as plain JSON.
 */
export async function callPlanWriter(
  env: Record<string, string>,
  user: UserMessage,
): Promise<Record<string, unknown>> {
  const spec = env.SUMMARY_WRITER_MODEL || DEFAULT_WRITER_MODEL;
  const [provider, model] = spec.includes(':')
    ? spec.split(':')
    : [
        spec.startsWith('claude-') ? 'anthropic' : spec.startsWith('gemini-') ? 'google' : 'openai',
        spec,
      ];
  if (provider === 'anthropic')
    return callAnthropic(env.ANTHROPIC_API_KEY, model, PLAN_WRITER_SYSTEM, user, 6000, 0.4);
  const text =
    typeof user === 'string' ? user : [user.cached, user.rest].filter(Boolean).join('\n\n');
  const r = await jsonCall(env, {
    primary: { provider, model },
    fallback: null,
    schema: undefined,
    system: PLAN_WRITER_SYSTEM,
    user: text,
    maxTokens: 12000,
    effort: 'medium',
    thinking: 'low',
  });
  return r.output as Record<string, unknown>;
}

export function planWriterModel(env: Record<string, string>): string {
  return env.SUMMARY_WRITER_MODEL || DEFAULT_WRITER_MODEL;
}

// ── The check ──────────────────────────────────────────────────────────────

export interface WordsAnswer {
  not_held?: boolean;
  what?: string | null;
}
export type AskWords = (req: {
  system: string;
  user: string;
  schema: unknown;
}) => Promise<WordsAnswer | null>;

/** One part of the deck the words question is asked of: a card, or one paragraph of the letter. */
export interface DeckPart {
  key: string;
  card: number;
  paragraph: number | null;
  text: string;
  sources: SourceRef[];
}

export interface PartProblem {
  step: 'code' | 'words' | 'unasked';
  say: string;
}

export interface DeckCheck {
  /** Problems with the deck as a whole, which no single card accounts for. */
  deck: string[];
  /** Problems by part key ('3', or '5.p1' for a letter paragraph). */
  parts: Map<string, PartProblem[]>;
  checked: number;
  /** The record lines each part was checked against, for a card sent back alone. */
  records?: Map<string, string[]>;
  /** Parts the first reader said did not hold and the second said did (stage 7). */
  held_by_second?: string[];
}

function proseOf(value: unknown, skip: Set<string>, out: string[]): void {
  if (typeof value === 'string') {
    if (value.trim()) out.push(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) proseOf(v, skip, out);
    return;
  }
  if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (skip.has(k)) continue;
      proseOf(v, skip, out);
    }
}

// fields that are not Gremly's words: what it cites, what the UI echoes, and photo search terms
const NOT_PROSE = new Set([
  'source',
  'sources',
  'source_journal_quote_id',
  'source_observation_id',
  'image_hint',
  'day_of_week',
  'mood_arc',
  'valence',
  'signature',
  'anchor',
  'shape',
  'quote',
  'date',
]);

/** What a part holds when a value code could not find is laid on it: its words and its dates. */
const OWNED_SKIP = new Set([...NOT_PROSE].filter((k) => k !== 'date'));

function sourcesIn(value: unknown, out: SourceRef[]): void {
  if (Array.isArray(value)) {
    for (const v of value) sourcesIn(v, out);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const o = value as Record<string, unknown>;
  if (
    typeof o.type === 'string' &&
    ['observation', 'journal_quote', 'hard_fact', 'date'].includes(o.type)
  )
    out.push(o as unknown as SourceRef);
  for (const [k, v] of Object.entries(o)) {
    if (k === 'source_journal_quote_id' && typeof v === 'string')
      out.push({ type: 'journal_quote', id: v } as unknown as SourceRef);
    else if ((k === 'source_observation_id' || k === 'observation_id') && typeof v === 'string')
      out.push({ type: 'observation', id: v });
    else if (v && typeof v === 'object') sourcesIn(v, out);
  }
}

/** The parts of a deck the words question is asked of, each with the sources it cites. */
export function deckParts(deck: unknown): DeckPart[] {
  const cards = ((deck as { cards?: unknown[] })?.cards ?? []) as Array<Record<string, unknown>>;
  const parts: DeckPart[] = [];
  cards.forEach((card, i) => {
    if (!card || typeof card !== 'object') return;
    const head: string[] = [];
    proseOf(card.eyebrow, NOT_PROSE, head);
    proseOf(card.headline, NOT_PROSE, head);
    if (card.shape === 'letter') {
      const paras = ((card.body as { paragraphs?: unknown[] })?.paragraphs ?? []) as Array<{
        text?: string;
        sources?: unknown;
      }>;
      paras.forEach((p, j) => {
        const sources: SourceRef[] = [];
        sourcesIn(p?.sources, sources);
        parts.push({
          key: `${i}.p${j}`,
          card: i,
          paragraph: j,
          text: [j === 0 ? head.join('. ') : '', String(p?.text || '').trim()]
            .filter(Boolean)
            .join('. '),
          sources,
        });
      });
      return;
    }
    const text: string[] = [...head];
    proseOf(card.body, NOT_PROSE, text);
    const sources: SourceRef[] = [];
    sourcesIn(card, sources);
    parts.push({ key: String(i), card: i, paragraph: null, text: text.join('. '), sources });
  });
  return parts;
}

function valueAt(facts: HardFacts, path: string): unknown {
  let cur: unknown = facts;
  for (const part of path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

const clip = (s: unknown, n: number): string => {
  const t = String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/** The lines of the records a part cites, as the words question reads them. */
export function recordLines(sources: SourceRef[], brief: SummaryBrief, facts: HardFacts): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  const add = (l: string) => {
    if (l && !seen.has(l)) {
      seen.add(l);
      lines.push(l);
    }
  };
  const quote = (q: { date: string; text: string }) =>
    add(`their journal on ${q.date}: ${clip(q.text, 500)}`);
  for (const s of sources) {
    if (s.type === 'observation') {
      const o = brief.observations.find((x) => x.id === s.id);
      if (!o) continue;
      const ev = o.evidence_snapshot as {
        facts?: Array<{
          statement: string;
          date?: string | null;
          to?: string;
          every_year?: boolean;
          state?: string;
          recorded?: string;
        }>;
        people?: Array<{ name: string; relationship?: string | null }>;
        moments?: Array<{ quote_id: string }>;
        counts?: Array<{ line: string }>;
        items?: Array<{ title: string; added?: string | null; done?: string | null; due?: string }>;
      };
      // the day a fact is about is not the day it was told: both are named
      for (const f of ev.facts ?? []) {
        const about = f.date
          ? `the day it is about ${f.date}${f.to ? ` to ${f.to}` : ''}${f.every_year ? ', every year, this year' : ''}`
          : '';
        const told = f.recorded ? `recorded ${f.recorded}` : '';
        const notes = [f.state, about, told].filter(Boolean).join('; ');
        add(`fact${notes ? ` (${notes})` : ''}: ${clip(f.statement, 300)}`);
      }
      for (const p of ev.people ?? [])
        add(
          `person: ${p.name}, ${p.relationship ? `their ${p.relationship}` : 'who they are to them is not recorded'}`,
        );
      for (const m of ev.moments ?? []) {
        const q = facts.journal_quotes.find((x) => x.id === m.quote_id);
        if (q) quote(q);
      }
      for (const c of ev.counts ?? []) add(`counted by code: ${c.line}`);
      for (const t of ev.items ?? [])
        add(
          `on their list: ${clip(t.title, 120)} (${[t.added ? `added ${t.added}` : 'added before this week', t.done ? `done ${t.done}` : 'not done', t.due ? `due ${t.due}` : ''].filter(Boolean).join('; ')})`,
        );
    } else if (s.type === 'journal_quote') {
      const ref = s as { date?: string; id?: string };
      for (const q of facts.journal_quotes)
        if ((ref.id && q.id === ref.id) || (!ref.id && ref.date && q.date === ref.date)) quote(q);
    } else if (s.type === 'hard_fact') {
      const v = valueAt(facts, s.path);
      if (v !== undefined)
        add(`figure ${s.path}: ${clip(typeof v === 'object' ? JSON.stringify(v) : v, 300)}`);
    } else if (s.type === 'date') {
      const day = facts.week.date_lookup[s.value];
      if (day) add(`${s.value} is a ${day}`);
    }
  }
  return lines;
}

/** The week's figures in one line, as code worked them out. */
export function weekFigures(facts: HardFacts): string {
  const c = (facts.week_counts ?? {}) as Record<string, unknown>;
  const bits = [
    `the week is ${facts.week.display_start} to ${facts.week.display_end}, ${facts.week.days_in_display} days`,
    `fed on ${facts.fed.days_in_window} of them (a day is fed when they gave Gremly something that day)`,
    ...(() => {
      const moods = facts.mood_arc
        .filter((m) => m.moods?.length)
        .map((m) => `${m.date} ${m.moods.join(' and ')}`);
      return moods.length ? [`the moods they marked: ${moods.join(', ')}`] : ['no moods marked'];
    })(),
    `${facts.totals.drops} drops`,
    `${facts.totals.journals} journal entries`,
    `${facts.totals.todos_completed} todos done`,
    // every count as the weekly pass read it, so a whole week line rests on all of them
    ...(facts.week_counts ? (weekCountLines(c) as string[]) : []),
  ];
  return `the week's figures, worked out by code: ${bits.join('; ')}`;
}

/**
 * Which parts each of code's deck problems belongs to. A problem that names
 * its card belongs to it; one that names a value belongs to every part
 * written with that value; any other is the deck's.
 */
export function problemsByPart(
  deck: unknown,
  errors: string[],
  parts: DeckPart[],
): { deck: string[]; parts: Map<string, string[]> } {
  const out = new Map<string, string[]>();
  const whole: string[] = [];
  const push = (key: string, e: string) => out.set(key, [...(out.get(key) ?? []), e]);
  const cards = ((deck as { cards?: unknown[] })?.cards ?? []) as unknown[];
  for (const e of errors) {
    const m = /^card\[(\d+)/.exec(e);
    if (m) {
      const i = Number(m[1]);
      const p = /paragraphs\[(\d+)\]/.exec(e);
      const key = cards[i] && (cards[i] as Card).shape === 'letter' && p ? `${i}.p${p[1]}` : null;
      const owners = key ? [key] : parts.filter((x) => x.card === i).map((x) => x.key);
      if (owners.length) owners.forEach((k) => push(k, e));
      else whole.push(e);
      continue;
    }
    const v =
      /^fabricated (?:date|number): (\S+)/.exec(e)?.[1] ?? (/"should"/.test(e) ? 'should' : null);
    if (v) {
      // a value belongs to the parts whose own words or dates hold it, read
      // without the fields code fills (the mood arc, sources, ids), and a
      // number only where it stands as a whole number
      const asNumber = /^\d+(?:\.\d+)?$/.test(v)
        ? new RegExp(`(^|[^\\d.])${v.replace('.', '\\.')}(?![\\d])`)
        : null;
      const owners = parts.filter((x) => {
        const card = cards[x.card] as Card;
        const body =
          x.paragraph === null
            ? card
            : (card?.body as { paragraphs?: unknown[] })?.paragraphs?.[x.paragraph];
        const held: string[] = [];
        proseOf(body, OWNED_SKIP, held);
        const text = held.join(' ');
        return asNumber ? asNumber.test(text) : text.includes(v);
      });
      if (owners.length) owners.forEach((x) => push(x.key, e));
      else whole.push(e);
      continue;
    }
    whole.push(e);
  }
  return { deck: whole, parts: out };
}

async function inTurn<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/**
 * Check a deck: code's checks on the whole of it, then the words question
 * for each part, with only the records that part cites.
 */
export async function checkDeck(
  raw: unknown,
  brief: SummaryBrief,
  facts: HardFacts,
  {
    ask,
    today,
    person,
    only,
    confirm,
  }: {
    ask: AskWords;
    today: string;
    person: { first_name?: string | null } | null;
    /** The cards to ask about in words, when not all: a card that held is not asked again. */
    only?: number[];
    /**
     * The same words question on a model of another family, asked only when
     * the first says a part does not hold: the part is wrong only when both
     * say so (stage 7). writePlannedDeck gives it only once a part has been
     * written again, so a part is put right before it is kept on the second
     * reader's word. When it cannot be asked, the first answer stands.
     */
    confirm?: AskWords;
  },
): Promise<DeckCheck> {
  const fc = factCheckDeterministic(raw, brief, facts);
  // a deck written from a plan always has cards: none is a deck to write again
  const cardsGiven = (raw as { cards?: unknown[] })?.cards;
  if (!Array.isArray(cardsGiven) || !cardsGiven.length) fc.errors.push('it gave no cards');
  const parts = deckParts(raw);
  const byPart = problemsByPart(raw, fc.errors, parts);
  const problems = new Map<string, PartProblem[]>();
  for (const [k, list] of byPart.parts)
    problems.set(
      k,
      list.map((say) => ({ step: 'code', say })),
    );
  const asked = parts.filter((p) => p.text && (!only || only.includes(p.card)));
  // the hero and the letter speak of the whole week: they rest on every
  // planned card and on the week's figures, beside what they cite
  const cards = ((raw as { cards?: Card[] })?.cards ?? []) as Card[];
  const whole: SourceRef[] = brief.observations.map((o) => ({ type: 'observation', id: o.id }));
  const sourcesOf = (p: DeckPart): SourceRef[] =>
    p.card === 0 || cards[p.card]?.shape === 'letter' ? [...whole, ...p.sources] : p.sources;
  const linesOf = (p: DeckPart): string[] => {
    const lines = recordLines(sourcesOf(p), brief, facts);
    const figures =
      p.card === 0 ||
      cards[p.card]?.shape === 'letter' ||
      p.sources.some((x) => x.type === 'hard_fact');
    return figures ? [...lines, weekFigures(facts)] : lines;
  };
  const heldBySecond: string[] = [];
  const answers = await inTurn(asked, 6, async (p) => {
    try {
      const request = wordsRequest({
        sentence: { text: p.text },
        records: linesOf(p).map((label) => ({ label })),
        today,
        moment: 'read on the last day of the week it looks back on',
        person,
      });
      const out = await ask(request);
      if (typeof out?.not_held !== 'boolean')
        return {
          step: 'unasked',
          say: 'the words question came back without an answer',
        } as PartProblem;
      const w = wordsProblem(out);
      if (w && confirm) {
        let second: WordsAnswer | null = null;
        try {
          second = await confirm(request);
        } catch {
          second = null;
        }
        if (second?.not_held === false) {
          heldBySecond.push(p.key);
          return null;
        }
      }
      return w ? ({ step: 'words', say: w.say } as PartProblem) : null;
    } catch (err) {
      return {
        step: 'unasked',
        say: `the words question could not be asked: ${String((err as Error)?.message || err).slice(0, 120)}`,
      } as PartProblem;
    }
  });
  asked.forEach((p, i) => {
    const a = answers[i];
    if (a) problems.set(p.key, [...(problems.get(p.key) ?? []), a]);
  });
  const records = new Map(parts.filter((p) => problems.has(p.key)).map((p) => [p.key, linesOf(p)]));
  return {
    deck: byPart.deck,
    parts: problems,
    checked: asked.length,
    records,
    ...(heldBySecond.length ? { held_by_second: heldBySecond } : {}),
  };
}

/** The cards a check found wrong, by their place in the deck. */
export function wrongCards(c: DeckCheck): number[] {
  return [...new Set([...c.parts.keys()].map((k) => Number(k.split('.p')[0])))];
}

/** A check with only the hero's problems, for the hero to be written once more alone. */
export function heroOnly(c: DeckCheck): DeckCheck {
  return {
    deck: [],
    parts: new Map(c.parts.has('0') ? [['0', c.parts.get('0')!]] : []),
    checked: c.checked,
    records: new Map(c.records?.has('0') ? [['0', c.records.get('0')!]] : []),
  };
}

/** The deck's check with the hero's from its last try in place of the one before. */
export function withHero(before: DeckCheck, hero: DeckCheck): DeckCheck {
  const parts = new Map([...before.parts].filter(([k]) => k !== '0'));
  if (hero.parts.has('0')) parts.set('0', hero.parts.get('0')!);
  const records = new Map([...(before.records ?? new Map())].filter(([k]) => k !== '0'));
  if (hero.records?.has('0')) records.set('0', hero.records.get('0')!);
  return { deck: hero.deck, parts, checked: before.checked + hero.checked, records };
}

export function checkIsClean(c: DeckCheck): boolean {
  return c.deck.length === 0 && c.parts.size === 0;
}

/** What was wrong, in the words the writer is shown when the deck goes back. */
export function rewriteGuidance(c: DeckCheck, raw: unknown): string {
  const cards = ((raw as { cards?: unknown[] })?.cards ?? []) as Card[];
  const lines: string[] = [];
  for (const e of c.deck) lines.push(`- the deck: ${e}`);
  for (const [key, list] of c.parts) {
    const [i, p] = key.split('.p');
    const where = `card ${i} (${cards[Number(i)]?.shape ?? 'unknown'})${p !== undefined ? `, paragraph ${p}` : ''}`;
    for (const x of list) lines.push(`- ${where}: ${x.say}`);
  }
  return `WHAT WAS WRONG WITH THE LAST DECK

A deck was written from this plan and failed its checks. Write the whole deck again from the plan and records above, not by editing that one. Every planned card is still written, in the plan's order.

${lines.join('\n')}

Return only the JSON.`;
}

/**
 * The opening card when no try at its words held: the card as written with
 * its own words taken out, and the week's character from the plan, which the
 * weekly pass's check has already held to the records, as its chip. What it
 * keeps is code's: the day strip and the figures, each checked by code.
 * Code places the plan's words; it writes none (stage 7).
 */
export function fallbackHero(card: Card, character: string): Card {
  const body = { ...((card.body as unknown as Record<string, unknown>) ?? {}) };
  return {
    ...card,
    ...('eyebrow' in card ? { eyebrow: '' } : {}),
    headline: '',
    body: { ...body, subtitle: '', classification_chip: character, fallback: true },
  } as Card;
}

export interface FinishedDeck {
  deck: Deck | null;
  left_out: Array<{ key: string; shape: string; why: string[] }>;
  /** Why there is no deck, when there is none. */
  none?: string;
}

/**
 * The deck that stands after its last check: a middle card or a letter
 * paragraph still wrong is left out, a letter with no paragraph left goes, and
 * a hero still wrong, or a deck wrong as a whole, means no deck.
 */
export function finishDeck(raw: unknown, c: DeckCheck, brief: SummaryBrief): FinishedDeck {
  const r = (raw ?? {}) as Record<string, unknown>;
  const cards = (Array.isArray(r.cards) ? r.cards : []) as Card[];
  if (!cards.length) return { deck: null, left_out: [], none: 'the writer gave no cards' };
  if (c.deck.length)
    return {
      deck: null,
      left_out: [],
      none: `the deck was wrong as a whole: ${c.deck.join('; ').slice(0, 300)}`,
    };
  const left_out: FinishedDeck['left_out'] = [];
  const say = (list: PartProblem[] | undefined) => (list ?? []).map((x) => x.say);
  const heroWrong = c.parts.get('0');
  if (cards[0]?.shape !== 'hero' || heroWrong)
    return {
      deck: null,
      left_out: [{ key: '0', shape: String(cards[0]?.shape ?? 'none'), why: say(heroWrong) }],
      none: 'the hero was still wrong after it was written again',
    };
  const kept: Card[] = [];
  cards.forEach((card, i) => {
    if (card.shape === 'letter') {
      const paras = ((card.body as { paragraphs?: unknown[] })?.paragraphs ?? []) as unknown[];
      const keep = paras.filter((_, j) => {
        const wrong = c.parts.get(`${i}.p${j}`);
        if (wrong) left_out.push({ key: `${i}.p${j}`, shape: 'letter', why: say(wrong) });
        return !wrong;
      });
      if (keep.length)
        kept.push({ ...card, body: { ...(card.body as object), paragraphs: keep } } as Card);
      return;
    }
    const wrong = i === 0 ? undefined : c.parts.get(String(i));
    if (wrong) {
      left_out.push({ key: String(i), shape: String(card.shape), why: say(wrong) });
      return;
    }
    kept.push(card);
  });
  const index = new Map<Card, number>(kept.map((k, i) => [k, i]));
  const anchors = ((r.surfaced_anchors as Deck['surfaced_anchors']) ?? [])
    .map((a) => {
      const card = cards[a.card_index];
      const at = card ? index.get(card) : undefined;
      return at === undefined ? null : { ...a, card_index: at };
    })
    .filter(Boolean) as Deck['surfaced_anchors'];
  return {
    deck: {
      classification: String(r.classification ?? brief.week_shape?.classification ?? ''),
      through_line: String(r.through_line ?? ''),
      cards: kept,
      surfaced_anchors: anchors,
    },
    left_out,
  };
}

// ── The whole run ──────────────────────────────────────────────────────────

export interface PlannedDeckResult {
  deck: Deck | null;
  none?: string;
  attempts: number;
  writer_model: string;
  left_out: FinishedDeck['left_out'];
  /** Each try's problems, by step and part, for a person reading a run. */
  tries: Array<{ deck: string[]; parts: Record<string, PartProblem[]>; checked: number; held_by_second?: string[] }>;
  last_raw: unknown;
  /** The opening card fell back to the plan's character and the week's figures (stage 7). */
  hero_fell_back?: boolean;
  /** Parts the first reader said did not hold and the second said did, over every try. */
  held_by_second?: string[];
}

const plain = (c: DeckCheck) => ({
  deck: c.deck,
  parts: Object.fromEntries(c.parts),
  checked: c.checked,
  ...(c.held_by_second?.length ? { held_by_second: c.held_by_second } : {}),
});

const MIDDLE_SHAPES = new Set(['moment', 'people', 'pattern', 'question', 'stat', 'timeline']);

/** What one card that did not hold is told when it goes back alone. */
export function cardGuidance(card: Card, index: number, check: DeckCheck): string {
  const lines: string[] = [];
  const held = new Set<string>();
  for (const [key, list] of check.parts) {
    const [i, p] = key.split('.p');
    if (Number(i) !== index) continue;
    for (const x of list) lines.push(`- ${p !== undefined ? `paragraph ${p}: ` : ''}${x.say}`);
    for (const r of check.records?.get(key) ?? []) held.add(r);
  }
  return `ONE CARD TO WRITE AGAIN

The deck you wrote from this plan is checked one card at a time, and this card did not hold. Put it right for the same planned card by changing only the words that do not hold, as little as you can, so that it says only what its records hold; keep every other word as it was. Keep its shape unless what it may say no longer fits that shape; a card between the opening and the letter may then take another such shape. It may say less than before: leave out whatever its records do not hold.

THE CARD AS YOU WROTE IT (card ${index}, ${card.shape}):
${JSON.stringify(card)}

WHAT WAS WRONG:
${lines.join('\n')}
${held.size ? `\nWHAT IT IS CHECKED AGAINST, WHICH IS ALL IT MAY SAY:\n${[...held].map((r) => `- ${r}`).join('\n')}\n` : ''}
Return only the card, as one JSON object.`;
}

/**
 * The second try. A deck that is wrong as a whole, or gave no cards, is
 * written again whole, told what was wrong. Otherwise each card that did not
 * hold goes back alone, with what was wrong with it, as the shared check
 * sends back a sentence (workers/shared/check/run.js), and the cards that held
 * stay as they were.
 */
export async function rewriteDeck(
  raw: Record<string, unknown> | null,
  check: DeckCheck | null,
  base: string,
  write: (user: UserMessage) => Promise<Record<string, unknown>>,
): Promise<{
  raw: Record<string, unknown> | null;
  error?: string;
  whole: boolean;
  failed?: Array<{ card: number; why: string }>;
}> {
  const cards = (Array.isArray(raw?.cards) ? raw!.cards : []) as Card[];
  if (!raw || !check || !cards.length || check.deck.length) {
    try {
      const again = await write(
        raw && check ? { cached: base, rest: rewriteGuidance(check, raw) } : { cached: base },
      );
      sanitizeDeckProse(again);
      return { raw: again, whole: true };
    } catch (err) {
      return {
        raw: null,
        error: String((err as Error)?.message || err).slice(0, 300),
        whole: true,
      };
    }
  }
  const wrong = [...new Set([...check.parts.keys()].map((k) => Number(k.split('.p')[0])))];
  const next = [...cards];
  const failed: Array<{ card: number; why: string }> = [];
  await inTurn(wrong, 4, async (i) => {
    try {
      const out = (await write({ cached: base, rest: cardGuidance(cards[i], i, check) })) as Record<
        string,
        unknown
      >;
      // the card itself, or the card inside whatever it came back in. A card
      // between the hero and the letter may come back as another such shape,
      // when what it may say no longer fits the one it had; the hero and the
      // letter keep theirs
      const fits = (c: unknown) => {
        const shape = (c as Card | null)?.shape;
        if (!c || typeof c !== 'object' || typeof shape !== 'string') return false;
        if (shape === cards[i].shape) return true;
        const ends = (x: string) => x === 'hero' || x === 'letter';
        return !ends(cards[i].shape) && !ends(shape) && MIDDLE_SHAPES.has(shape);
      };
      const candidates = [out?.card, out, ...(Array.isArray(out?.cards) ? out.cards : [])];
      const found = (candidates.find((c) => (c as Card | null)?.shape === cards[i].shape) ??
        candidates.find(fits)) as Card | undefined;
      if (!found) {
        failed.push({ card: i, why: 'it came back as something other than that card' });
        return;
      }
      sanitizeDeckProse(found);
      next[i] = found;
    } catch (err) {
      // a card that could not be written again stays as it was, and is checked as it was
      failed.push({ card: i, why: String((err as Error)?.message || err).slice(0, 160) });
    }
  });
  return { raw: { ...raw, cards: next }, whole: false, ...(failed.length ? { failed } : {}) };
}

export async function writePlannedDeck(
  env: Record<string, string>,
  brief: SummaryBrief,
  facts: HardFacts,
  opts: {
    ask: AskWords;
    today: string;
    person: { first_name?: string | null } | null;
    write?: (user: UserMessage) => Promise<Record<string, unknown>>;
    /** The second reader (checkDeck), asked only once a part has been written again and still does not hold. */
    confirm?: AskWords;
  },
): Promise<PlannedDeckResult> {
  const write = opts.write ?? ((u: UserMessage) => callPlanWriter(env, u));
  const base = buildPlanWriterPrompt(brief, facts);
  const tries: PlannedDeckResult['tries'] = [];
  let fellBack = false;
  let raw: Record<string, unknown> | null = null;
  let firstError: string | undefined;
  try {
    raw = await write({ cached: base });
    sanitizeDeckProse(raw);
  } catch (err) {
    firstError = String((err as Error)?.message || err).slice(0, 300);
  }
  // what the first reader finds is put right first; the second reader is
  // asked only before a card would be left out (stage 7, since 18 Oct)
  let check: DeckCheck | null = raw ? await checkDeck(raw, brief, facts, { ...opts, confirm: undefined }) : null;
  if (check) tries.push(plain(check));
  if (!raw || !check || !checkIsClean(check)) {
    // only what was written again is asked about again: a card that held, held
    const only = check && raw && !check.deck.length ? wrongCards(check) : undefined;
    const again = await rewriteDeck(raw, check, base, write);
    if (again.raw) {
      raw = again.raw;
      check = await checkDeck(raw, brief, facts, { ...opts, only: again.whole ? undefined : only });
      tries.push(plain(check));
    }
    if (!raw || !check)
      return {
        deck: null,
        none: `the writer could not be reached: ${again.error || firstError || 'no reply'}`,
        attempts: 2,
        writer_model: planWriterModel(env),
        left_out: [],
        tries,
        last_raw: raw,
      };
    // the hero carries the deck, so when it alone still does not hold it is
    // written three times more, alone and at once, and the first that holds
    // is kept (stage 7)
    if (!check.deck.length && check.parts.has('0')) {
      const before = check;
      const heroes = await Promise.all([0, 1, 2].map(() => rewriteDeck(raw, heroOnly(before), base, write)));
      let last: { raw: Record<string, unknown>; check: DeckCheck } | null = null;
      for (const hero of heroes) {
        if (!hero.raw || hero.failed) continue;
        const c = await checkDeck(hero.raw, brief, facts, { ...opts, only: [0] });
        tries.push(plain(c));
        last = { raw: hero.raw, check: c };
        if (!c.parts.has('0') && !c.deck.length) break;
      }
      if (last) {
        raw = last.raw;
        check = withHero(before, last.check);
      }
    }
    // still wrong: the opening falls back to the plan's character and the
    // week's figures, checked like any card; only if that fails too is there
    // no deck (stage 7)
    const character = String(brief.week_shape?.classification ?? '').trim();
    const heroCard = ((raw?.cards as Card[] | undefined) ?? [])[0];
    if (raw && !check.deck.length && check.parts.has('0') && character && heroCard?.shape === 'hero') {
      const fell = { ...raw, cards: [fallbackHero(heroCard, character), ...((raw.cards as Card[]).slice(1))] };
      const c = await checkDeck(fell, brief, facts, { ...opts, only: [0] });
      tries.push(plain(c));
      if (!c.parts.has('0') && !c.deck.length) {
        raw = fell;
        check = withHero(check, c);
        fellBack = true;
      }
    }
  }
  const done = finishDeck(raw, check, brief);
  return {
    deck: done.deck,
    ...(done.none ? { none: done.none } : {}),
    attempts: tries.length,
    writer_model: planWriterModel(env),
    left_out: done.left_out,
    tries,
    last_raw: raw,
    ...(fellBack ? { hero_fell_back: true } : {}),
    held_by_second: [...new Set(tries.flatMap((t) => t.held_by_second ?? []))],
  };
}
