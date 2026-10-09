// ============================================================================
// pageDetail.js: a World's or a Chapter's own chat (Worlds rebuild, stage 2).
// The app sends the page a chat was opened from as the chat's anchor, with
// every turn, like an item's chat. Here: that anchor read, and what is on the
// page in words, with ids, for the quick lane's writer and for the agent, so
// "this" and "it" mean the page, and its steps can be ticked or changed.
//
// Read with the service key, scoped to the person. Never throws: a page that
// cannot be read leaves the section out.
// ============================================================================

import { db as dbFor } from '../../shared/db.js';
import { dayWords, trim } from '../agent/tools/words.js';

const ID = /^[0-9a-f-]{36}$/i;
export const PAGE_TYPES = ['world', 'chapter'];

// enough to know the page, and no more
const LIMITS = { steps: 25, kept: 12, chapters: 12, loose: 12 };

/** The page a chat was opened from, as the app sends it: {id, type, title}, or null. */
export function pageAnchorFrom(raw) {
  if (!raw || typeof raw !== 'object' || !PAGE_TYPES.includes(raw.type)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 120) : '';
  if (!ID.test(id) || !title) return null;
  return { id, type: raw.type, title };
}

const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const worldName = (w) => String(w?.display_name || w?.name || '').trim() || 'a World';
const closed = (c) => !!c?.closed_at || c?.phase === 'closed';

function chapterWhen(c, today) {
  const s = day(c.start_date);
  const e = day(c.end_date);
  if (s && e && s !== e) return `${dayWords(s, today)} to ${dayWords(e, today)}`;
  if (e) return `${e < today ? 'its date passed on' : 'by'} ${dayWords(e, today)}`;
  if (s) return `${s > today ? 'from' : 'since'} ${dayWords(s, today)}`;
  return 'no date';
}

const idList = (ids) => [...new Set(ids)].filter((x) => ID.test(String(x))).join(',');

/** Their todos, notes and habits with these ids, read once each. */
async function itemsOf(d, userId, links) {
  const ids = (type) => idList(links.filter((l) => l.drop_type === type).map((l) => l.drop_id));
  const read = (table, select, list) =>
    list
      ? d
          .select(
            `${table}?owner_id=eq.${userId}&id=in.(${list})&archived=not.is.true&select=${select}`,
          )
          .catch(() => [])
      : Promise.resolve([]);
  const [todos, notes, habits] = await Promise.all([
    read('todos', 'id,name,title,due_day,completed_at,created_at', ids('todo')),
    read('notes', 'id,title,body,list_items,target_date,created_at', ids('note')),
    read('habits', 'id,name,title', ids('habit')),
  ]);
  return { todos: todos || [], notes: notes || [], habits: habits || [] };
}

function stepLines(todos, today) {
  const open = todos
    .filter((t) => !t.completed_at)
    .sort((a, b) => String(a.due_day || '9999').localeCompare(String(b.due_day || '9999')));
  const done = todos.filter((t) => t.completed_at);
  const line = (t) =>
    `- ${trim(t.name || t.title, 80)} (todo, id ${t.id})${t.due_day ? `, due ${dayWords(day(t.due_day), today)}` : ''}${t.completed_at ? ', done' : ''}`;
  return [...open, ...done].slice(0, LIMITS.steps).map(line);
}

function keptLines(notes, habits) {
  const note = (n) => {
    const name = trim(n.title || String(n.body || '').split('\n')[0] || 'a note', 60);
    const list = Array.isArray(n.list_items) && n.list_items.length;
    return `- ${name} (note, id ${n.id})${list ? `, a list of ${n.list_items.length}` : ''}`;
  };
  const habit = (h) => `- ${trim(h.name || h.title, 60)} (habit, id ${h.id})`;
  return [...notes.slice(0, LIMITS.kept).map(note), ...habits.slice(0, LIMITS.kept).map(habit)];
}

/**
 * What is on the page, in words with ids, or '' when it cannot be read.
 * @param {object} env
 * @param {string} userId
 * @param {{id: string, type: 'world'|'chapter', title: string}} page
 * @param {string} today YYYY-MM-DD
 */
export async function fetchPageDetail(env, userId, page, today, deps = {}) {
  if (!page || !userId) return '';
  const d = deps.db || dbFor(env);
  try {
    if (page.type === 'chapter') {
      const [rows, links] = await Promise.all([
        d.select(
          `chapters?id=eq.${page.id}&owner_id=eq.${userId}&select=id,title,phase,start_date,end_date,closed_at,primary_world_id,card_subtitle,epigraph&limit=1`,
        ),
        d
          .select(
            `drop_chapter_links?chapter_id=eq.${page.id}&owner_id=eq.${userId}&select=drop_id,drop_type&limit=200`,
          )
          .catch(() => []),
      ]);
      const c = rows?.[0];
      if (!c) return '';
      const [world, items] = await Promise.all([
        c.primary_world_id
          ? d
              .select(
                `worlds?id=eq.${c.primary_world_id}&owner_id=eq.${userId}&select=id,name,display_name&limit=1`,
              )
              .then((r) => r?.[0] || null)
              .catch(() => null)
          : Promise.resolve(null),
        itemsOf(d, userId, links || []),
      ]);
      const lines = [
        `THIS CHAT IS ON ONE OF THEIR CHAPTERS, opened from its page: "${trim(c.title, 80)}" (id ${c.id})${world ? `, in their World ${worldName(world)} (id ${world.id})` : ''}, ${chapterWhen(c, today)}${closed(c) ? ', closed and part of their story' : ''}. When they say this, it or here, they mean this Chapter, and a step or a note they add here belongs in it, so it is added with chapters set to this Chapter. Something they already have that they want here is moved in by changing its chapters, never added again.${closed(c) ? '' : ' When they say it is finished, closing it is what they are asking for.'}`,
      ];
      if (c.card_subtitle) lines.push(`Its words: ${trim(c.card_subtitle, 300)}`);
      if (closed(c) && c.epigraph) lines.push(`Its memory: ${trim(c.epigraph, 400)}`);
      const steps = stepLines(items.todos, today);
      lines.push(
        steps.length ? `Its steps, open ones first:\n${steps.join('\n')}` : 'Its steps: none yet.',
      );
      const kept = keptLines(items.notes, items.habits);
      if (kept.length) lines.push(`Kept on it:\n${kept.join('\n')}`);
      return lines.join('\n');
    }

    const [rows, chapters, links, inChapters] = await Promise.all([
      d.select(
        `worlds?id=eq.${page.id}&owner_id=eq.${userId}&select=id,name,display_name,phase,card_subtitle&limit=1`,
      ),
      d
        .select(
          `chapters?primary_world_id=eq.${page.id}&owner_id=eq.${userId}&select=id,title,phase,start_date,end_date,closed_at&order=created_at.asc&limit=100`,
        )
        .catch(() => []),
      d
        .select(
          `drop_world_links?world_id=eq.${page.id}&owner_id=eq.${userId}&select=drop_id,drop_type&limit=300`,
        )
        .catch(() => []),
      d
        .select(`drop_chapter_links?owner_id=eq.${userId}&select=drop_id,drop_type&limit=2000`)
        .catch(() => []),
    ]);
    const w = rows?.[0];
    if (!w) return '';
    // what is in the World and in none of its Chapters
    const filed = new Set((inChapters || []).map((l) => `${l.drop_type}:${l.drop_id}`));
    const loose = (links || []).filter((l) => !filed.has(`${l.drop_type}:${l.drop_id}`));
    const items = await itemsOf(d, userId, loose);
    const open = (chapters || []).filter((c) => !closed(c) && c.phase !== 'suggested');
    const done = (chapters || []).filter(closed);
    const lines = [
      `THIS CHAT IS ON ONE OF THEIR WORLDS, opened from its page: "${worldName(w)}" (id ${w.id})${w.phase === 'archived' ? ', which they hid' : ''}. When they say this, it or here, they mean this World, and something they add here belongs in it, so it is added with worlds set to this World. Something they already have that they want here is moved in by changing its worlds, never added again.`,
    ];
    if (w.card_subtitle) lines.push(`Its words: ${trim(w.card_subtitle, 300)}`);
    lines.push(
      open.length
        ? `Its Chapters now:\n${open
            .slice(0, LIMITS.chapters)
            .map((c) => `- ${trim(c.title, 80)} (id ${c.id}), ${chapterWhen(c, today)}`)
            .join('\n')}`
        : 'Its Chapters now: none.',
    );
    if (done.length)
      lines.push(
        `Its closed Chapters: ${done
          .slice(-LIMITS.chapters)
          .map((c) => trim(c.title, 60))
          .join('; ')}`,
      );
    const steps = stepLines(
      items.todos.filter((t) => !t.completed_at),
      today,
    ).slice(0, LIMITS.loose);
    if (steps.length) lines.push(`Its own todos, in none of its Chapters:\n${steps.join('\n')}`);
    const kept = keptLines(items.notes, items.habits);
    if (kept.length) lines.push(`Kept in it:\n${kept.join('\n')}`);
    return lines.join('\n');
  } catch (err) {
    console.warn('[PageDetail] could not read the page', String(err?.message || err).slice(0, 200));
    return '';
  }
}
