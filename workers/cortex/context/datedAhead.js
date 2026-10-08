/**
 * Dated things ahead, for chat (data fabric stage 2): the plans, events and
 * deadlines in someone's ledger that are still ahead or under way, each item
 * once (public.dated_ahead). It takes the place of the anchors list chat used
 * to keep from conversations: the reader now reads every conversation into
 * the ledger, so the ledger is the one place a dated thing lives.
 *
 * KV cached for five minutes, and dropped with the rest of chat's cache when
 * the pipeline changes what it holds (workers/shared/chatCache.js).
 */

import { stateWords } from '../../shared/factTiming.js';

const TTL_SECONDS = 300;
const DAYS_AHEAD = 42;

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Their day as YYYY-MM-DD: the caller's (a day or a promise of one), else the calendar's. */
async function dayOf(today, timezone) {
  return (
    (await Promise.resolve(today).catch(() => null)) ||
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC' }).format(new Date())
  );
}

/** Whole days from one date to another. */
function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
}

/** How far a date is from their day, in words. */
export function whenWords(date, today) {
  const n = daysBetween(today, date);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n > 1 && n <= 13) return `in ${n} days`;
  if (n > 13) return `in about ${Math.round(n / 7)} weeks`;
  return 'under way';
}

/** The rows from public.dated_ahead for this person, from their day on. */
export async function fetchDatedAhead(userId, env, { today = null, timezone = 'UTC' } = {}) {
  if (!userId) return null;
  const day = await dayOf(today, timezone);
  const cacheKey = `dated-ahead:${userId}`;
  try {
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached) {
        const hit = JSON.parse(cached);
        if (hit?.day === day) return hit;
      }
    }
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/dated_ahead`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_user: userId, p_from: day, p_days: DAYS_AHEAD, p_limit: 30 }),
    });
    if (!res.ok) {
      console.error('[DatedAhead] read failed:', res.status);
      return null;
    }
    const rows = await res.json();
    const out = { day, rows: Array.isArray(rows) ? rows : [] };
    if (env.CONTEXT_CACHE)
      await env.CONTEXT_CACHE.put(cacheKey, JSON.stringify(out), { expirationTtl: TTL_SECONDS });
    return out;
  } catch (error) {
    console.error('[DatedAhead] error:', error);
    return null;
  }
}

/** The rows as a context block for chat, or '' when there are none. */
export function formatDatedAhead(read) {
  const rows = read?.rows || [];
  if (!rows.length) return '';
  const lines = rows.map((r) => {
    const end =
      r.about_date_end && r.about_date_end !== r.about_date ? ` to ${r.about_date_end}` : '';
    const when = r.about_date < read.day ? 'under way' : whenWords(r.about_date, read.day);
    return `- ${r.about_date}${end} (${when}) | ${stateWords(r, read.day)} | ${trim(r.statement, 240)}${r.private || r.health ? ' [private: use when it bears on what they are talking about, in their own words; never open with it]' : ''}`;
  });
  return `=== DATED THINGS AHEAD (from their own records, with how each stands; a plan stays a plan until they say it happened, and unconfirmed means it may no longer hold) ===\n${lines.join('\n')}`;
}
