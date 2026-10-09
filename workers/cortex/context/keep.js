// ============================================================================
// keep.js: Save from chat (Worlds rebuild, stage 2, decision 3). After Gremly
// replies in Ask Gremly, a World's or a Chapter's chat, or the box on Worlds,
// a small helper call reads the message and the reply and decides whether the
// reply gives them something they will want to come back to. When it does,
// the app puts a Save button under the reply, naming the Chapter or World it
// belongs in; one tap keeps it there as a note, or as a list with tick boxes,
// and a small arrow picks somewhere else.
//
// Gremly judges; no code reads the person's words to decide it. Code only
// checks that what is kept is in the reply as written and that the place is
// one of theirs. Whichever writer answered (the agent or the quick writer),
// the same check runs, for an app build that can show the button
// (worldsCard). The agent was given a tool for this first: it was called for
// most replies worth keeping, but the close card on a Chapter's own page
// fell from 6 in 6 to 3 or 4 in 6, and a packing list goes to the quick
// writer, not the agent (the chat replay, 8 October).
// ============================================================================

import { db as dbFor } from '../../shared/db.js';
import { helperFetch } from '../helperClient.js';
import { isHidden, isOpen, readPlaces, worldName } from '../agent/places.js';

export const KEEP_VERSION = 'keep-2026-10-09a';

const MOST_LINES = 40;
const LINE_CHARS = 300;
const TITLE_CHARS = 60;
const WAIT_MS = 6000;
// enough to name where it goes, and no more
const LIMITS = { worlds: 40, chapters: 40 };

function keepPrompt({ message, reply, page, card, worlds, chapters }) {
  const here = page
    ? `They are in the chat of their ${page.type === 'chapter' ? 'Chapter' : 'World'} ${page.title} (id ${page.id}), so what is kept belongs there unless it plainly belongs elsewhere.\n\n`
    : '';
  const withCard = card
    ? 'The reply came with changes to their things on a card for them to accept. What the card changes is theirs already, so only something new beyond those changes is worth keeping.\n\n'
    : '';
  return `You read a message a person sent to Gremly, their companion app, and Gremly's reply to it. Decide whether the reply gives them something new that they will want to come back to later, with enough in it to keep: a list to work through, or ideas, a plan, steps or what Gremly found out for something of theirs. Most replies are not worth keeping. A reply is not worth keeping when it talks with them, answers a quick question, asks them something, tells them about their own plans, week, things or past, or changes their things, since what is theirs is already kept.

When it is worth keeping, give what is worth keeping as it reads in the reply, without the words around it, each point, item or paragraph as one line, without bullet marks, numbers or bold; a short name for it; whether it is a list, which is things to tick off one by one, or a note, which is anything else; and where it belongs: the id of the open Chapter it is for, or else of the World it belongs in. Leave the place empty only when it belongs in none of their Worlds.

${withCard}${here}THEIR WORLDS
${worlds.map((w) => `${worldName(w)} (id ${w.id})${w.card_subtitle ? `: ${String(w.card_subtitle).slice(0, 120)}` : ''}`).join('\n') || 'none'}

THEIR CHAPTERS OPEN NOW
${chapters.map((c) => `${String(c.title).slice(0, 80)} (id ${c.id})${c.world ? `, in ${c.world}` : ''}`).join('\n') || 'none'}

THEIR MESSAGE
${message}

GREMLY'S REPLY
${reply}

Return only JSON: {"keep":true or false,"kind":"list" or "note","title":"<a short name>","lines":["<one line>"],"place":"<an id, or empty>"}`;
}

const clean = (v) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();
// how a line is compared with the reply: the reply's marks and spacing left out
const plain = (v) =>
  clean(
    String(v ?? '')
      .replace(/[*_`#>]/g, '')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"'),
  )
    .replace(/^([-•·]|\d+[.)])\s+/, '')
    .toLowerCase();

/**
 * What of the reply is worth keeping, and where, or null when nothing is.
 * Never throws, and never waits more than a few seconds.
 * @param {object} p
 * @param {string} p.message what they sent
 * @param {string} p.reply Gremly's reply
 * @param {{type: 'world'|'chapter', id: string, title: string} | null} [p.page] the World or Chapter whose chat this is
 * @param {boolean} [p.card] the reply came with a card of changes
 * @returns {Promise<null | {kind: 'note'|'list', title: string, lines: string[], place: {type: 'world'|'chapter', id: string, name: string} | null, version: string}>}
 */
export async function judgeKeep({
  env,
  userId,
  message,
  reply,
  page = null,
  card = false,
  deps = {},
}) {
  const said = clean(message);
  const answer = String(reply || '').trim();
  if (!userId || !said || !answer) return null;
  const work = (async () => {
    const ctx = { userId, db: deps.db || dbFor(env), cache: new Map() };
    const places = await readPlaces(ctx).catch(() => null);
    if (!places) return null;
    const worlds = places.worlds.filter((w) => !isHidden(w)).slice(0, LIMITS.worlds);
    const byId = new Map(places.worlds.map((w) => [w.id, w]));
    const chapters = places.chapters
      .filter(isOpen)
      .slice(0, LIMITS.chapters)
      .map((c) => ({
        ...c,
        world: byId.get(c.primary_world_id) ? worldName(byId.get(c.primary_world_id)) : null,
      }));
    const ask = deps.helperFetch || helperFetch;
    const res = await ask('keep_offer', {
      messages: [
        {
          role: 'system',
          content: keepPrompt({ message: said, reply: answer, page, card, worlds, chapters }),
        },
        { role: 'user', content: 'Decide whether the reply is worth keeping.' },
      ],
      max_tokens: 1500,
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    if (!res?.ok) return null;
    const json = await res.json().catch(() => null);
    let out = null;
    try {
      out = JSON.parse(json?.choices?.[0]?.message?.content || '{}');
    } catch {
      return null;
    }
    return keepFrom(out, { reply: answer, worlds, chapters: places.chapters });
  })().catch((err) => {
    console.warn('[Keep] the check failed', String(err?.message || err).slice(0, 200));
    return null;
  });
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve('late'), deps.waitMs ?? WAIT_MS);
  });
  try {
    const r = await Promise.race([work, late]);
    if (r === 'late') {
      console.warn('[Keep] the check took too long, so no Save button');
      return null;
    }
    return r;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The Save button from the helper's answer: only lines that are in the reply
 * as written, and only a place of theirs (an open Chapter, or a World they
 * see). Null when nothing is kept.
 */
export function keepFrom(out, { reply, worlds, chapters }) {
  if (!out || out.keep !== true) return null;
  const inReply = plain(reply);
  const lines = (Array.isArray(out.lines) ? out.lines : [])
    .map((l) => clean(String(l ?? '').replace(/[*_`]/g, '')).replace(/^([-•·]|\d+[.)])\s+/, ''))
    .map((l) => l.slice(0, LINE_CHARS))
    .filter((l) => l && inReply.includes(plain(l)))
    .slice(0, MOST_LINES);
  const title = clean(out.title).slice(0, TITLE_CHARS);
  if (!lines.length || !title) return null;
  const id = clean(out.place);
  const chapter = id ? chapters.find((c) => c.id === id && isOpen(c)) : null;
  const world = !chapter && id ? worlds.find((w) => w.id === id && !isHidden(w)) : null;
  const place = chapter
    ? { type: 'chapter', id: chapter.id, name: clean(chapter.title) }
    : world
      ? { type: 'world', id: world.id, name: worldName(world) }
      : null;
  return {
    kind: out.kind === 'list' ? 'list' : 'note',
    title,
    lines,
    place,
    version: KEEP_VERSION,
  };
}
