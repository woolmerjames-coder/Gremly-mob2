/**
 * Daily brief in Chat: writing the brief into the day's thread.
 *
 * - daily-brief-dispatch (every 10 minutes): for everyone with brief_in_chat on,
 *   asks for today's brief 20 minutes before their morning notification time.
 * - daily-brief-write (one person): gathers the day, decides the offer, has the
 *   writer word it, and writes the thread's messages.
 * - POST /api/daily-brief (from cortex, for the app): the first open when no
 *   brief was written, or a later first open that needs a fresh brief for the
 *   current part of the day (once a day at most).
 */

import { db, localDate } from '../context/db';
import { gatherBrief, minutesIn } from './data';
import { decideOffer, questionButtons } from './offer';
import { writeBrief, BRIEF_PROMPT_VERSION } from './writer';
import {
  appendMessages,
  ensureThread,
  patchThreadMeta,
  supersedeUnseen,
  threadMessages,
} from './thread';

export const BRIEF_LEAD_MINUTES = 20;

/** Words for the offer when the writer's own could not be used (logged as such). */
export function fallbackOffer(kind, part = 'morning') {
  switch (kind) {
    case 'return':
      return "A quick sweep would help, and it's fine to skip it today.";
    case 'sweep':
      return 'A few things need a decision before we plan. Want a quick sweep first?';
    case 'plan':
      return 'Want me to fit a few things into the clear time today?';
    default:
      return part === 'evening' ? 'Have a good evening.' : 'Have a good day.';
  }
}

/**
 * Gremly's opening line when the writer could not be used (both models
 * failed, or every line failed the ID check). Fixed words, so the brief still
 * arrives: this line, the day card and the offer.
 */
export function fallbackLine(part, returnDay) {
  if (returnDay) return "Good to see you. Here's today.";
  if (part === 'afternoon') return "Here's the rest of today.";
  if (part === 'evening') return "Here's the rest of your evening.";
  return "Here's your day.";
}

function uuid() {
  return crypto.randomUUID();
}

async function logRun(env, row) {
  try {
    await db(env).insertQuiet('daily_brief_runs', [row]);
  } catch (err) {
    console.warn(`[DailyBrief] could not log the run: ${err.message}`);
  }
}

/**
 * Write today's brief for one person.
 * @param {'scheduled'|'first_open'|'rewrite'} reason
 */
export async function writeDailyBrief(env, userId, { reason = 'scheduled', at = new Date() } = {}) {
  const g = await gatherBrief(env, userId, { at });
  if (!g.briefInChat) return { skipped: 'brief_in_chat is off' };
  // The brief starts from the second day of the training challenge
  if ((g.gremlyAge ?? 0) < 1) return { skipped: 'new user' };

  const thread = await ensureThread(env, userId, g.ritualDay);
  const meta = thread.metadata_json || {};
  if (meta.seen_at) return { skipped: 'already seen', thread_id: thread.id };
  const written = !!meta.brief_written_at;
  if (written && meta.brief_part === g.part) {
    return { skipped: 'already written for this part of the day', thread_id: thread.id };
  }
  if (written && reason === 'scheduled')
    return { skipped: 'already written', thread_id: thread.id };
  // A later first open can ask for a fresh brief once a day, never more
  const isRewrite = written;
  if (isRewrite && meta.rewrite_requested_at) {
    return { skipped: 'one rewrite a day', thread_id: thread.id };
  }

  const offer = decideOffer({
    returnDay: !!g.ret,
    overdue: g.overdue,
    unsorted: g.unsorted,
    candidates: g.candidates,
    freeWindows: g.free,
    now: g.now,
    planned: g.planned?.length ?? 0,
  });

  let out;
  let writerError = null;
  try {
    out = await writeBrief(env, g, offer);
  } catch (err) {
    writerError = String(err?.message || err).slice(0, 500);
    console.warn(`[ALERT][DailyBrief] the writer failed for ${userId}: ${writerError}`);
  }
  // Without usable lines the brief still arrives, in fixed words
  if (!out || !out.lines.length) {
    out = {
      model: out?.model ?? null,
      lines: [{ text: fallbackLine(g.part, !!g.ret), ids: [] }],
      dropped: out?.dropped ?? [],
      offer: out?.offer ?? null,
      offerDropped: out?.offerDropped ?? null,
      questionLine: g.question && !g.ret ? out?.questionLine || g.question.question : null,
      questionChoices: out?.questionChoices ?? [],
      catchUp: out?.catchUp ?? null,
    };
    writerError = writerError || 'no lines passed the ID check';
  }

  const existing = await threadMessages(env, thread.id);
  const superseded = await supersedeUnseen(env, existing);

  const briefId = uuid();
  const rows = out.lines.map((l) => ({
    role: 'assistant',
    content: l.text,
    metadata_json: { type: 'brief-text', part: g.part, ids: l.ids, brief_id: briefId },
  }));
  rows.push({
    role: 'system',
    content: '',
    metadata_json: { type: 'brief-day-card', date: g.ritualDay, brief_id: briefId },
  });

  // Gremly's question, on any day but a return day, before the offer
  const asking = g.question && !g.ret;
  if (asking) {
    let choices = g.question.choices || [];
    if (!choices.length && out.questionChoices.length) {
      choices = out.questionChoices.slice(0, 4);
      await db(env)
        .update(`gremly_questions?id=eq.${g.question.id}`, { choices })
        .catch((err) => console.warn(`[DailyBrief] could not save choices: ${err.message}`));
    }
    rows.push({
      role: 'assistant',
      content: out.questionLine,
      metadata_json: {
        type: 'brief-offer',
        kind: 'question',
        question_id: g.question.id,
        buttons: questionButtons(choices),
        brief_id: briefId,
      },
    });
  }
  // With no offer the last message is only a sign-off; when the writer gave
  // none, the lines end the brief on their own.
  const offerText =
    out.offer || (offer.kind === 'none' && !writerError ? null : fallbackOffer(offer.kind, g.part));
  if (offerText)
    rows.push({
      role: 'assistant',
      content: offerText,
      metadata_json: {
        type: 'brief-offer',
        kind: offer.kind,
        buttons: offer.buttons,
        // shown once the question has been answered or skipped
        held: asking ? true : undefined,
        catch_up: out.catchUp || undefined,
        plan_from: offer.plan?.gapFrom ?? undefined,
        brief_id: briefId,
      },
    });

  await appendMessages(env, userId, thread.id, rows, at.getTime());
  const nowIso = new Date().toISOString();
  await patchThreadMeta(env, thread, {
    brief_part: g.part,
    brief_written_at: nowIso,
    brief_id: briefId,
    offer_kind: offer.kind,
    ...(isRewrite ? { rewrite_requested_at: nowIso } : {}),
  });

  await logRun(env, {
    user_id: userId,
    ritual_day: g.ritualDay,
    part: g.part,
    reason,
    brief_id: briefId,
    offer_kind: offer.kind,
    lines: out.lines.length,
    dropped: out.dropped.length ? out.dropped : null,
    offer_dropped: out.offerDropped,
    superseded,
    model: out.model,
    prompt_version: BRIEF_PROMPT_VERSION,
    dco_built: g.dcoBuilt,
    // set when the fixed words were used instead of the writer's
    error: writerError,
  });
  if (out.dropped.length || out.offerDropped) {
    console.warn(
      `[ALERT][DailyBrief] ID check dropped ${out.dropped.length} line(s)${out.offerDropped ? ' and the offer' : ''} for ${userId}`,
      JSON.stringify({ dropped: out.dropped, offer: out.offerDropped }).slice(0, 1500),
    );
  }
  return {
    ok: true,
    thread_id: thread.id,
    brief_id: briefId,
    part: g.part,
    offer_kind: offer.kind,
    lines: out.lines.length,
    dropped: out.dropped.length,
  };
}

/** Who is due their brief now: 20 minutes before their morning time, until noon. */
export function dueForBrief(pref, at = new Date()) {
  const tz = pref.timezone || 'America/Los_Angeles';
  const [h, m] = String(pref.morning_time || '08:00')
    .split(':')
    .map(Number);
  const target = Math.max(0, h * 60 + m - BRIEF_LEAD_MINUTES);
  const now = minutesIn(tz, at);
  return now >= target && now < 12 * 60 ? localDate(tz, at) : null;
}

export function createBriefFunctions(inngest) {
  const dispatch = inngest.createFunction(
    { id: 'daily-brief-dispatch', name: 'Daily brief: ask for briefs due now' },
    [{ cron: '*/10 * * * *' }, { event: 'app/brief.dispatch' }],
    async ({ step, env }) => {
      const due = await step.run('who-is-due', async () => {
        const d = db(env);
        const on = await d.select(
          'cortex_preferences?brief_in_chat=eq.true&select=owner_id&limit=5000',
        );
        const ids = (on || []).map((r) => r.owner_id);
        if (!ids.length) return [];
        const prefs = await d.select(
          `notification_preferences?user_id=in.(${ids.join(',')})&select=user_id,timezone,morning_time`,
        );
        const byUser = new Map((prefs || []).map((p) => [p.user_id, p]));
        const out = [];
        for (const id of ids) {
          const day = dueForBrief(byUser.get(id) || {});
          if (day) out.push({ user_id: id, day });
        }
        return out;
      });
      if (due.length) {
        await step.sendEvent(
          'write-briefs',
          due.map((u) => ({
            // one event per person per day: Inngest drops repeats with the same id
            id: `daily-brief-${u.user_id}-${u.day}`,
            name: 'app/brief.write',
            data: { user_id: u.user_id },
          })),
        );
      }
      return { due: due.length };
    },
  );

  const write = inngest.createFunction(
    {
      id: 'daily-brief-write',
      name: "Daily brief: write one person's brief",
      concurrency: [{ key: 'event.data.user_id', limit: 1 }, { limit: 5 }],
      retries: 2,
    },
    { event: 'app/brief.write' },
    async ({ event, step, env }) => {
      const userId = event.data?.user_id;
      if (!userId) throw new Error('user_id is required');
      return step.run('write', () => writeDailyBrief(env, userId, { reason: 'scheduled' }));
    },
  );

  return [dispatch, write];
}

/** POST /api/daily-brief { user_id, reason: 'first_open' | 'rewrite' } (admin key checked upstream). */
export async function handleBriefApi(request, env, corsResponse) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = typeof body.user_id === 'string' ? body.user_id : null;
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return corsResponse({ error: 'user_id is required' }, 400);
    }
    const reason = body.reason === 'rewrite' ? 'rewrite' : 'first_open';
    const result = await writeDailyBrief(env, userId, { reason });
    return corsResponse(result);
  } catch (e) {
    console.error('[DailyBrief] API error:', e);
    return corsResponse({ error: String(e?.message || e).slice(0, 300) }, 500);
  }
}
