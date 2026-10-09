/**
 * Gremly's questions about Worlds and Chapters, in the app (Worlds rebuild,
 * stage 3). The data fabric writes them (inngest-jobs
 * context/chapterQuestions.js): a suggestion to start a Chapter, with the
 * items it rests on; whether a Chapter past its end, or long quiet, is over;
 * and after time away, what became of the Chapters that passed (the welcome
 * back). Words typed in answer go to the pipeline, which reads them and acts
 * (context/chapterAnswers.js). A tap on one of the card's own buttons is
 * applied here, through the same actions as the Worlds screens, with Undo,
 * and the question is marked answered, so it is gone from the brief, the wrap
 * up and Answer some Gremly questions too (James, 8 Oct: decisions 1 and 2).
 *
 * Which question may be asked is the rule every place keeps to
 * (lib/wrapup/questions.ts askableQuestions, held to
 * workers/shared/questionRules.js); on Worlds it is one at a time
 * (QUESTION_CAPS.worlds), and only these kinds (decision 3).
 */
import { supabase } from '../supabase/client';
import { callNotRight } from '../cortex/CortexClient';
import { nowTimestamp } from '../date/DateService';
import { useGremlyStore } from '../store/useGremlyStore';
import type { Chapter, World } from '../supabase/types';
import { askableQuestions, type WrapQuestion } from '../wrapup/questions';
import type { FiledItem, Undo } from './actions';
import { dayOf, isOpenChapter } from './model';

/** The one button above the box on Worlds (workers/shared/questionRules.js QUESTION_CAPS.worlds). */
export const WORLDS_QUESTION_CAP = 1;

export type Guess = 'over' | 'going' | 'moved' | 'unsure';

/** A suggestion to start a Chapter, as the writer proposed it. */
export interface StartProposal {
  type: 'start';
  title: string;
  world_id: string | null;
  start_date: string | null;
  end_date: string | null;
  /** The writer was unsure it is a Chapter rather than something passing */
  unsure: boolean;
}

/** Whether a Chapter is over (or, after time away, what became of it), with Gremly's guess. */
export interface CloseProposal {
  type: 'close' | 'while_away';
  chapter_id: string;
  guess: Guess;
  /** Its new days, when the guess is that it moved */
  start_date: string | null;
  end_date: string | null;
}

export interface WorldsQuestion extends WrapQuestion {
  kind: 'start_chapter' | 'close_chapter' | 'while_away';
  status: 'open' | 'asked';
  proposal: StartProposal | CloseProposal;
  /**
   * What a suggestion rests on: their items, by table and id, and the items
   * the facts it rests on were taken from (fetchWorldsQuestions)
   */
  rests_on: { table: string; id: string }[];
  /** The facts a suggestion rests on, by id, before they are read for their items */
  rests_on_facts: string[];
  /** A welcome back's questions share one set */
  set_id: string | null;
}

const KINDS = ['start_chapter', 'close_chapter', 'while_away'] as const;
const GUESSES: Guess[] = ['over', 'going', 'moved', 'unsure'];
const ITEM_TYPE: Record<string, FiledItem['type']> = {
  todos: 'todo',
  notes: 'note',
  habits: 'habit',
};

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const day = (v: unknown): string | null => dayOf(typeof v === 'string' ? v : null);

/** One stored question, or null when it is not one this build can put. Pure. */
export function worldsQuestionFrom(row: Record<string, any>): WorldsQuestion | null {
  const kind = KINDS.find((k) => k === row?.kind);
  const question = text(row?.question);
  const c = (row?.proposed_change ?? {}) as Record<string, unknown>;
  if (!kind || !question || !text(row?.id)) return null;
  let proposal: StartProposal | CloseProposal;
  if (kind === 'start_chapter') {
    const title = text(c.title);
    if (!title) return null;
    proposal = {
      type: 'start',
      title,
      world_id: text(c.world_id) || null,
      start_date: day(c.start_date),
      end_date: day(c.end_date),
      unsure: c.unsure === true,
    };
  } else {
    const chapterId = text(c.chapter_id) || text(row?.record_id);
    if (!chapterId) return null;
    proposal = {
      type: kind === 'while_away' ? 'while_away' : 'close',
      chapter_id: chapterId,
      guess: GUESSES.includes(c.guess as Guess) ? (c.guess as Guess) : 'unsure',
      start_date: day(c.start_date),
      end_date: day(c.end_date),
    };
  }
  return {
    id: row.id,
    kind,
    status: row.status === 'asked' ? 'asked' : 'open',
    question,
    choices: Array.isArray(row.choices)
      ? row.choices.filter((x: unknown) => typeof x === 'string')
      : [],
    created_at: String(row.created_at || ''),
    asked_at: row.asked_at ?? null,
    record_table: row.record_table ?? null,
    record_id: row.record_id ?? null,
    private: false,
    hold_until: typeof row.hold_until === 'string' ? row.hold_until.slice(0, 10) : null,
    weight: row.weight === 'needs' || row.weight === 'helps' ? row.weight : null,
    proposal,
    rests_on: (Array.isArray(row.rests_on) ? row.rests_on : []).filter(
      (r: any) => ITEM_TYPE[r?.table] && typeof r?.id === 'string',
    ),
    rests_on_facts: (Array.isArray(row.rests_on) ? row.rests_on : [])
      .filter((r: any) => r?.table === 'life_facts' && typeof r?.id === 'string')
      .map((r: any) => r.id as string),
    set_id: text(row.set_id) || null,
  };
}

/**
 * A suggestion with the items its facts were taken from added to what it
 * rests on: a fact Gremly read from one of their todos, notes or habits
 * means that item belongs in the Chapter too. Pure.
 * @param sources each fact's id with the table and id it was taken from
 */
export function withFactItems(
  q: WorldsQuestion,
  sources: { id: string; source_table: string | null; source_id: string | null }[],
): WorldsQuestion {
  if (!q.rests_on_facts.length) return q;
  const rests = [...q.rests_on];
  for (const f of sources) {
    if (!q.rests_on_facts.includes(f.id) || !f.source_id || !ITEM_TYPE[f.source_table ?? ''])
      continue;
    if (!rests.some((r) => r.table === f.source_table && r.id === f.source_id))
      rests.push({ table: f.source_table as string, id: f.source_id });
  }
  return rests.length === q.rests_on.length ? q : { ...q, rests_on: rests };
}

const QUESTION_COLUMNS =
  'id,kind,status,question,choices,weight,created_at,asked_at,hold_until,record_table,record_id,proposed_change,rests_on,set_id';

/** The kinds of question the card puts, wherever it is (Worlds, the brief, the wrap up). */
export function isChapterQuestionKind(kind: unknown): boolean {
  return kind === 'start_chapter' || kind === 'close_chapter';
}

/** Their open questions about Chapters, those that need an answer first, then oldest first. */
export async function fetchWorldsQuestions(): Promise<WorldsQuestion[]> {
  const { data, error } = await supabase
    .from('gremly_questions')
    .select(QUESTION_COLUMNS)
    .in('kind', [...KINDS])
    .in('status', ['open', 'asked'])
    .order('weight', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(30);
  if (error) throw error;
  return withSources(
    ((data ?? []) as Record<string, any>[])
      .map(worldsQuestionFrom)
      .filter((q): q is WorldsQuestion => !!q),
  );
}

/**
 * One question about a Chapter, by its id, while it is still open: for the
 * brief and the wrap up, whose message keeps only the id. Null when it has
 * been answered or put aside since, or is not one the card can put.
 */
export async function fetchWorldsQuestion(id: string): Promise<WorldsQuestion | null> {
  const { data, error } = await supabase
    .from('gremly_questions')
    .select(QUESTION_COLUMNS)
    .eq('id', id)
    .in('kind', [...KINDS])
    .in('status', ['open', 'asked'])
    .limit(1);
  if (error) throw error;
  const q = worldsQuestionFrom(((data ?? []) as Record<string, any>[])[0] ?? {});
  return q ? ((await withSources([q]))[0] ?? null) : null;
}

/** The questions with the items the facts they rest on were taken from. */
async function withSources(questions: WorldsQuestion[]): Promise<WorldsQuestion[]> {
  const factIds = [...new Set(questions.flatMap((q) => q.rests_on_facts))];
  if (!factIds.length) return questions;
  // the items those facts were read from; without them a suggestion shows
  // what it rests on as best it can, from its items alone
  const { data: sources, error: e } = await supabase
    .from('life_facts')
    .select('id,source_table,source_id')
    .in('id', factIds)
    .in('source_table', Object.keys(ITEM_TYPE));
  if (e) {
    console.warn('[questions] could not read what the facts came from:', e.message);
    return questions;
  }
  return questions.map((q) => withFactItems(q, (sources ?? []) as any[]));
}

/** Whether what a question is about is still there to act on. Pure. */
export function stillStands(
  q: WorldsQuestion,
  chapters: Pick<Chapter, 'id' | 'phase' | 'closed_at'>[],
): boolean {
  if (q.proposal.type === 'start') return true;
  const id = q.proposal.chapter_id;
  const c = chapters.find((x) => x.id === id);
  return !!c && isOpenChapter(c);
}

/**
 * The question that waits above the box on Worlds, if any: by the shared
 * rules, a suggestion or a close whose Chapter is still open. A welcome back
 * comes as its own card instead. Pure.
 */
export function worldsAsk(
  open: WorldsQuestion[],
  ctx: { day: string; chapters: Pick<Chapter, 'id' | 'phase' | 'closed_at'>[] },
): WorldsQuestion | null {
  const askable = askableQuestions(
    open.filter((q) => q.kind !== 'while_away' && stillStands(q, ctx.chapters)),
    { day: ctx.day, decidedIds: new Set(), askedToday: new Set() },
  );
  return askable.slice(0, WORLDS_QUESTION_CAP)[0] ?? null;
}

/** The welcome back: the newest set's questions whose Chapters are still open. Pure. */
export function welcomeBack(
  open: WorldsQuestion[],
  chapters: Pick<Chapter, 'id' | 'phase' | 'closed_at'>[],
): WorldsQuestion[] {
  const away = open.filter((q) => q.kind === 'while_away' && q.set_id);
  if (!away.length) return [];
  const newest = away.reduce((a, b) => (b.created_at > a.created_at ? b : a));
  return away.filter((q) => q.set_id === newest.set_id && stillStands(q, chapters));
}

/** The items a suggestion rests on, as the store files them. Pure. */
export function itemsOf(q: WorldsQuestion): FiledItem[] {
  return q.rests_on.map((r) => ({ id: r.id, type: ITEM_TYPE[r.table] }));
}

// ── Answering ───────────────────────────────────────────────────────────────

function store(): any {
  return useGremlyStore.getState();
}

/**
 * Mark the question settled, and hand back what puts it as it was. Throws
 * when it could not be marked.
 */
async function settle(
  q: WorldsQuestion,
  status: 'answered' | 'dismissed',
  answer: string,
): Promise<Undo> {
  const { error } = await supabase
    .from('gremly_questions')
    .update({ status, answer, answered_at: nowTimestamp() })
    .eq('id', q.id)
    .in('status', ['open', 'asked']);
  if (error) throw error;
  return async () => {
    const { error: e } = await supabase
      .from('gremly_questions')
      .update({ status: q.status, answer: null, answered_at: null })
      .eq('id', q.id);
    if (e) throw e;
  };
}

/** Both undone, the change first. */
const together =
  (...undos: Undo[]): Undo =>
  async () => {
    for (const u of undos) await u();
  };

/**
 * Start the suggested Chapter, with what it rests on filed in it, under the
 * name and World on the card (the person may have changed either).
 */
export async function startIt(
  q: WorldsQuestion,
  edits: { title?: string; worldId?: string | null } = {},
): Promise<{ chapter: Chapter; undo: Undo }> {
  if (q.proposal.type !== 'start') throw new Error('That question is not a suggestion.');
  const p = q.proposal;
  const known = new Set(
    [...(store().todos ?? []), ...(store().notes ?? []), ...(store().habits ?? [])].map(
      (i: { id: string }) => i.id,
    ),
  );
  const { chapter, undo } = await store().makeChapter({
    title: (edits.title ?? p.title).trim() || p.title,
    worldId: edits.worldId !== undefined ? edits.worldId : p.world_id,
    startDate: p.start_date,
    endDate: p.end_date,
    // only what is still theirs; something deleted since is left out
    items: itemsOf(q).filter((i) => known.has(i.id)),
  });
  try {
    const back = await settle(q, 'answered', 'Start it');
    return { chapter, undo: together(undo, back) };
  } catch (err) {
    await undo().catch(() => undefined);
    throw err;
  }
}

/** Not now: a suggestion they turned down is never made again (the pipeline reads the no). */
export async function notNow(q: WorldsQuestion): Promise<Undo> {
  return settle(q, 'dismissed', 'no');
}

/**
 * Close it. The memory is written once it has closed; the Chapter shows it
 * when it comes (stage 2, decision 5: quietly, away from its own page).
 */
export async function closeIt(q: WorldsQuestion): Promise<Undo> {
  if (q.proposal.type === 'start') throw new Error('That question is not about a Chapter.');
  const id = q.proposal.chapter_id;
  const undo: Undo = await store().closeChapter(id);
  store()
    .askForMemory(id)
    .catch((err: unknown) => console.warn('[Worlds] the memory could not be written:', err));
  try {
    return together(undo, await settle(q, 'answered', 'Close it'));
  } catch (err) {
    await undo().catch(() => undefined);
    throw err;
  }
}

/**
 * Still going: it stays open, and an end date that has passed, unless they set
 * it themselves, is taken away, as the pipeline does with the same answer
 * (inngest-jobs context/chapterAnswers.js).
 */
export async function stillGoing(q: WorldsQuestion, today: string): Promise<Undo> {
  if (q.proposal.type === 'start') throw new Error('That question is not about a Chapter.');
  const id = q.proposal.chapter_id;
  const c: (Chapter & { end_date_source?: string | null }) | undefined = (
    store().chapters ?? []
  ).find((x: Chapter) => x.id === id);
  const end = dayOf(c?.end_date ?? null);
  const undos: Undo[] = [];
  if (c && end && end < today && c.end_date_source !== 'user') {
    undos.push(await store().setChapterDates(id, c.start_date ?? null, null));
  }
  try {
    undos.push(await settle(q, 'answered', 'Still going'));
    return together(...undos);
  } catch (err) {
    for (const u of undos) await u().catch(() => undefined);
    throw err;
  }
}

/** Its days moved to the ones Gremly guessed. */
export async function moveIt(q: WorldsQuestion): Promise<Undo> {
  if (q.proposal.type === 'start' || q.proposal.guess !== 'moved')
    throw new Error('Gremly has no new days for it.');
  const p = q.proposal;
  const c: Chapter | undefined = (store().chapters ?? []).find(
    (x: Chapter) => x.id === p.chapter_id,
  );
  const undo: Undo = await store().setChapterDates(
    p.chapter_id,
    p.start_date ?? c?.start_date ?? null,
    p.end_date ?? c?.end_date ?? null,
  );
  try {
    return together(undo, await settle(q, 'answered', 'New dates'));
  } catch (err) {
    await undo().catch(() => undefined);
    throw err;
  }
}

/**
 * Their own words: the pipeline reads them and acts, as with an answer typed
 * in the brief, and marks the question answered. Resolves to whether it went.
 */
export async function tellGremly(q: WorldsQuestion, said: string): Promise<boolean> {
  const words = said.trim();
  if (!words) return false;
  const res = await callNotRight({ surface: 'question', targetId: q.id, said: words });
  return res.ok;
}

// ── Words ───────────────────────────────────────────────────────────────────

export type AskAct = 'start' | 'no' | 'close' | 'going' | 'move';

export interface AskWords {
  /** The button above the box */
  chip: string;
  /** The card's heading */
  title: string;
  primary: { label: string; act: AskAct };
  secondary: { label: string; act: AskAct };
}

/** What the button and the card say for a question. Pure. */
export function askWords(q: WorldsQuestion, chapters: Pick<Chapter, 'id' | 'title'>[]): AskWords {
  const p = q.proposal;
  if (p.type === 'start') {
    return {
      chip: `Start ${p.title}?`,
      title: `Something is starting: ${p.title}`,
      primary: { label: 'Start it', act: 'start' },
      secondary: { label: 'Not now', act: 'no' },
    };
  }
  const name = chapters.find((c) => c.id === p.chapter_id)?.title?.trim() || 'this Chapter';
  switch (p.guess) {
    case 'over':
      return {
        chip: `Close ${name}?`,
        title: `This looks finished: ${name}`,
        primary: { label: 'Close it', act: 'close' },
        secondary: { label: 'Not yet', act: 'going' },
      };
    case 'moved':
      return p.start_date || p.end_date
        ? {
            chip: `New dates for ${name}?`,
            title: `New dates for ${name}?`,
            primary: { label: 'Move it', act: 'move' },
            secondary: { label: 'Close it', act: 'close' },
          }
        : {
            chip: `How is ${name} going?`,
            title: `How is ${name} going?`,
            primary: { label: 'Still going', act: 'going' },
            secondary: { label: 'Close it', act: 'close' },
          };
    case 'going':
      return {
        chip: `Is ${name} still going?`,
        title: `Still going: ${name}?`,
        primary: { label: 'Still going', act: 'going' },
        secondary: { label: 'Close it', act: 'close' },
      };
    default:
      return {
        chip: `How is ${name} going?`,
        title: `How is ${name} going?`,
        primary: { label: 'Close it', act: 'close' },
        secondary: { label: 'Still going', act: 'going' },
      };
  }
}

/** The World a suggestion would go in, if it is one they see. Pure. */
export function proposedWorld(
  q: WorldsQuestion,
  worlds: Pick<World, 'id' | 'phase'>[],
): string | null {
  if (q.proposal.type !== 'start' || !q.proposal.world_id) return null;
  const id = q.proposal.world_id;
  const w = worlds.find((x) => x.id === id);
  return w && w.phase !== 'archived' ? w.id : null;
}
