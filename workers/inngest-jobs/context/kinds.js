/**
 * The kind pass (data fabric stage 2): every fact in the ledger gets one of the
 * fixed kinds (workers/shared/factKinds.js) and a health flag.
 *
 * The reader gives both to each new fact. This pass gives them to the facts
 * that have none: those made before the kinds were fixed, and those added by
 * corrections, which carry no kind. A model reads each fact and judges; code
 * only checks the kind is on the list and writes it. A fact the model leaves
 * out keeps no kind until the next pass.
 */

import { db } from './db';
import { jsonCall, modelFor } from './llm';
import { FACT_KINDS, KIND_RULES, validKind } from '../../shared/factKinds.js';

export const KINDS_PROMPT_VERSION = 'kinds-2026-10-08';

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
          health: { type: 'boolean' },
        },
        required: ['ref', 'kind', 'health'],
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
  return `You sort the facts in one person's ledger for Gremly, a companion app. Each fact is one statement about their life. For each fact you are shown, give its kind and say whether it concerns health.

${KIND_RULES}

Judge each fact by its own words. Return each fact you are shown once, by its ref.

Return only the structured result.`;
}

/** The request for one batch of facts, and the refs that name them. */
export function kindsRequest(facts) {
  const ref = new Map();
  const lines = facts.map((f, i) => {
    const r = `f${i + 1}`;
    ref.set(r, f);
    return `${r} | ${oneLine(f.statement)}`;
  });
  return { system: kindsSystemPrompt(), user: `FACTS\n${lines.join('\n')}`, ref };
}

/** Ask the model for one batch. Returns [{ id, kind, health }] for the facts it judged. */
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
    judged.push({ id: f.id, kind, health: j.health === true });
  }
  return { judged, model };
}

/**
 * Give a kind and a health flag to this person's facts that lack either, at
 * most maxCalls batches in one run. In shadow nothing is written.
 */
export async function giveKinds(env, userId, { maxCalls = 6, shadow = false } = {}) {
  const d = db(env);
  const lacking = await d.select(
    `life_facts?user_id=eq.${userId}&or=(kind.is.null,kind.not.in.(${FACT_KINDS.join(',')}),health.is.null)&select=id,statement,kind&order=created_at.asc&limit=${KINDS_PER_CALL * maxCalls}`,
  );
  // a fact that already has a kind from the list keeps it: only its health flag is asked for
  const hasKind = new Set(lacking.filter((f) => validKind(f.kind)).map((f) => f.id));
  const out = { lacking: lacking.length, given: 0, health: 0, left_out: 0, calls: 0, shadow };
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
    for (const flag of [true, false]) {
      const ids = judged.filter((j) => j.health === flag).map((j) => j.id);
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
      `life_facts?or=(kind.is.null,kind.not.in.(${FACT_KINDS.join(',')}),health.is.null)&select=user_id&order=user_id.asc&limit=1000&offset=${offset}`,
    );
    for (const r of rows) users.add(r.user_id);
    if (rows.length < 1000) break;
  }
  return [...users];
}
