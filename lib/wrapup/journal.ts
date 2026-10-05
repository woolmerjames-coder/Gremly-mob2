/**
 * Tonight's journal entry, from the evening wrap up.
 *
 * It is an ordinary journal entry: the note the old Sweep made (same fields,
 * same tags, same marks in views), saved as it is written, with the same two
 * background calls afterwards that give it a title, tags, people and a mood.
 * Saving hands back its Undo, which takes the entry out of the journal again.
 *
 * The entry is dated by the person's day, which after midnight is still
 * yesterday until their day ends.
 *
 * The journal page saves through here too. Its entry is the same entry, with
 * the page's layout kept beside the words, and it can be changed afterwards.
 */
import { env, getEnv } from '../env';
import { getSessionToken } from '../cortex/getSessionToken';
import { getDateService } from '../date/DateService';
import { useGremlyStore } from '../store/useGremlyStore';
import { ALL_MOODS, type Mood } from '../shared/moods';
import { LAYOUT_KEY, type JournalLayout } from '../journal/page';

const TAGS = ['reflection', 'sweep'];

export type JournalSaved =
  | {
      ok: true;
      noteId: string;
      title: string;
      /** Takes the entry back out of the journal */
      revert: () => Promise<void>;
      /** The moods the background read found, once it is back; null when it found none */
      moods: Promise<Mood[] | null>;
    }
  | { ok: false; message: string };

function store(): any {
  return useGremlyStore.getState();
}

function cortexUrl(): string {
  const fromGetEnv = typeof getEnv === 'function' ? getEnv('EXPO_PUBLIC_CORTEX_URL') : undefined;
  const fromConfig = typeof env?.cortexUrl === 'string' ? env.cortexUrl : undefined;
  return fromGetEnv ?? fromConfig ?? process.env.EXPO_PUBLIC_CORTEX_URL ?? '';
}

/** Only moods the app knows, in the order given, once each. */
export function knownMoods(value: unknown): Mood[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const out: Mood[] = [];
  for (const m of list) {
    const mood = String(m).trim().toLowerCase() as Mood;
    if ((ALL_MOODS as readonly string[]).includes(mood) && !out.includes(mood)) out.push(mood);
  }
  return out;
}

/**
 * "Wednesday evening" for written lines, "Evening reflection" for moods
 * alone. One written before the evening is named for that part of the day.
 */
export function journalTitle(
  weekday: string,
  written: boolean,
  part: 'morning' | 'afternoon' | 'evening' = 'evening',
): string {
  return written ? `${weekday} ${part}` : `${part[0].toUpperCase()}${part.slice(1)} reflection`;
}

function sweepViews(day: string, moods: Mood[]) {
  return { sweep_origin: true, sweep_reflection: true, sweep_date: day, sweep_moods: moods };
}

async function ask(url: string, token: string | null, body: Record<string, unknown>) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, any>;
  } catch (err) {
    console.warn('[WrapUp] a journal background call failed:', err);
    return null;
  }
}

/** "@sam-lee" from a name, as the journal tags people. */
function personTag(name: unknown): string | null {
  const tag = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  return tag.length >= 2 ? `@${tag}` : null;
}

/**
 * The background read of a written entry: a title, tags, people, a mood and
 * the kind of energy, patched onto the note. The entry is already saved, so
 * a failure here only means it keeps its plain title.
 */
async function enrich(
  noteId: string,
  text: string,
  moods: Mood[],
  opts: {
    /** The moods Gremly read from the entry with the rest of their day */
    dayMoods?: Promise<Mood[] | null>;
    /** The tags the entry keeps whatever is read: the wrap up's own, or the ones it already had */
    baseTags?: string[];
    /** For an entry whose title says what it is, such as a goal check in */
    keepTitle?: boolean;
  } = {},
): Promise<Mood[] | null> {
  const url = cortexUrl();
  if (!url) return null;
  const ds = getDateService();
  const token = await getSessionToken();
  const [title, read] = await Promise.all([
    ask(url, token, { type: 'enrich-phase1-5a', text, bucket: 'log', subtype: 'journal' }),
    ask(url, token, {
      type: 'enrich-phase2',
      text,
      bucket: 'log',
      subtype: 'journal',
      currentDate: ds.today(),
      dayOfWeek: ds.getDayOfWeek(),
      timezone: ds.getTimezone(),
    }),
  ]);

  const patch: Record<string, unknown> = {};
  if (title?.smart_title && !opts.keepTitle) patch.title = title.smart_title;
  let tags = [...new Set(opts.baseTags ?? TAGS)];
  const hadTags = tags.length;
  if (Array.isArray(read?.tags)) tags = [...new Set([...tags, ...read.tags])];
  if (Array.isArray(read?.people)) {
    const people = read.people.map(personTag).filter((t: string | null): t is string => !!t);
    tags = [...new Set([...tags, ...people])];
  }
  if (tags.length > hadTags) patch.tags = tags;
  // the moods Gremly read from their words with the rest of their day, when he
  // gave any; the background read of the words alone otherwise
  const withDay = knownMoods(await Promise.resolve(opts.dayMoods).catch(() => null));
  const found = withDay.length ? withDay : knownMoods(read?.mood);
  // a mood they picked themselves is kept; the one read from their words fills in when they picked none
  if (found.length && !moods.length) patch.mood = found;
  if (read?.energy_type) patch.energy_type = read.energy_type;
  // taken back out since: leave it alone
  const still = (
    store().notes as { id: string; archived?: boolean; views?: Record<string, unknown> | null }[]
  ).find((n) => n.id === noteId);
  if (!still || still.archived) return null;
  if (title?.confirmation_message || read?.mood) {
    // added to what the entry holds now, so its page layout and its marks are kept
    patch.views = {
      ...(still.views ?? {}),
      ...(title?.confirmation_message ? { confirmation_message: title.confirmation_message } : {}),
      ...(read?.mood ? { ai_mood: read.mood } : {}),
    };
  }
  if (Object.keys(patch).length) await store().updateNote(noteId, patch);
  return found.length && !moods.length ? found : null;
}

/**
 * Save tonight's entry: written lines, moods, or both. Nothing is saved for
 * an empty one.
 */
export async function saveJournal(p: {
  text: string;
  moods: Mood[];
  /** The person's day */
  day: string;
  /** That day's name, for the entry's title */
  weekday: string;
  /** The part of the day it is written in; the evening when left out */
  part?: 'morning' | 'afternoon' | 'evening';
  /** The moods Gremly read from the entry with the rest of their day, when he is reading it */
  dayMoods?: Promise<Mood[] | null>;
  /** The journal page it was written on, kept beside the words */
  page?: JournalLayout;
}): Promise<JournalSaved> {
  const text = p.text.trim();
  const moods = knownMoods(p.moods);
  if (!text && !moods.length) return { ok: false, message: 'Nothing to save.' };
  const title = journalTitle(p.weekday, !!text, p.part);
  try {
    const created = await store().createNote({
      subtype: 'journal',
      title,
      body: text || undefined,
      mood: moods.length ? moods : null,
      origin: 'manual',
      canonicalType: 'log',
      journal_subtype: 'reflection',
      tags: [...TAGS],
      views: p.page
        ? { ...sweepViews(p.day, moods), [LAYOUT_KEY]: p.page }
        : sweepViews(p.day, moods),
    });
    const noteId = created?.id as string | undefined;
    if (!noteId) return { ok: false, message: 'It was not saved.' };
    const found = text
      ? enrich(noteId, text, moods, { dayMoods: p.dayMoods }).catch((err) => {
          console.warn('[WrapUp] the journal background read failed:', err);
          return null;
        })
      : Promise.resolve(null);
    return {
      ok: true,
      noteId,
      title,
      moods: found,
      revert: async () => {
        await store().deleteNote(noteId);
      },
    };
  } catch (err) {
    console.warn('[WrapUp] could not save the journal entry:', err);
    return {
      ok: false,
      message: err instanceof Error && err.message ? err.message : 'It was not saved.',
    };
  }
}

export type JournalChanged =
  | {
      ok: true;
      /** The moods the background read found, when the words changed and none were picked */
      moods: Promise<Mood[] | null>;
    }
  | { ok: false; message: string };

/**
 * Change an entry that is already in the journal: its words, its moods and
 * the page it is laid out on. When the words changed it is read again in the
 * background, for a title, tags and people that fit what it says now.
 *
 * It works on any journal entry, not only one from a wrap up, and leaves an
 * entry's own marks and tags as they were.
 */
export async function updateJournal(p: {
  noteId: string;
  text: string;
  moods: Mood[];
  /** Left out for an entry that is now plain words */
  page?: JournalLayout;
}): Promise<JournalChanged> {
  const note = (
    store().notes as {
      id: string;
      archived?: boolean | null;
      body?: string | null;
      tags?: string[] | null;
      views?: Record<string, unknown> | null;
    }[]
  ).find((n) => n.id === p.noteId);
  if (!note || note.archived) return { ok: false, message: 'It is no longer in your journal.' };
  const text = p.text.trim();
  const moods = knownMoods(p.moods);
  if (!text && !moods.length) return { ok: false, message: 'Nothing to save.' };

  const views: Record<string, unknown> = { ...(note.views ?? {}) };
  if (views.sweep_reflection) views.sweep_moods = moods;
  if (p.page) views[LAYOUT_KEY] = p.page;
  else delete views[LAYOUT_KEY];
  try {
    await store().updateNote(p.noteId, {
      body: text || null,
      mood: moods.length ? moods : null,
      views,
    });
  } catch (err) {
    console.warn('[Journal] could not save the change:', err);
    return {
      ok: false,
      message: err instanceof Error && err.message ? err.message : 'It was not saved.',
    };
  }
  const reread = !!text && text !== (note.body ?? '').trim();
  const found = reread
    ? enrich(p.noteId, text, moods, {
        baseTags: note.tags ?? [],
        keepTitle: !!views.goal_checkin,
      }).catch((err) => {
        console.warn('[Journal] the background read of the change failed:', err);
        return null;
      })
    : Promise.resolve(null);
  return { ok: true, moods: found };
}

/** Change the moods on tonight's entry. */
export async function setJournalMoods(noteId: string, day: string, moods: Mood[]): Promise<void> {
  const clean = knownMoods(moods);
  const note = (store().notes as { id: string; views?: Record<string, unknown> | null }[]).find(
    (n) => n.id === noteId,
  );
  if (!note) return;
  await store().updateNote(noteId, {
    mood: clean.length ? clean : null,
    views: { ...(note.views ?? {}), ...sweepViews(day, clean) },
  });
}

/** Tonight's entry, if one was already written from a wrap up for this day. */
export function journalFor(
  notes: { id: string; archived?: boolean | null; subtype?: string | null; views?: unknown }[],
  day: string,
): string | null {
  for (const n of notes) {
    if (n.archived || n.subtype !== 'journal') continue;
    const v = n.views as { sweep_reflection?: boolean; sweep_date?: string } | null | undefined;
    if (v?.sweep_reflection && v.sweep_date === day) return n.id;
  }
  return null;
}
