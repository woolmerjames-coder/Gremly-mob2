// ============================================================================
// places.js: the person's Worlds and Chapters for the agent (Worlds rebuild,
// stage 2), read once a turn. What it knows of them, with ids, so it never
// guesses a name; the rows the change model checks a World or Chapter change
// against; and which of their items a new Chapter may gather.
//
// Only for an app build that can apply changes to Worlds and Chapters
// (the request's worldsCard), so an older build is never told of them.
// ============================================================================

import { dayWords, trim } from './tools/words.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WORLD_COLS = 'id,name,display_name,phase,card_subtitle,mascot_slug,created_at';
const CHAPTER_COLS =
  'id,title,phase,start_date,end_date,primary_world_id,closed_at,card_subtitle,mascot_slug,created_at';

// the World phases the person sees (archived is a World they hid); the rest
// are the old classifier's and are not shown
const SHOWN = ['active', 'evolving', 'dormant'];
const OPEN = ['upcoming', 'active'];

// enough to name what they have, and no more
const LIMITS = { worlds: 40, open: 40, closed: 12, declined: 12 };

/**
 * How Gremly works with their Worlds and Chapters, said with them in what the
 * agent knows. James's rules: Gremly suggests and the person taps; a Chapter
 * is offered once for each thing, a maybe gets one short question first and
 * an idea makes nothing; filing is never asked about; nothing is deleted from
 * a card; words and an outfit only when they ask.
 */
export const PLACES_RULES = `How Gremly works with them: they change on the card like anything else. Gremly files their things into them quietly on his own, so never ask where something belongs. When something of theirs with a shape that is not one of their Chapters comes up, you may offer once to start a Chapter for it, in the World it belongs in, gathering the items that belong in it; when it is not clear it is really happening, ask one short question first, start nothing for an idea, and never offer one they said no to. When they say a Chapter is finished, put closing it on the card. Nothing is deleted from here: when they ask to delete one, offer to hide or close it and say they can delete it from its page. Change words or an outfit only when they ask.`;

const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/** Their Worlds and Chapters, read once for the turn. Never throws. */
export async function readPlaces(ctx) {
  ctx.cache = ctx.cache || new Map();
  if (ctx.cache.has('places')) return ctx.cache.get('places');
  const d = ctx.db;
  const [worlds, chapters, declined] = await Promise.all([
    d
      .select(
        `worlds?owner_id=eq.${ctx.userId}&select=${WORLD_COLS}&order=created_at.asc&limit=100`,
      )
      .catch(() => []),
    d
      .select(
        `chapters?owner_id=eq.${ctx.userId}&select=${CHAPTER_COLS}&order=created_at.asc&limit=300`,
      )
      .catch(() => []),
    d
      .select(
        `gremly_questions?user_id=eq.${ctx.userId}&kind=eq.start_chapter&status=eq.dismissed&select=proposed_change,topic,answered_at&order=answered_at.desc.nullslast&limit=${LIMITS.declined}`,
      )
      .catch(() => []),
  ]);
  const out = {
    worlds: (worlds || []).filter((w) => SHOWN.includes(w.phase) || w.phase === 'archived'),
    chapters: (chapters || []).filter((c) => c.phase !== 'suggested'),
    declined: (declined || [])
      .map((q) => String(q?.proposed_change?.title || q?.topic || '').trim())
      .filter(Boolean),
  };
  ctx.cache.set('places', out);
  return out;
}

export const worldName = (w) => String(w?.display_name || w?.name || '').trim() || 'a World';
export const isHidden = (w) => w?.phase === 'archived';
export const isClosed = (c) => !!c?.closed_at || c?.phase === 'closed';
export const isOpen = (c) => !isClosed(c) && OPEN.includes(c?.phase);

/** The Worlds and Chapters in the shape the change model checks against. */
export function checkPlaces(places) {
  return {
    worlds: places.worlds.map((w) => ({ id: w.id, name: worldName(w), hidden: isHidden(w) })),
    chapters: places.chapters.map((c) => ({ id: c.id, title: c.title })),
  };
}

/** When a Chapter is, in the words the tools use for days. */
function whenWords(c, today) {
  const s = day(c.start_date);
  const e = day(c.end_date);
  if (s && e && s !== e) return `${dayWords(s, today)} to ${dayWords(e, today)}`;
  if (e) return e < today ? `its date passed on ${dayWords(e, today)}` : `by ${dayWords(e, today)}`;
  if (s) return s > today ? `from ${dayWords(s, today)}` : `since ${dayWords(s, today)}`;
  return 'no date';
}

/**
 * What the agent knows of their Worlds and Chapters, with ids, and how Gremly
 * works with them (PLACES_RULES): the Worlds they see and the ones they hid, the Chapters open now with their World and dates
 * (one whose end has passed says so), the most recent closed ones, and the
 * Chapters Gremly offered that they said no to.
 */
export function placesContext(places, today) {
  if (!places) return '';
  const byId = new Map(places.worlds.map((w) => [w.id, w]));
  const shown = places.worlds.filter((w) => !isHidden(w)).slice(0, LIMITS.worlds);
  const hidden = places.worlds.filter(isHidden).slice(0, LIMITS.worlds);
  const open = places.chapters.filter(isOpen).slice(0, LIMITS.open);
  const closed = places.chapters
    .filter(isClosed)
    .sort((a, b) =>
      String(b.end_date || b.closed_at || '').localeCompare(
        String(a.end_date || a.closed_at || ''),
      ),
    )
    .slice(0, LIMITS.closed);
  const inWorld = (c) =>
    c.primary_world_id && byId.get(c.primary_world_id)
      ? `, in ${worldName(byId.get(c.primary_world_id))}`
      : '';
  const lines = [
    `THEIR WORLDS AND CHAPTERS (from Gremly's records, with ids for the card). ${PLACES_RULES}`,
  ];
  // a World's own line, when it has one, says what belongs in it
  const worldLine = (w) =>
    `${worldName(w)} (id ${w.id})${w.card_subtitle ? `: ${trim(w.card_subtitle, 120)}` : ''}`;
  lines.push(
    shown.length
      ? `Worlds:\n${shown.map((w) => `- ${worldLine(w)}`).join('\n')}`
      : 'Worlds: none yet.',
  );
  if (hidden.length)
    lines.push(`Worlds they hid: ${hidden.map((w) => `${worldName(w)} (id ${w.id})`).join('; ')}`);
  lines.push(
    open.length
      ? `Chapters open now:\n${open
          .map((c) => `- ${trim(c.title, 80)} (id ${c.id})${inWorld(c)}, ${whenWords(c, today)}`)
          .join('\n')}`
      : 'Chapters open now: none.',
  );
  if (closed.length)
    lines.push(
      `Chapters closed, most recent first:\n${closed
        .map((c) => `- ${trim(c.title, 80)} (id ${c.id})${inWorld(c)}`)
        .join('\n')}`,
    );
  if (places.declined.length)
    lines.push(
      `Chapters Gremly offered that they said no to: ${places.declined.map((t) => trim(t, 60)).join('; ')}`,
    );
  return lines.join('\n');
}

const TABLE = { todo: 'todos', habit: 'habits', note: 'notes' };

/**
 * Which of the items a new Chapter would gather are theirs, as "todo:<id>" and
 * so on. One read for each kind. Never throws; an item that cannot be read is
 * left out, so the change that names it is dropped.
 */
export async function itemKeysFor(ctx, refs) {
  const byType = new Map();
  for (const r of refs || []) {
    if (!TABLE[r?.type] || !UUID.test(String(r?.id || ''))) continue;
    if (!byType.has(r.type)) byType.set(r.type, new Set());
    byType.get(r.type).add(r.id);
  }
  const keys = new Set();
  await Promise.all(
    [...byType.entries()].map(async ([type, ids]) => {
      const rows = await ctx.db
        .select(
          `${TABLE[type]}?owner_id=eq.${ctx.userId}&id=in.(${[...ids].join(',')})&select=id&limit=${ids.size}`,
        )
        .catch(() => []);
      for (const row of rows || []) keys.add(`${type}:${row.id}`);
    }),
  );
  return keys;
}
