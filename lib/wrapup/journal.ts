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
 */
import { env, getEnv } from '../env';
import { getSessionToken } from '../cortex/getSessionToken';
import { getDateService } from '../date/DateService';
import { useGremlyStore } from '../store/useGremlyStore';
import { ALL_MOODS, type Mood } from '../shared/moods';

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
  day: string,
  moods: Mood[],
  dayMoods: Promise<Mood[] | null> | undefined,
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
  if (title?.smart_title) patch.title = title.smart_title;
  let tags = [...TAGS];
  if (Array.isArray(read?.tags)) tags = [...new Set([...tags, ...read.tags])];
  if (Array.isArray(read?.people)) {
    const people = read.people.map(personTag).filter((t: string | null): t is string => !!t);
    tags = [...new Set([...tags, ...people])];
  }
  if (tags.length > TAGS.length) patch.tags = tags;
  // the moods Gremly read from their words with the rest of their day, when he
  // gave any; the background read of the words alone otherwise
  const withDay = knownMoods(await Promise.resolve(dayMoods).catch(() => null));
  const found = withDay.length ? withDay : knownMoods(read?.mood);
  // a mood they picked themselves is kept; the one read from their words fills in when they picked none
  if (found.length && !moods.length) patch.mood = found;
  if (read?.energy_type) patch.energy_type = read.energy_type;
  if (title?.confirmation_message || read?.mood) {
    patch.views = {
      ...sweepViews(day, moods),
      ...(title?.confirmation_message ? { confirmation_message: title.confirmation_message } : {}),
      ...(read?.mood ? { ai_mood: read.mood } : {}),
    };
  }
  // taken back out since: leave it alone
  const still = (store().notes as { id: string; archived?: boolean }[]).find(
    (n) => n.id === noteId,
  );
  if (!still || still.archived) return null;
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
      views: sweepViews(p.day, moods),
    });
    const noteId = created?.id as string | undefined;
    if (!noteId) return { ok: false, message: 'It was not saved.' };
    const found = text
      ? enrich(noteId, text, p.day, moods, p.dayMoods).catch((err) => {
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
