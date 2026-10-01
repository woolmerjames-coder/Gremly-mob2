/**
 * Weekly synthesis: one Sonnet 5.5 pass, through the Batch API at half price.
 *
 * It reads the fact ledger (dated, sourced, with corrections), the week's own
 * words (journals and chat), what was done, usage counts, the current Life Map
 * and the current Worlds, and rewrites:
 *  - the Life Map, in full, so nothing stale survives because it was skipped
 *  - the profile text every chat reads
 *  - each world's card line, summary, priorities and phase
 *  - the week's Worlds headline
 *  - any questions worth asking the person
 *
 * Code maps references back to real ids, keeps each Life Map domain's link to
 * its Space, and builds thread evidence from the facts the model cited.
 */

import { CARE_RULES, WRITING_RULES } from '../careRules';
import { db, userTimezone, localDate, addDays, relativeDay, weekdayName } from './db';
import { anthropicJsonParams, anthropicJsonResult, modelFor, createBatch, getBatch, getBatchResults } from './llm';
import { recentCorrections } from './corrections';
import { batchUsageRow, writeUsageRow } from '../aiUsage';

export const WEEKLY_PROMPT_VERSION = 'weekly-2026-09-30';

function trim(text, n) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const WEEKLY_SCHEMA = {
  type: 'object',
  properties: {
    life_map: {
      type: 'object',
      properties: {
        domains: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              attention: { type: 'string', enum: ['front_of_mind', 'active', 'background'] },
              threads: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    status: { type: 'string' },
                    momentum: { type: 'string' },
                    lifecycle: { type: 'string', enum: ['active', 'dormant', 'concluded'] },
                    importance: { type: 'string', enum: ['high', 'medium', 'low'] },
                    attention: { type: 'string', enum: ['front_of_mind', 'active', 'background'] },
                    last_activity: { type: 'string', nullable: true },
                    summary: { type: 'string' },
                    recent_update: { type: 'string', nullable: true },
                    fact_refs: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['name', 'status', 'momentum', 'lifecycle', 'importance', 'attention', 'summary', 'fact_refs'],
                },
              },
            },
            required: ['name', 'attention', 'threads'],
          },
        },
      },
      required: ['domains'],
    },
    profile_text: { type: 'string' },
    worlds: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          world_ref: { type: 'string' },
          phase: { type: 'string', enum: ['candidate', 'active', 'dormant'] },
          card_subtitle: { type: 'string' },
          summary: { type: 'string' },
          key_priorities: {
            type: 'array',
            items: {
              type: 'object',
              properties: { text: { type: 'string' }, date: { type: 'string', nullable: true } },
              required: ['text'],
            },
          },
        },
        required: ['world_ref', 'phase', 'card_subtitle', 'summary', 'key_priorities'],
      },
    },
    worlds_summary: {
      type: 'object',
      properties: {
        headline: { type: 'string' },
        featured: {
          type: 'array',
          items: {
            type: 'object',
            properties: { world_ref: { type: 'string' }, reason: { type: 'string' } },
            required: ['world_ref', 'reason'],
          },
        },
      },
      required: ['headline', 'featured'],
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { question: { type: 'string' }, fact_ref: { type: 'string', nullable: true } },
        required: ['question'],
      },
    },
    week_note: { type: 'string' },
  },
  required: ['life_map', 'profile_text', 'worlds', 'worlds_summary', 'questions', 'week_note'],
};

function weeklySystemPrompt(today) {
  return `You keep Gremly's long-term understanding of one person up to date. Once a week you rewrite their Life Map, the short profile every conversation with them reads, and the cards on their Worlds screen, from what is known about their life.

TODAY'S DATE: ${today}

${CARE_RULES}

${WRITING_RULES}

WHAT YOU ARE GIVEN
- The fact ledger: what is known about their life, each fact with its date, state and when it was last confirmed. Corrections the person made are listed separately and always win.
- The week's own words: journal entries and what they said in chat. These carry the texture the ledger summarises.
- What they did this week, and counts of how they used the app over recent weeks.
- The current Life Map, Worlds and open questions.

THE LIFE MAP
- Rewrite it in full. Keep the domains and threads that still describe their life, merge or retire ones that do not, and add new ones the evidence supports. Use the existing domain names where they still fit.
- Each thread's summary says what is true as of today. When a thread has had no activity for a while, say plainly when it was last active and what was happening then, set its lifecycle to dormant or concluded, and do not invent what happened since.
- last_activity is the date of the latest evidence for that thread, never a future date. Cite the facts each thread rests on.
- recent_update covers only this week; leave it empty when nothing happened.

THE PROFILE
- A short, warm paragraph or two that a companion could read before talking to them: who they are, who matters to them, what is going on now, and what is coming up. Every date relative to today. No clinical or diagnostic language, no judgements about how they are coping.

WORLDS
- For each world: a card line in the present tense naming one concrete, current thing; a one or two sentence summary; up to five key priorities, each with its date when it has one.
- Never put a passed date, a plan that has gone by, or a count of things not done on a card. When a world has been quiet, the card describes the last real state with its month, or what is next if something is genuinely ahead.
- phase: active when the person is engaged with it now, dormant when it has gone quiet for weeks, candidate only when it is still forming.
- worlds_summary: one line noticing what is most alive across their worlds this week. Feature up to three worlds with a short reason. In a quiet week say so kindly and feature none.

QUESTIONS
- Ask about anything the records leave genuinely unclear that matters to understanding them, especially plans whose outcome is unknown. Short and friendly. Do not repeat open questions.

WEEK NOTE
- One short paragraph on what this week was, in plain words, for Gremly's own reference.`;
}

/** Gather everything the weekly pass reads. */
export async function gatherWeek(env, userId, tz, periodEnd) {
  const d = db(env);
  const periodStart = addDays(periodEnd, -6);
  const since = `${periodStart}T00:00:00Z`;
  const startIso = new Date(Date.parse(since) - 14 * 3600e3).toISOString();
  const endIso = new Date(Date.parse(`${addDays(periodEnd, 1)}T00:00:00Z`) + 14 * 3600e3).toISOString();
  const between = (col) => `${col}=gte.${encodeURIComponent(startIso)}&${col}=lt.${encodeURIComponent(endIso)}`;
  const [openFacts, recentHappened, changes, corrections, journals, chats, created, completed, habits, progress, lifeMap, worlds, links, questions, absence, usage] = await Promise.all([
    d.select(`life_facts?user_id=eq.${userId}&state=in.(current,planned,unconfirmed)&select=id,statement,subject,about_date,about_date_end,state,observed_at,last_confirmed_at&order=last_confirmed_at.desc&limit=400`),
    d.select(`life_facts?user_id=eq.${userId}&state=in.(happened,changed)&updated_at=gte.${encodeURIComponent(new Date(Date.now() - 60 * 864e5).toISOString())}&select=id,statement,subject,about_date,state,state_reason,updated_at&order=updated_at.desc&limit=150`),
    d.select(`life_fact_changes?user_id=eq.${userId}&${between('created_at')}&select=fact_id,from_state,to_state,reason,created_at&order=created_at.asc&limit=100`),
    recentCorrections(env, userId, 365),
    d.select(`notes?owner_id=eq.${userId}&subtype=eq.journal&${between('created_at')}&select=title,body,mood,created_at&order=created_at.asc&limit=25`),
    d.select(`scope_chat_messages?user_id=eq.${userId}&role=eq.user&${between('created_at')}&select=content,created_at&order=created_at.asc&limit=120`),
    d.select(`todos?owner_id=eq.${userId}&${between('created_at')}&select=id,title,due_day,created_at&order=created_at.asc&limit=80`),
    d.select(`todos?owner_id=eq.${userId}&${between('completed_at')}&select=id,title,completed_at&order=completed_at.asc&limit=80`),
    d.select(`habits?owner_id=eq.${userId}&archived=eq.false&select=id,name,title,cadence,target_per_period`),
    d.select(`habit_progress?owner_id=eq.${userId}&occurred_day=gte.${periodStart}&occurred_day=lte.${periodEnd}&select=habit_id,occurred_day&limit=2000`),
    d.select(`user_life_map?user_id=eq.${userId}&select=id,life_map,version`),
    d.select(`worlds?owner_id=eq.${userId}&phase=in.(candidate,active,evolving,dormant)&select=id,name,display_name,phase,card_subtitle,card_subtitle_source,summary,summary_source,key_priorities,last_signal_at`),
    d.select(`drop_world_links?owner_id=eq.${userId}&select=world_id,drop_id,drop_type&limit=5000`),
    d.select(`gremly_questions?user_id=eq.${userId}&status=in.(open,asked)&select=id,question,created_at&limit=20`),
    d.rpc('absence_snapshot', { p_user: userId }),
    d.rpc('usage_rollup', { p_user: userId, p_grain: 'week', p_periods: 8 }),
  ]);
  return { periodStart, periodEnd, openFacts, recentHappened, changes, corrections, journals, chats, created, completed, habits, progress, lifeMap: lifeMap?.[0] || null, worlds, links, questions, absence, usage };
}

export function renderWeek(g, today) {
  const refs = new Map();
  const add = (prefix, obj) => {
    const n = [...refs.keys()].filter((k) => k.startsWith(prefix)).length + 1;
    const ref = `${prefix}${n}`;
    refs.set(ref, obj);
    return ref;
  };
  const factLine = (f) => {
    const ref = add('f', { type: 'fact', ...f });
    const when = f.about_date ? `${f.about_date}${f.about_date_end ? ` to ${f.about_date_end}` : ''} (${relativeDay(f.about_date, today)})` : 'no date';
    return `${ref} | ${f.state} | ${when} | ${trim(f.statement, 220)} | recorded ${String(f.observed_at || f.updated_at).slice(0, 10)}`;
  };
  const weekItemIds = new Set([...g.created.map((t) => t.id), ...g.completed.map((t) => t.id)]);
  const worldActivity = new Map();
  for (const l of g.links) if (weekItemIds.has(l.drop_id)) worldActivity.set(l.world_id, (worldActivity.get(l.world_id) || 0) + 1);
  const counts = new Map();
  for (const p of g.progress) counts.set(p.habit_id, (counts.get(p.habit_id) || 0) + 1);

  const usageLines = (g.usage?.periods || []).map(
    (p) => `week of ${p.period_start}: ${p.active_days} active days, ${p.drops} drops, ${p.todos_done} done, ${p.habit_checkins} check-ins, ${p.journals} journals, ${p.chat_messages} chat messages, ${p.sweeps} sweeps, ${p.fed_days} fed days`,
  );

  const threads = [];
  for (const dom of g.lifeMap?.life_map?.domains || []) {
    for (const t of dom.threads || []) {
      threads.push(`${trim(dom.name, 50)} / ${trim(t.name, 70)} | ${t.status}, ${t.momentum}, ${t.lifecycle || 'active'} | last activity ${t.last_activity || 'unknown'} | ${trim(t.summary, 300)}`);
    }
  }
  const worldLines = g.worlds.map((w) => {
    const ref = add('w', { type: 'world', ...w });
    const kp = (Array.isArray(w.key_priorities) ? w.key_priorities : []).map((k) => (typeof k === 'string' ? k : k?.text)).filter(Boolean);
    return `${ref} | ${w.display_name || w.name} | phase ${w.phase} | last real activity ${w.last_signal_at ? w.last_signal_at.slice(0, 10) : 'unknown'} | items this week ${worldActivity.get(w.id) || 0} | card: "${trim(w.card_subtitle, 100)}"${w.card_subtitle_source === 'user' ? ' (set by the person, keep unless untrue)' : ''} | summary: "${trim(w.summary, 200)}" | priorities: ${kp.map((k) => trim(k, 80)).join('; ') || 'none'}`;
  });
  const qLines = g.questions.map((q) => `- ${trim(q.question, 200)} (asked ${q.created_at.slice(0, 10)})`);

  const text = [
    `TODAY: ${weekdayName(today)} ${today}. THIS WEEK: ${g.periodStart} to ${g.periodEnd}.`,
    '',
    `TIME AWAY: last active ${g.absence?.last_active_day || 'never'}; active days in the last 7: ${g.absence?.active_days_last_7 ?? 0}, last 30: ${g.absence?.active_days_last_30 ?? 0}.`,
    `APP USE BY WEEK, NEWEST FIRST:\n${usageLines.join('\n') || '(none)'}`,
    '',
    `LEDGER, OPEN FACTS (ref | state | date | statement | recorded):\n${g.openFacts.map(factLine).join('\n') || '(none)'}`,
    '',
    `LEDGER, FACTS THAT RECENTLY HAPPENED OR CHANGED:\n${g.recentHappened.map(factLine).join('\n') || '(none)'}`,
    `CHANGES THIS WEEK: ${g.changes.map((c) => `${c.created_at.slice(0, 10)} ${c.from_state} to ${c.to_state}: ${trim(c.reason, 160)}`).join('; ') || 'none'}`,
    `CORRECTIONS THE PERSON MADE (always win): ${g.corrections.map((c) => `${c.corrected_at.slice(0, 10)}: "${trim(c.statement, 160)}" is wrong; they said "${trim(c.correction_text, 200)}"`).join('; ') || 'none'}`,
    '',
    `JOURNAL ENTRIES THIS WEEK:\n${g.journals.map((j) => `${j.created_at.slice(0, 10)} | "${trim(j.title, 100)}" ${trim(j.body, 1500)}${j.mood?.length ? ` | mood: ${j.mood.join(', ')}` : ''}`).join('\n') || '(none)'}`,
    '',
    `WHAT THEY SAID IN CHAT THIS WEEK:\n${g.chats.map((m) => `${m.created_at.slice(0, 10)} | ${trim(m.content, 300)}`).join('\n') || '(nothing)'}`,
    '',
    `ADDED THIS WEEK: ${g.created.map((t) => trim(t.title, 70)).join('; ') || 'nothing'}`,
    `DONE THIS WEEK: ${g.completed.map((t) => trim(t.title, 70)).join('; ') || 'nothing'}`,
    `HABITS THIS WEEK: ${g.habits.map((h) => `${trim(h.name || h.title, 50)} ${counts.get(h.id) || 0} of ${h.cadence === 'daily' ? 7 : h.target_per_period || 1}`).join('; ') || 'none'}`,
    '',
    `CURRENT LIFE MAP (domain / thread | state | last activity | summary):\n${threads.join('\n') || '(none yet)'}`,
    '',
    `CURRENT WORLDS (ref | name | phase | last real activity | items this week | card | summary | priorities):\n${worldLines.join('\n') || '(none)'}`,
    '',
    `OPEN QUESTIONS ALREADY ASKED:\n${qLines.join('\n') || '(none)'}`,
  ].join('\n');
  return { text, refs };
}

export async function weeklyRequestParams(env, userId, periodEnd) {
  const tz = await userTimezone(env, userId);
  const today = localDate(tz);
  const g = await gatherWeek(env, userId, tz, periodEnd);
  const { text, refs } = renderWeek(g, today);
  const m = modelFor(env, 'weekly');
  const params = anthropicJsonParams({
    model: m.model,
    system: weeklySystemPrompt(today),
    user: text,
    schema: WEEKLY_SCHEMA,
    maxTokens: 24000,
  });
  return { params, refsSnapshot: [...refs.entries()].map(([k, v]) => [k, { type: v.type, id: v.id, statement: v.statement, about_date: v.about_date, observed_at: v.observed_at }]), today, tz, g, inputChars: text.length };
}

function validDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Apply a weekly result. In shadow mode nothing user-facing changes. */
export async function applyWeekly(env, userId, output, refsSnapshot, { shadow, runId, today }) {
  const d = db(env);
  const refs = new Map(refsSnapshot);
  const nowIso = new Date().toISOString();
  const [current] = await d.select(`user_life_map?user_id=eq.${userId}&select=id,life_map,version`);
  const existingDomains = new Map((current?.life_map?.domains || []).map((dm) => [dm.name.toLowerCase(), dm]));

  // Life Map, rebuilt in the existing shape with evidence from cited facts.
  let lastEvidence = null;
  const domains = (output.life_map?.domains || []).map((dm) => {
    const prior = existingDomains.get(String(dm.name).toLowerCase());
    return {
      name: dm.name,
      source: prior?.source || 'ai_detected',
      space_id: prior?.space_id || null,
      attention: dm.attention,
      threads: (dm.threads || []).map((t) => {
        const evidence = (t.fact_refs || [])
          .map((r) => refs.get(r))
          .filter((f) => f && f.type === 'fact')
          .map((f) => {
            const date = f.about_date && f.about_date <= today ? f.about_date : String(f.observed_at || '').slice(0, 10) || null;
            if (date && date <= today && (!lastEvidence || date > lastEvidence)) lastEvidence = date;
            return { type: 'fact', date, signal: f.statement, fact_id: f.id, salience: 'medium', source: 'ledger' };
          });
        const la = validDate(t.last_activity);
        return {
          name: t.name,
          status: t.status,
          momentum: t.momentum,
          lifecycle: t.lifecycle,
          importance: t.importance,
          attention: t.attention,
          last_activity: la && la <= today ? la : null,
          summary: t.summary,
          recent_update: t.recent_update || null,
          evidence,
        };
      }),
    };
  });
  const lifeMap = {
    version: (current?.life_map?.version || 0) + 1,
    rebuilt_at: nowIso,
    updated_at: nowIso,
    source: 'weekly_synthesis',
    domains,
  };

  // Worlds
  const worldUpdates = [];
  for (const w of output.worlds || []) {
    const ref = refs.get(w.world_ref);
    if (!ref || ref.type !== 'world') continue;
    worldUpdates.push({ id: ref.id, w });
  }
  const featured = (output.worlds_summary?.featured || [])
    .map((f) => ({ world_id: refs.get(f.world_ref)?.type === 'world' ? refs.get(f.world_ref).id : null, reason: f.reason }))
    .filter((f) => f.world_id);
  const worldsSummary = { headline: output.worlds_summary?.headline || null, featured, generated_at: nowIso, source: 'weekly_synthesis' };

  const applied = { threads: domains.reduce((n, dm) => n + dm.threads.length, 0), worlds: worldUpdates.length, questions: 0 };
  if (shadow) return { applied, lifeMap, worldUpdates, worldsSummary };

  // Keep what this run replaces, so a bad week can be rolled back by hand.
  const [prevProfile] = await d.select(`user_profiles?user_id=eq.${userId}&select=profile_text`);
  const prevWorlds = await d.select(`worlds?owner_id=eq.${userId}&select=id,phase,card_subtitle,card_subtitle_source,summary,summary_source,key_priorities`);
  const previous = { life_map: current?.life_map || null, profile_text: prevProfile?.profile_text ?? null, worlds: prevWorlds };

  if (current) {
    await d.update(`user_life_map?id=eq.${current.id}`, { life_map: lifeMap, version: (current.version || 1) + 1, rebuilt_at: nowIso, updated_at: nowIso, last_evidence_date: lastEvidence });
  } else {
    await d.insertQuiet('user_life_map', [{ user_id: userId, life_map: lifeMap, version: 1, rebuilt_at: nowIso, updated_at: nowIso, last_evidence_date: lastEvidence }]);
  }

  const [profileRow] = await d.select(`user_profiles?user_id=eq.${userId}&select=user_id,signals`);
  const signals = { ...(profileRow?.signals || {}), source: 'weekly_synthesis', synthesized_at: nowIso };
  if (profileRow) await d.update(`user_profiles?user_id=eq.${userId}`, { profile_text: output.profile_text, signals, generated_at: nowIso, model_used: 'weekly_synthesis' });
  else await d.insertQuiet('user_profiles', [{ user_id: userId, profile_text: output.profile_text, signals, generated_at: nowIso, model_used: 'weekly_synthesis' }]);

  const [worldRows] = [await d.select(`worlds?owner_id=eq.${userId}&select=id,card_subtitle_source,summary_source`)];
  const sources = new Map(worldRows.map((r) => [r.id, r]));
  for (const { id, w } of worldUpdates) {
    const src = sources.get(id) || {};
    const patch = { phase: w.phase, updated_at: nowIso, key_priorities: (w.key_priorities || []).slice(0, 5).map((k) => ({ text: k.text, date: validDate(k.date) })) };
    if (src.card_subtitle_source !== 'user') Object.assign(patch, { card_subtitle: w.card_subtitle, card_subtitle_source: 'synthesis', card_subtitle_updated_at: nowIso });
    if (src.summary_source !== 'user') Object.assign(patch, { summary: w.summary, summary_source: 'synthesis', summary_updated_at: nowIso });
    await d.update(`worlds?id=eq.${id}&owner_id=eq.${userId}`, patch);
  }

  for (const q of output.questions || []) {
    if (!q.question) continue;
    const f = q.fact_ref ? refs.get(q.fact_ref) : null;
    await d.insertQuiet('gremly_questions', [{ user_id: userId, question: trim(q.question, 300), status: 'open', about_fact_id: f?.type === 'fact' ? f.id : null, run_id: runId }]);
    applied.questions++;
  }
  return { applied, worldsSummary, previous };
}

// ── Batch orchestration helpers ────────────────────────────────────────────

export async function submitWeeklyBatch(env, items) {
  // items: [{ custom_id, params }]
  return createBatch(env, items.map((i) => ({ custom_id: i.custom_id, params: i.params })));
}

export async function readWeeklyBatch(env, batchId, { jobByCustomId = {} } = {}) {
  const status = await getBatch(env, batchId);
  if (status.processing_status !== 'ended') return { done: false, status: status.processing_status };
  const results = await getBatchResults(env, batchId);
  const out = {};
  for (const r of results) {
    if (r.result?.type === 'succeeded') {
      const meta = jobByCustomId[r.custom_id] || {};
      await writeUsageRow(env, batchUsageRow(r.result.message, { job: 'weekly-synthesis', userId: meta.userId, runId: meta.runId })).catch(() => {});
      try {
        out[r.custom_id] = { ok: true, output: anthropicJsonResult(r.result.message) };
      } catch (err) {
        out[r.custom_id] = { ok: false, error: err.message };
      }
    } else {
      out[r.custom_id] = { ok: false, error: r.result?.type || 'unknown' };
    }
  }
  return { done: true, results: out };
}
