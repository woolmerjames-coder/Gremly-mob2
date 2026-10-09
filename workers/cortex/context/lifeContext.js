/**
 * Life context for chat: the full picture of the person that every chat lane
 * reads, plus a lookup of what Gremly remembers that bears on the message.
 *
 * The pack is written by the context pipeline (inngest-jobs): the story
 * (milestones, how things have shifted, proud moments, patterns, people),
 * Chapters, how they have used Gremly by week, month and year, the questions
 * Gremly is unsure about, the corrections they made, and today's brief.
 * Private items are included for Gremly's understanding and labelled: chat uses
 * them when they bear on what the person is talking about, in their own words,
 * and never opens with them.
 *
 * Cached in KV for 30 minutes. The pipeline deletes the cache entry whenever it
 * changes any of this, so a correction reaches chat on the next message.
 */

import { asOfToday, stateWords } from '../../shared/factTiming.js';
import { sourceWords } from '../../shared/factSource.js';

const PACK_TTL_SECONDS = 1800;

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function headers(env) {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function select(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: headers(env) });
  if (!res.ok) throw new Error(`select ${path.split('?')[0]} ${res.status}`);
  return res.json();
}

async function rpc(env, fn, args) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`rpc ${fn} ${res.status}`);
  return res.json();
}

function usageLine(p, label) {
  if (!p) return null;
  return `${label}: ${p.active_days} active days, ${p.drops} drops, ${p.todos_done} todos done, ${p.habit_checkins} habit check-ins, ${p.journals} journals, ${p.chat_messages} chat messages, ${p.sweeps} sweeps, ${p.fed_days} days fed${p.age_ups ? `, aged up ${p.age_ups} time${p.age_ups === 1 ? '' : 's'}` : ''}${p.world_visits ? `, ${p.world_visits} Worlds visits` : ''}`;
}

function formatStory(story) {
  if (!story) return '';
  const lines = [];
  const item = (s) =>
    `- ${s.from ? `${s.from}${s.to && s.to !== s.from ? ` to ${s.to}` : ''}: ` : ''}${trim(s.title, 100)}. ${trim(s.body, 320)}${s.private ? ' [private: use when it bears on what they are talking about, in their own words; never open with it]' : ''}`;
  if (story.story_so_far) lines.push(`Their story so far: ${trim(story.story_so_far, 2500)}`);
  if (story.milestones?.length) lines.push(`Milestones:\n${story.milestones.map(item).join('\n')}`);
  if (story.shifts?.length)
    lines.push(`How things have shifted for them:\n${story.shifts.map(item).join('\n')}`);
  if (story.proud_moments?.length)
    lines.push(
      `Moments they can be proud of (good to recall on a hard day):\n${story.proud_moments.map(item).join('\n')}`,
    );
  if (story.patterns?.length) {
    lines.push(
      `What they love, avoid and do often or rarely:\n${story.patterns.map((p) => `- ${p.kind || 'pattern'}: ${trim(p.title, 80)}. ${trim(p.body, 220)}${p.private ? ' [private: use when it bears on what they are talking about, in their own words; never open with it]' : ''}`).join('\n')}`,
    );
  }
  if (story.people?.length) lines.push(`People who matter:\n${story.people.map(item).join('\n')}`);
  return lines.join('\n\n');
}

/**
 * A Chapter as one line. A closed Chapter is told by its memory (epigraph:
 * theirs, or the one Gremly wrote when it closed, context/memory.js), which
 * says what the time was; its card line was written while it was still under
 * way. An open Chapter keeps its card line.
 */
export function chapterLine(c) {
  const when = `${c.start_date || '?'} to ${c.end_date || (c.phase === 'closed' ? '?' : 'now')}`;
  const words =
    c.phase === 'closed' && c.epigraph
      ? `remembered as: ${trim(c.epigraph, 240)}`
      : trim(c.card_subtitle, 160);
  return `- ${c.title} (${c.phase}, ${when})${words ? `: ${words}` : ''}`;
}

/**
 * The full picture of the person, for every chat lane. Returns '' when the
 * pipeline has not written anything for them yet.
 */
export async function getLifePack(userId, env) {
  if (!userId) return '';
  const cacheKey = `life-pack:${userId}`;
  try {
    if (env.CONTEXT_CACHE) {
      const cached = await env.CONTEXT_CACHE.get(cacheKey);
      if (cached !== null) return cached;
    }
    const [lifeMap, chapters, questions, corrections, week, month, year, absence, daily] =
      await Promise.all([
        select(env, `user_life_map?user_id=eq.${userId}&select=life_map->story`).catch(() => []),
        select(
          env,
          `chapters?owner_id=eq.${userId}&phase=in.(active,closed,upcoming)&select=title,phase,start_date,end_date,card_subtitle,epigraph&order=start_date.desc.nullslast&limit=20`,
        ).catch(() => []),
        select(
          env,
          // a tidy up is put only on Ask Gremly's questions, on a tap (stage 4f)
          `gremly_questions?user_id=eq.${userId}&status=in.(open,asked)&or=(kind.is.null,kind.neq.tidy)&select=question,created_at&order=created_at.desc&limit=5`,
        ).catch(() => []),
        select(
          env,
          `life_facts?user_id=eq.${userId}&state=eq.corrected&select=statement,correction_text,corrected_at&order=corrected_at.desc&limit=20`,
        ).catch(() => []),
        rpc(env, 'usage_rollup', { p_user: userId, p_grain: 'week', p_periods: 4 }).catch(
          () => null,
        ),
        rpc(env, 'usage_rollup', { p_user: userId, p_grain: 'month', p_periods: 3 }).catch(
          () => null,
        ),
        rpc(env, 'usage_rollup', { p_user: userId, p_grain: 'year', p_periods: 1 }).catch(
          () => null,
        ),
        rpc(env, 'absence_snapshot', { p_user: userId }).catch(() => null),
        select(
          env,
          `user_daily_state?user_id=eq.${userId}&select=date,dco->brief&order=date.desc&limit=1`,
        ).catch(() => []),
      ]);

    const parts = [];
    const storyText = formatStory(lifeMap?.[0]?.story);
    if (storyText) parts.push(`=== WHO THEY ARE: THEIR STORY ===\n${storyText}`);

    if (chapters.length) {
      parts.push(`=== CHAPTERS OF THEIR LIFE ===\n${chapters.map(chapterLine).join('\n')}`);
    }

    const usage = [
      usageLine(week?.periods?.[0], 'This week'),
      usageLine(week?.periods?.[1], 'Last week'),
      usageLine(month?.periods?.[0], 'This month'),
      usageLine(month?.periods?.[1], 'Last month'),
      usageLine(year?.periods?.[0], 'This year'),
    ].filter(Boolean);
    const cur = week?.current;
    if (usage.length || cur || absence) {
      parts.push(`=== HOW THEY HAVE USED GREMLY (counts from the app; answer questions about their use from these, and never read them as how their life went) ===
${usage.join('\n')}${cur ? `\nGremly's age: ${cur.gremly_age ?? 'unknown'}; days fed in total: ${cur.fed_days_total ?? 0}; sweep streak: ${cur.sweep_streak ?? 0}.` : ''}${absence ? `\nLast active before today: ${absence.last_active_day_before_today || 'unknown'}; active days in the last 7: ${absence.active_days_last_7 ?? 0}, last 30: ${absence.active_days_last_30 ?? 0}.` : ''}`);
    }

    const brief = daily?.[0]?.brief;
    if (brief) {
      parts.push(
        `=== TODAY'S BRIEF (${daily[0].date}) ===\n${[brief.headline && `Headline: ${brief.headline}`, brief.day_shape && `Shape of the day: ${brief.day_shape}`, brief.return?.note && `Welcome back: ${brief.return.note}`].filter(Boolean).join('\n')}`,
      );
    }

    if (questions.length) {
      parts.push(
        `=== THINGS GREMLY IS UNSURE ABOUT (ask at most one, only when it fits the conversation) ===\n${questions.map((q) => `- ${trim(q.question, 200)}`).join('\n')}`,
      );
    }

    if (corrections.length) {
      parts.push(
        `=== CORRECTIONS THEY MADE (never repeat the corrected claim) ===\n${corrections.map((c) => `- "${trim(c.statement, 140)}" is wrong. They said: "${trim(c.correction_text, 200)}"`).join('\n')}`,
      );
    }

    const pack = parts.join('\n\n');
    if (env.CONTEXT_CACHE)
      await env.CONTEXT_CACHE.put(cacheKey, pack, { expirationTtl: PACK_TTL_SECONDS }).catch(
        () => {},
      );
    return pack;
  } catch (error) {
    console.error('[LifeContext] pack error:', error);
    return '';
  }
}

/**
 * What Gremly remembers that bears on this message: ledger facts, story items
 * and chapters, best matches first. Not cached: it depends on the message.
 * A fact says how Gremly knows it (workers/shared/factSource.js): where it
 * came from, the day where they are (timezone; today, a day or a promise of
 * one, marks today and yesterday) and their own words.
 */
export async function recallForMessage(
  userId,
  message,
  env,
  { limit = 10, timezone = 'UTC', today = null } = {},
) {
  const text = String(message || '').trim();
  if (!userId || text.length < 3) return '';
  try {
    const [rows, theirDay] = await Promise.all([
      rpc(env, 'recall_life_now', { p_user: userId, p_query: text.slice(0, 500), p_limit: limit }),
      Promise.resolve(today).catch(() => null),
    ]);
    if (!Array.isArray(rows) || !rows.length) return '';
    // their day, so a plan whose date has passed says so (an exact comparison, code's to make)
    const day =
      theirDay || new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    // when each fact is true (data fabric stage 4d): a yearly one on its next
    // day, a standing one with no date, as every other reader reads them
    const factIds = rows.filter((r) => r.source === 'fact' && r.id).map((r) => r.id);
    const timings = new Map(
      (factIds.length
        ? await select(
            env,
            `life_facts?user_id=eq.${userId}&id=in.(${factIds.join(',')})&select=id,timing`,
          ).catch((err) => {
            console.warn(
              `[ALERT][LifeContext] recall could not read timing: ${err?.message || err}`,
            );
            return [];
          })
        : []
      ).map((t) => [t.id, t.timing]),
    );
    const timed = rows.map((r) =>
      r.source === 'fact' ? asOfToday({ ...r, timing: timings.get(r.id) || null }, day) : r,
    );
    const lines = timed.map((r) => {
      const how = r.source === 'fact' ? sourceWords(r, { today: theirDay, timezone }) : '';
      return `- ${r.source}${r.about_date ? ` | ${r.about_date}${r.every_year ? ', every year' : ''}${r.about_date_end && r.about_date_end !== r.about_date ? ` to ${r.about_date_end}` : ''}` : ''}${r.timing === 'standing' ? ' | holds with no date of its own' : ''}${r.state ? ` | ${r.source === 'fact' ? stateWords(r, day) : r.state}` : ''} | ${r.title && r.source !== 'fact' ? `${trim(r.title, 80)}: ` : ''}${trim(r.body, 280)}${how ? ` | how Gremly knows: ${how}` : ''}${r.private ? ' [private: use when it bears on what they are talking about, in their own words; never open with it]' : ''}`;
    });
    return `=== WHAT GREMLY REMEMBERS THAT MAY RELATE TO THIS MESSAGE (from their own records; use what helps, with its date, and ignore the rest; a fact says how Gremly knows it) ===\n${lines.join('\n')}`;
  } catch (error) {
    console.error('[LifeContext] recall error:', error);
    return '';
  }
}
