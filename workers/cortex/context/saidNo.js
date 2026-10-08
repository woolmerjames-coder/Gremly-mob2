// ============================================================================
// saidNo.js: a Chapter Gremly offered in chat that the person said no to
// (Worlds rebuild, stage 2; James's round one rule, once for each thing). It
// is kept in the same list as the brief's own suggestions to start a Chapter
// (gremly_questions, kind start_chapter, dismissed), so no chat and no brief
// offers it again: chat reads that list (agent/places.js), and the pipeline's
// suggestions skip what rests on the same items (inngest-jobs
// context/chapterQuestions.js restsOnDeclined).
// ============================================================================

import { db as dbFor } from '../../shared/db.js';

const ID = /^[0-9a-f-]{36}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// as inngest-jobs context/filed.js ITEM_TABLE
const ITEM_TABLE = { note: 'notes', todo: 'todos', habit: 'habits' };

/**
 * The key a suggestion's no is remembered by, as the pipeline makes it
 * (context/chapterQuestions.js startNoKey): the items it rests on. With none,
 * its name.
 */
export function chatNoKey(title, items) {
  if (items.length)
    return `start:${items
      .map((i) => `${i.table}:${i.id}`)
      .sort()
      .join(',')}`.slice(0, 900);
  return `start:named:${String(title).trim().toLowerCase()}`.slice(0, 900);
}

/** The row for one Chapter they said no to, or null when what came is not one. */
export function saidNoRow(userId, raw, now) {
  const title =
    typeof raw?.title === 'string' ? raw.title.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  if (!userId || !title) return null;
  const world = typeof raw.world_id === 'string' && ID.test(raw.world_id) ? raw.world_id : null;
  const day = (v) => (typeof v === 'string' && DAY.test(v) ? v : null);
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .filter((i) => ITEM_TABLE[i?.type] && ID.test(String(i?.id || '')))
    .slice(0, 50)
    .map((i) => ({ table: ITEM_TABLE[i.type], id: i.id }));
  return {
    user_id: userId,
    kind: 'start_chapter',
    question: `Start a Chapter for ${title}?`,
    status: 'dismissed',
    answer: 'no',
    answered_at: now,
    record_table: world ? 'worlds' : null,
    record_id: world,
    rests_on: items,
    proposed_change: {
      type: 'start',
      title,
      world_id: world,
      start_date: day(raw.start_date),
      end_date: day(raw.end_date),
      from: 'chat',
    },
    no_key: chatNoKey(title, items),
    prompt_version: 'chat-said-no',
  };
}

/**
 * Keep the Chapters they said no to. Never throws.
 * @returns {Promise<{kept: number}>}
 */
export async function rememberChapterNo(env, userId, list, deps = {}) {
  const now = deps.now ? deps.now() : new Date().toISOString();
  const rows = (Array.isArray(list) ? list : [])
    .slice(0, 10)
    .map((raw) => saidNoRow(userId, raw, now))
    .filter(Boolean);
  if (!rows.length) return { kept: 0 };
  try {
    await (deps.db || dbFor(env)).insertQuiet('gremly_questions', rows);
    return { kept: rows.length };
  } catch (err) {
    console.warn('[SaidNo] could not keep it', String(err?.message || err).slice(0, 200));
    return { kept: 0 };
  }
}
