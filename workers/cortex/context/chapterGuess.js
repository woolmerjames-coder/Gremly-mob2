// ============================================================================
// chapterGuess.js: Gremly's guesses when someone starts a Chapter by hand
// (Worlds rebuild, stage 3, decision 6). They type one line; Gremly fills in
// the name, the World it belongs in (or a new World when none fits), the days
// the line gives, a Gremly to wear when one suits it better than its World's,
// and which of their things already belong in it. Every field shows on the
// sheet to change before anything is made; nothing is made here.
//
// The model judges; code only keeps what is theirs: a World they see, their
// own things from the list it was given, a Gremly that exists, and days that
// are days and in order.
// ============================================================================

import { db as dbFor } from '../../shared/db.js';
import { GREMLY_CATALOG, GREMLY_SLUGS, PLAIN_GREMLY } from '../../shared/gremlys.js';
import { helperFetch } from '../helperClient.js';
import { trim } from '../agent/tools/words.js';

export const GUESS_VERSION = 'chapter-guess-2026-10-08b';

const SHOWN = ['active', 'evolving', 'dormant'];
const OPEN = ['upcoming', 'active'];
// enough of their things to find what belongs, and no more
const LIMITS = { worlds: 40, chapters: 40, todos: 60, notes: 40, habits: 20, items: 20 };
const WAIT_MS = 8000;

const GUESS_RULES = `You help someone start a Chapter in Gremly, their companion app, from one line they typed. A Chapter is something in their life with a shape of its own, something they are working towards, going through or planning, often with dates, inside one of their Worlds. A World is a lasting part of their life.

From their line, give:
- title: the Chapter's name as they would say it, close to their own words, without its dates.
- world: the ref of the World it belongs in. When none of their Worlds fits, leave it empty and give new_world: a short name for the lasting part of their life it belongs to, and the slug of the Gremly whose look suits that World.
- start_date and end_date: only days their line gives or plainly means, read against today, as YYYY-MM-DD. A single day it happens on, or a day it must be done by, is the end date. A month or a season with no day in it gives no day. Empty when the line gives none.
- gremly: the slug of a Gremly whose look suits this Chapter better than its World's Gremly does, or empty when its World's suits it.
- items: the refs of their things below that plainly belong in this Chapter. Most lines have few or none, and a thing that only shares a word with the line does not belong.
Never add anything the line and their things do not say.

Return only JSON: {"title":"","world":"","new_world":null or {"name":"","gremly":""},"start_date":"","end_date":"","gremly":"","items":[""]}`;

const day = (v) => {
  const s = String(v || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
};
const clean = (v) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const worldName = (w) => clean(w?.display_name || w?.name) || 'a World';

/** Their Worlds, open Chapters and recent things, read for one guess. Never throws. */
export async function readGuessInput(d, userId) {
  const q = (path) => d.select(path).catch(() => []);
  const [worlds, chapters, todos, notes, habits, links] = await Promise.all([
    q(
      `worlds?owner_id=eq.${userId}&select=id,name,display_name,phase,card_subtitle,mascot_slug&order=created_at.asc&limit=100`,
    ),
    q(
      `chapters?owner_id=eq.${userId}&closed_at=is.null&select=id,title,phase,primary_world_id&order=created_at.desc&limit=100`,
    ),
    q(
      `todos?owner_id=eq.${userId}&completed_at=is.null&archived=is.false&select=id,name,title,due_day,created_at&order=created_at.desc&limit=${LIMITS.todos}`,
    ),
    q(
      `notes?owner_id=eq.${userId}&archived=is.false&subtype=neq.journal&select=id,title,body,subtype,created_at&order=created_at.desc&limit=${LIMITS.notes}`,
    ),
    q(
      `habits?owner_id=eq.${userId}&archived=is.false&select=id,name,title,created_at&order=created_at.desc&limit=${LIMITS.habits}`,
    ),
    q(`drop_chapter_links?owner_id=eq.${userId}&select=drop_id,chapter_id&limit=2000`),
  ]);
  const open = (chapters || []).filter((c) => OPEN.includes(c.phase)).slice(0, LIMITS.chapters);
  const openIds = new Set(open.map((c) => c.id));
  // a thing already in an open Chapter stays there
  const inOpen = new Set(
    (links || []).filter((l) => openIds.has(l.chapter_id)).map((l) => l.drop_id),
  );
  const items = [
    ...(todos || []).map((t) => ({
      type: 'todo',
      id: t.id,
      title: clean(t.name || t.title),
      due: day(t.due_day),
    })),
    ...(notes || []).map((n) => ({
      type: n.subtype === 'idea' ? 'idea' : 'note',
      id: n.id,
      title: clean(n.title) || clean(String(n.body || '').split('\n')[0]),
      due: null,
    })),
    ...(habits || []).map((h) => ({
      type: 'habit',
      id: h.id,
      title: clean(h.name || h.title),
      due: null,
    })),
  ].filter((i) => i.title && !inOpen.has(i.id));
  return {
    worlds: (worlds || []).filter((w) => SHOWN.includes(w.phase)).slice(0, LIMITS.worlds),
    chapters: open,
    items,
  };
}

/** The guess request, with the refs its answer is read back by. Pure. */
export function guessRequest({ line, today, worlds, chapters, items }) {
  const refs = { worlds: new Map(), items: new Map() };
  const worldLines = worlds.map((w, i) => {
    const ref = `w${i + 1}`;
    refs.worlds.set(ref, w);
    return `${ref} | ${trim(worldName(w), 60)}${w.card_subtitle ? ` | ${trim(w.card_subtitle, 120)}` : ''}`;
  });
  const byWorld = new Map(worlds.map((w) => [w.id, w]));
  const chapterLines = chapters.map(
    (c) =>
      `${trim(c.title, 80)}${byWorld.get(c.primary_world_id) ? ` | in ${worldName(byWorld.get(c.primary_world_id))}` : ''}`,
  );
  const itemLines = items.map((it, i) => {
    const ref = `i${i + 1}`;
    refs.items.set(ref, it);
    return `${ref} | ${it.type} | ${trim(it.title, 120)}${it.due ? ` | due ${it.due}` : ''}`;
  });
  const gremlyLines = GREMLY_CATALOG.map(
    (g) => `${g.slug} | ${g.slug === PLAIN_GREMLY ? 'the plain Gremly: ' : ''}${g.visual}`,
  );
  const user = [
    `TODAY: ${today}.`,
    `THEIR LINE: "${trim(line, 300)}"`,
    '',
    'THEIR WORLDS (ref | name | what it holds):',
    worldLines.join('\n') || '(none yet)',
    '',
    'THEIR CHAPTERS OPEN NOW (title | World):',
    chapterLines.join('\n') || '(none)',
    '',
    'THEIR THINGS IN NO OPEN CHAPTER, newest first (ref | kind | title | due):',
    itemLines.join('\n') || '(none)',
    '',
    'THE GREMLYS (slug | how it looks):',
    gremlyLines.join('\n'),
  ].join('\n');
  return { system: GUESS_RULES, user, refs };
}

/**
 * The guess as the sheet takes it, keeping only what is theirs and real.
 * Pure. Never throws.
 */
export function guessFrom(output, { line, refs }) {
  const o = output && typeof output === 'object' ? output : {};
  const title = trim(clean(o.title) || clean(line), 80);
  const world = refs.worlds.get(clean(o.world)) || null;
  const nw = !world && o.new_world && typeof o.new_world === 'object' ? o.new_world : null;
  const newName = nw ? trim(clean(nw.name), 40) : '';
  const slug = (v) => (GREMLY_SLUGS.includes(clean(v)) ? clean(v) : null);
  let start = day(o.start_date);
  let end = day(o.end_date);
  if (start && end && end < start) {
    start = null;
    end = null;
  }
  const seen = new Set();
  const items = [];
  for (const r of Array.isArray(o.items) ? o.items : []) {
    const it = refs.items.get(clean(r));
    if (!it || seen.has(it.id)) continue;
    seen.add(it.id);
    items.push({ type: it.type === 'idea' ? 'note' : it.type, id: it.id });
    if (items.length >= LIMITS.items) break;
  }
  return {
    title,
    world_id: world ? world.id : null,
    new_world: newName ? { name: newName, gremly: slug(nw.gremly) || PLAIN_GREMLY } : null,
    start_date: start,
    end_date: end,
    gremly: slug(o.gremly),
    items,
    version: GUESS_VERSION,
  };
}

/**
 * Gremly's guesses for a Chapter started from one line. Resolves to the
 * guess, or to { guessed: false } when there is no line or no answer in time;
 * the sheet is then filled in by hand. Never throws.
 */
export async function guessChapter(env, userId, { line, today }, deps = {}) {
  const said = clean(line).slice(0, 300);
  if (!userId || !said) return { guessed: false };
  const when = day(today) || new Date().toISOString().slice(0, 10);
  const work = (async () => {
    const input = await readGuessInput(deps.db || dbFor(env), userId);
    const { system, user, refs } = guessRequest({ line: said, today: when, ...input });
    const ask = deps.helperFetch || helperFetch;
    const res = await ask('chapter_guess', {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 600,
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    if (!res?.ok) return { guessed: false };
    const json = await res.json().catch(() => null);
    let out = null;
    try {
      out = JSON.parse(json?.choices?.[0]?.message?.content || '{}');
    } catch {
      return { guessed: false };
    }
    return { guessed: true, ...guessFrom(out, { line: said, refs }) };
  })().catch((err) => {
    console.warn('[ChapterGuess] failed', String(err?.message || err).slice(0, 200));
    return { guessed: false };
  });
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ guessed: false, late: true }), deps.waitMs ?? WAIT_MS);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}
