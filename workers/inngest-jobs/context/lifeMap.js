/**
 * Gremly's read of the whole of their life, given to the narrower writers as
 * background (James, 18 Oct): the Life Map the weekly pass writes each week
 * from everything they record, so a writer that sees only one World, one
 * Chapter or one set of records still knows where its part fits in their life.
 *
 * It is Gremly's own writing, never a record: nothing rests on it, nothing
 * cites it, and nothing it says is said unless a record the writer is given
 * holds it too. The check holds every sentence to its records as before.
 *
 * Behind LIFE_MAP_BACKGROUND (wrangler.toml): "on" gives it to every writer
 * that takes it, a list of writers (words, person_words, memory,
 * chapter_questions, people_questions, review, reader) gives it to those
 * alone, and anything else gives none, so their prompts stay as they were.
 */

/** The writers that take it, by the name the switch uses. */
export const LIFE_MAP_WRITERS = ['words', 'person_words', 'memory', 'chapter_questions', 'people_questions', 'review', 'reader'];

/** Whether this writer is given Gremly's read of their life. */
export function lifeMapBackgroundOn(env, writer) {
  const v = String(env?.LIFE_MAP_BACKGROUND ?? '').trim();
  if (v === 'on') return true;
  return v
    .split(',')
    .map((x) => x.trim())
    .includes(writer);
}

/** The rules every writer given the background carries. Semantic only. */
export const LIFE_MAP_RULES = `GREMLY'S READ OF THEIR LIFE
- You are also given Gremly's own read of the whole of their life, written each week from everything they record. It is there so you understand where what you are given fits in their life: what matters to them now, what it connects to, and who is part of it.
- It is never a record. Nothing rests on it and nothing cites it, and nothing it says is said unless a record given here holds it too.
- Where it touches anything private or about health, it may help you understand them, and what it says there is never named or hinted at.`;

/** Most threads given: those that matter most, then the most recently active. */
export const LIFE_MAP_MOST = 30;

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const IMPORTANCE = { high: 0, medium: 1, low: 2 };

/**
 * The Life Map as background lines: each thread still active or quiet, with
 * its domain, how much it matters and how it stands, when it was last active,
 * Gremly's note on it and what happened in it lately. The threads that matter
 * most come first, then the most recently active. Pure.
 * @param lifeMap the life_map JSON of user_life_map
 */
export function lifeMapLines(lifeMap, { most = LIFE_MAP_MOST } = {}) {
  const threads = [];
  for (const dom of lifeMap?.domains || [])
    for (const t of dom?.threads || []) {
      if (!t || (t.lifecycle && !['active', 'dormant'].includes(t.lifecycle))) continue;
      const note = trim(t.summary, 300);
      if (!note) continue;
      const stands = [
        t.importance ? `matters ${t.importance}` : null,
        t.attention ? String(t.attention).replace(/_/g, ' ') : null,
        t.status || null,
        t.momentum || null,
        t.lifecycle === 'dormant' ? 'no recent activity' : null,
      ].filter(Boolean);
      const lately = trim(t.recent_update, 200);
      threads.push({
        rank: IMPORTANCE[t.importance] ?? 1,
        last: String(t.last_activity || ''),
        line: `${trim(dom.name, 40)} / ${trim(t.name, 60)} | ${stands.join(', ') || 'as it stands'} | last active ${t.last_activity || 'unknown'} | ${note}${lately ? ` Lately: ${lately}` : ''}`,
      });
    }
  return threads
    .sort((a, b) => a.rank - b.rank || b.last.localeCompare(a.last))
    .slice(0, most)
    .map((t) => t.line);
}

/** The section a writer's input carries, or none. Pure. */
export function lifeMapSection(lines) {
  if (!lines?.length) return '';
  return `GREMLY'S READ OF THEIR LIFE, NEVER A RECORD (domain / thread | how much it matters and how it stands | last active | Gremly's note):\n${lines.join('\n')}`;
}

/**
 * The background for one person and one writer, when the switch gives it:
 * the lines, or none when it does not or no Life Map has been written yet.
 */
export async function loadLifeMapLines(env, d, userId, writer) {
  if (!lifeMapBackgroundOn(env, writer)) return [];
  const [row] = (await d.select(`user_life_map?user_id=eq.${userId}&select=life_map&limit=1`)) || [];
  return lifeMapLines(row?.life_map);
}
