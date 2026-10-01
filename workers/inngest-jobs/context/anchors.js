/**
 * Date anchors (user_temporal_anchors) are written by chat when the person
 * mentions a date. Chat reads them back as "coming up". An anchor can outlive
 * the plan it came from, or come from Gremly's own words: that is how the Japan
 * trip kept coming back.
 *
 * After each ledger read, a model checks the active anchors against the ledger
 * and the person's own words, and retires or re-dates the ones that no longer
 * hold. Code applies only what it returns, to the anchors it was shown.
 */

import { db, localDate, relativeDay, personIdentity } from './db';
import { jsonCall, modelFor } from './llm';
import { recentCorrections } from './corrections';
import { CARE_RULES, personBlock } from '../careRules';

function trim(text, n) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const ANCHOR_SCHEMA = {
  type: 'object',
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          anchor_ref: { type: 'string' },
          action: { type: 'string', enum: ['keep', 'retire', 'redate'] },
          basis: { type: 'string', enum: ['ledger', 'source_words'] },
          new_date: { type: 'string', nullable: true },
          reason: { type: 'string' },
          fact_refs: { type: 'array', items: { type: 'string' } },
        },
        required: ['anchor_ref', 'action', 'basis', 'new_date', 'reason', 'fact_refs'],
      },
    },
  },
  required: ['decisions'],
};

function systemPrompt(today, person) {
  return `Gremly keeps a list of dates coming up in a person's life, taken from what they said in chat. Chat reminds them of these. Check each one against what Gremly knows from their own records, and decide whether it still holds.

TODAY'S DATE: ${today}

${personBlock(person)}

${CARE_RULES}

FOR EACH DATE
- keep: the person's own words support it and nothing since says otherwise.
- retire: the ledger shows it already happened, fell through, was corrected by the person, or was replaced by a different plan; or the words it came from do not themselves state the plan, so it rests on something Gremly said.
- redate: the ledger shows the same plan at a different date. Give the new date.
- basis says what a retire or redate rests on: ledger when facts show it (cite them), source_words when the words it came from never stated the plan. When you are unsure, keep it.`;
}

/**
 * Check active anchors for one person. In shadow the decisions are returned
 * and nothing changes.
 */
export async function reconcileAnchors(env, userId, tz, { shadow }) {
  const d = db(env);
  const today = localDate(tz);
  const anchors = await d.select(
    `user_temporal_anchors?user_id=eq.${userId}&status=eq.active&select=id,title,description,date_text,resolved_date,date_confidence,source_message,created_at&order=resolved_date.asc.nullslast&limit=60`,
  );
  if (!anchors.length) return { checked: 0 };
  const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const [facts, corrections, person] = await Promise.all([
    d.select(`life_facts?user_id=eq.${userId}&or=(state.in.(current,planned,unconfirmed),about_date.gte.${yearAgo})&select=id,statement,about_date,state,state_reason&order=about_date.desc.nullslast&limit=300`),
    recentCorrections(env, userId, 365),
    personIdentity(env, userId),
  ]);
  const aRef = new Map();
  const aLines = anchors.map((a, i) => {
    const ref = `a${i + 1}`;
    aRef.set(ref, a);
    return `${ref} | ${a.resolved_date || 'no date'}${a.resolved_date ? ` (${relativeDay(a.resolved_date, today)})` : ''} | ${trim(a.title, 120)}${a.description ? `: ${trim(a.description, 160)}` : ''} | taken from their words: "${trim(a.source_message, 240)}" on ${String(a.created_at).slice(0, 10)}`;
  });
  const fRef = new Map();
  const fLines = facts.map((f, i) => {
    const ref = `f${i + 1}`;
    fRef.set(ref, f);
    return `${ref} | ${f.state} | ${f.about_date || 'no date'} | ${trim(f.statement, 200)}${f.state_reason ? ` (why: ${trim(f.state_reason, 120)})` : ''}`;
  });
  const user = `DATES GREMLY HAS AS COMING UP (ref | date | title | source):
${aLines.join('\n')}

LEDGER (ref | state | date | statement):
${fLines.join('\n') || '(none)'}

CORRECTIONS THE PERSON MADE: ${corrections.map((c) => `"${trim(c.statement, 140)}" is wrong; they said "${trim(c.correction_text, 160)}"`).join('; ') || 'none'}`;

  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'reader'),
    fallback: modelFor(env, 'readerFallback'),
    system: systemPrompt(today, person),
    user,
    schema: ANCHOR_SCHEMA,
    maxTokens: 4000,
    effort: 'low',
    thinking: 'low',
  });

  const result = { checked: anchors.length, retired: [], redated: [], model, shadow };
  const nowIso = new Date().toISOString();
  for (const dcs of output.decisions || []) {
    const a = aRef.get(dcs.anchor_ref);
    if (!a || dcs.action === 'keep') continue;
    const cited = (dcs.fact_refs || []).map((r) => fRef.get(r)).filter(Boolean);
    // A retire or redate needs ledger facts behind it, or (for a retire) the
    // finding that the source words never stated the plan.
    if (!cited.length && !(dcs.action === 'retire' && dcs.basis === 'source_words')) continue;
    if (dcs.action === 'retire') {
      result.retired.push({ title: a.title, reason: trim(dcs.reason, 200) });
      if (!shadow) await d.update(`user_temporal_anchors?id=eq.${a.id}&user_id=eq.${userId}`, { status: 'resolved', resolved_at: nowIso, updated_at: nowIso });
    } else if (dcs.action === 'redate' && /^\d{4}-\d{2}-\d{2}$/.test(dcs.new_date || '')) {
      result.redated.push({ title: a.title, from: a.resolved_date, to: dcs.new_date, reason: trim(dcs.reason, 200) });
      if (!shadow) await d.update(`user_temporal_anchors?id=eq.${a.id}&user_id=eq.${userId}`, { resolved_date: dcs.new_date, date_confidence: 'exact', updated_at: nowIso });
    }
  }
  return result;
}
