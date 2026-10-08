/**
 * The kind pass (data fabric stages 2 and 4d): every fact in the ledger gets
 * one of the fixed kinds (workers/shared/factKinds.js), a health flag, and
 * its timing (workers/shared/factTiming.js).
 *
 * The reader gives all three to each new fact. This pass gives them to the
 * facts that lack one: those made before they were fixed, and those added by
 * corrections and replacements, which carry none. A model reads each fact and
 * judges; code only checks each answer is on its list and writes it. A fact
 * the model leaves out keeps what it lacks until the next pass.
 */

import { db } from './db';
import { jsonCall, modelFor } from './llm';
import { FACT_KINDS, KIND_RULES, validKind } from '../../shared/factKinds.js';
import { FACT_TIMINGS, TIMING_RULES, validTiming } from '../../shared/factTiming.js';

export const KINDS_PROMPT_VERSION = 'kinds-2026-10-13b';

/** Facts sent in one call. */
export const KINDS_PER_CALL = 100;

const KINDS_SCHEMA = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          kind: { type: 'string', enum: FACT_KINDS },
          timing: { type: 'string', enum: FACT_TIMINGS },
          health: { type: 'boolean' },
        },
        required: ['ref', 'kind', 'timing', 'health'],
      },
    },
  },
  required: ['facts'],
};

function oneLine(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function kindsSystemPrompt() {
  return `You sort the facts in one person's ledger for Gremly, a companion app. Each fact is one statement about their life, with the date the ledger holds for it. For each fact you are shown, give its kind and its timing, and say whether it concerns health.

${KIND_RULES}

${TIMING_RULES}
- A date the ledger holds may be only the day the fact was said. Judge the timing from what the statement says, and the date only from the statement and the date together.
- The ledger's date is kept as it is. Give yearly only when the date the ledger holds is the day the fact falls on each year; when the statement names another day, give day, so a wrong day never comes round again.

Judge each fact by its own words. Return each fact you are shown once, by its ref.

Return only the structured result.`;
}

/** The request for one batch of facts, and the refs that name them. */
export function kindsRequest(facts) {
  const ref = new Map();
  const lines = facts.map((f, i) => {
    const r = `f${i + 1}`;
    ref.set(r, f);
    return `${r} | ${f.about_date ? String(f.about_date).slice(0, 10) : 'no date'} | ${oneLine(f.statement)}`;
  });
  return {
    system: kindsSystemPrompt(),
    user: `FACTS (ref | date the ledger holds | statement)\n${lines.join('\n')}`,
    ref,
  };
}

/** Ask the model for one batch. Returns [{ id, kind, timing, health }] for the facts it judged. */
export async function judgeKinds(env, facts) {
  const { system, user, ref } = kindsRequest(facts);
  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'reader'),
    fallback: modelFor(env, 'readerFallback'),
    system,
    user,
    schema: KINDS_SCHEMA,
    maxTokens: 6000,
    effort: 'low',
    thinking: 'low',
  });
  const seen = new Set();
  const judged = [];
  for (const j of output.facts || []) {
    const f = ref.get(j.ref);
    const kind = validKind(j.kind);
    if (!f || !kind || seen.has(f.id)) continue;
    seen.add(f.id);
    judged.push({ id: f.id, kind, timing: validTiming(j.timing), health: j.health === true });
  }
  return { judged, model };
}

/**
 * Give a kind, a timing and a health flag to this person's facts that lack
 * any, at most maxCalls batches in one run. In shadow nothing is written.
 */
export async function giveKinds(env, userId, { maxCalls = 6, shadow = false } = {}) {
  const d = db(env);
  const lacking = await d.select(
    `life_facts?user_id=eq.${userId}&or=(kind.is.null,kind.not.in.(${FACT_KINDS.join(',')}),health.is.null,timing.is.null)&select=id,statement,kind,timing,health,about_date&order=created_at.asc&limit=${KINDS_PER_CALL * maxCalls}`,
  );
  // what a fact already has it keeps: only what it lacks is written, so a
  // health flag the reader gave with the record in front of it is never
  // judged again from the statement alone
  const hasKind = new Set(lacking.filter((f) => validKind(f.kind)).map((f) => f.id));
  const hasTiming = new Set(lacking.filter((f) => validTiming(f.timing)).map((f) => f.id));
  const hasHealth = new Set(lacking.filter((f) => typeof f.health === 'boolean').map((f) => f.id));
  const out = {
    lacking: lacking.length,
    given: 0,
    health: 0,
    timings: 0,
    left_out: 0,
    calls: 0,
    shadow,
  };
  for (let i = 0; i < lacking.length; i += KINDS_PER_CALL) {
    const batch = lacking.slice(i, i + KINDS_PER_CALL);
    const { judged } = await judgeKinds(env, batch);
    out.calls++;
    out.left_out += batch.length - judged.length;
    out.given += judged.length;
    out.health += judged.filter((j) => j.health).length;
    if (shadow) {
      out.judged = [...(out.judged || []), ...judged];
      continue;
    }
    // one write for each kind, and one for each health answer
    const byKind = new Map();
    for (const j of judged.filter((x) => !hasKind.has(x.id)))
      byKind.set(j.kind, [...(byKind.get(j.kind) || []), j.id]);
    for (const [kind, ids] of byKind)
      await d.update(`life_facts?user_id=eq.${userId}&id=in.(${ids.join(',')})`, { kind });
    // one write for each timing; the date stays as it was, and every reader
    // reads a standing fact as having none (shared/factTiming.js)
    const byTiming = new Map();
    for (const j of judged.filter((x) => x.timing && !hasTiming.has(x.id)))
      byTiming.set(j.timing, [...(byTiming.get(j.timing) || []), j.id]);
    for (const [timing, ids] of byTiming) {
      out.timings += ids.length;
      await d.update(`life_facts?user_id=eq.${userId}&id=in.(${ids.join(',')})`, { timing });
    }
    for (const flag of [true, false]) {
      const ids = judged.filter((j) => j.health === flag && !hasHealth.has(j.id)).map((j) => j.id);
      if (ids.length)
        await d.update(`life_facts?user_id=eq.${userId}&id=in.(${ids.join(',')})`, {
          health: flag,
        });
    }
  }
  return out;
}

/** The people who have facts without a kind, for the one time pass over everyone, a page at a time. */
export async function usersLackingKinds(env) {
  const d = db(env);
  const users = new Set();
  for (let offset = 0; ; offset += 1000) {
    const rows = await d.select(
      `life_facts?or=(kind.is.null,kind.not.in.(${FACT_KINDS.join(',')}),health.is.null,timing.is.null)&select=user_id&order=user_id.asc&limit=1000&offset=${offset}`,
    );
    for (const r of rows) users.add(r.user_id);
    if (rows.length < 1000) break;
  }
  return [...users];
}
