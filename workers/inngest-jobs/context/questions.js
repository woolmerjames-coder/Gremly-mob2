/**
 * Gremly's open questions are written while reading records, sometimes old
 * ones, and a question can stop making sense: the moment passes, the ledger
 * answers it, or another question asks the same thing.
 *
 * Before a brief is built and after each ledger read, a model checks the open
 * questions against today's date and what Gremly knows, and retires the ones
 * no longer worth asking. Code applies only what it returns, to the questions
 * it was shown.
 */

import { db, localDate, relativeDay, personIdentity } from './db';
import { jsonCall, modelFor } from './llm';
import { recentCorrections } from './corrections';
import { CARE_RULES, personBlock } from '../careRules';
import { invalidateChatCache } from './cache';

function trim(text, n) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question_ref: { type: 'string' },
          action: { type: 'string', enum: ['keep', 'retire'] },
          basis: { type: 'string', enum: ['moment_passed', 'answered', 'duplicate', 'keep'] },
          duplicate_of: { type: 'string', nullable: true },
          fact_refs: { type: 'array', items: { type: 'string' } },
          reason: { type: 'string' },
        },
        required: ['question_ref', 'action', 'basis', 'duplicate_of', 'fact_refs', 'reason'],
      },
    },
  },
  required: ['decisions'],
};

function systemPrompt(today, person) {
  return `Gremly keeps a short list of questions to ask a person when the moment is right, about things their records leave unclear. Some were written while reading old records. Check each one against today's date and what Gremly now knows, and decide whether it is still worth asking today.

TODAY'S DATE: ${today}

${personBlock(person)}

${CARE_RULES}

FOR EACH QUESTION
- keep: it bears on their life now or on something still ahead, and the records still leave it unclear.
- retire, moment_passed: it is about something that has gone by and no longer bears on their life now, so asking would feel out of date.
- retire, answered: the ledger now settles it, read in the order things were recorded: a later record outranks an earlier one. Cite the facts.
- retire, duplicate: another question on the list asks the same thing. Name the one to keep.
- When you are unsure, keep it.`;
}

/**
 * Review one person's open questions. In shadow the decisions are returned and
 * nothing changes.
 */
export async function reviewQuestions(env, userId, tz, { shadow }) {
  const d = db(env);
  const today = localDate(tz);
  const questions = await d.select(
    `gremly_questions?user_id=eq.${userId}&status=in.(open,asked)&select=id,question,status,created_at,fact:life_facts(statement,state,about_date)&order=created_at.asc&limit=40`,
  );
  if (!questions.length) return { checked: 0 };
  const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const [facts, corrections, person] = await Promise.all([
    d.select(`life_facts?user_id=eq.${userId}&or=(state.in.(current,planned,unconfirmed),about_date.gte.${yearAgo})&select=id,statement,about_date,state,state_reason,observed_at&order=about_date.desc.nullslast&limit=300`),
    recentCorrections(env, userId, 365),
    personIdentity(env, userId),
  ]);

  const qRef = new Map();
  const qLines = questions.map((q, i) => {
    const ref = `q${i + 1}`;
    qRef.set(ref, q);
    const about = q.fact ? ` | about: "${trim(q.fact.statement, 200)}" (${q.fact.state}, ${q.fact.about_date ? `${q.fact.about_date}, ${relativeDay(q.fact.about_date, today)}` : 'no date'})` : '';
    return `${ref} | written ${localDate(tz, new Date(q.created_at))} | ${trim(q.question, 300)}${about}`;
  });
  const fRef = new Map();
  const fLines = facts.map((f, i) => {
    const ref = `f${i + 1}`;
    fRef.set(ref, f);
    return `${ref} | ${f.state} | ${f.about_date ? `${f.about_date} (${relativeDay(f.about_date, today)})` : 'no date'} | recorded ${f.observed_at ? localDate(tz, new Date(f.observed_at)) : 'unknown'} | ${trim(f.statement, 200)}${f.state_reason ? ` (why: ${trim(f.state_reason, 120)})` : ''}`;
  });
  const user = `OPEN QUESTIONS (ref | written | question | what it is about):
${qLines.join('\n')}

LEDGER (ref | state | date | recorded | statement):
${fLines.join('\n') || '(none)'}

CORRECTIONS THE PERSON MADE: ${corrections.map((c) => `"${trim(c.statement, 140)}" is wrong; they said "${trim(c.correction_text, 160)}"`).join('; ') || 'none'}`;

  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'reader'),
    fallback: modelFor(env, 'readerFallback'),
    system: systemPrompt(today, person),
    user,
    schema: REVIEW_SCHEMA,
    maxTokens: 4000,
    effort: 'low',
    thinking: 'low',
  });

  const result = { checked: questions.length, retired: [], model, shadow };
  const nowIso = new Date().toISOString();
  const retiring = new Set();
  for (const dcs of output.decisions || []) {
    const q = qRef.get(dcs.question_ref);
    if (!q || dcs.action !== 'retire' || retiring.has(q.id)) continue;
    if (dcs.basis === 'answered' && !(dcs.fact_refs || []).some((r) => fRef.has(r))) continue;
    if (dcs.basis === 'duplicate') {
      const keep = qRef.get(dcs.duplicate_of || '');
      // The one kept must be a different question that is not itself being retired.
      if (!keep || keep.id === q.id || retiring.has(keep.id)) continue;
    }
    if (!['moment_passed', 'answered', 'duplicate'].includes(dcs.basis)) continue;
    retiring.add(q.id);
    result.retired.push({ question: trim(q.question, 160), basis: dcs.basis, reason: trim(dcs.reason, 200) });
    if (!shadow) {
      await d.update(`gremly_questions?id=eq.${q.id}&user_id=eq.${userId}`, {
        status: dcs.basis === 'duplicate' ? 'dismissed' : 'expired',
      });
    }
  }
  if (!shadow && result.retired.length) await invalidateChatCache(env, userId);
  return result;
}
