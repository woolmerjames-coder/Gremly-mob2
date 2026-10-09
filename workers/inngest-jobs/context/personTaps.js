/**
 * What a person decides by a tap on the page Gremly keeps about someone in
 * their life (Worlds rebuild, stage 5): two records Gremly proposed as one
 * person are made one on Same person and kept apart on Not the same, and
 * Undo puts either back as it was, proposed. Nothing here reads words: the
 * tap is the decision.
 *
 * A question asked about the same two records (peopleQuestions.js) is
 * answered by the tap too, so it is never asked after, and Undo opens it
 * again. Cortex forwards the signed in person's tap (type person-merge) to
 * POST /api/person-merge.
 */

import { db } from './db';
import { mergePeople, undoMerge } from './people';
import { invalidateChatCache } from './cache';

const UUID = /^[0-9a-f-]{36}$/i;

/** The taps there are. */
export const MERGE_ACTS = ['merge', 'decline', 'undo'];

/** What a question about the merge records as its answer when a tap answered it. */
export const TAPPED_ANSWER = { merge: 'Same person', decline: 'Not the same' };

/** Questions about these two records, answered by the tap or opened again by Undo. */
async function settleQuestions(d, userId, mergeId, { act, at }) {
  const about = `gremly_questions?user_id=eq.${userId}&kind=eq.person&proposed_change->>merge_id=eq.${mergeId}`;
  // only one the tap answered opens again; one they answered in their own words stays answered
  if (act === 'undo') {
    for (const answer of Object.values(TAPPED_ANSWER))
      await d.update(`${about}&status=eq.answered&answer=eq.${encodeURIComponent(answer)}`, {
        status: 'asked',
        answer: null,
        answered_at: null,
      });
    return;
  }
  await d.update(`${about}&status=in.(open,asked)`, {
    status: 'answered',
    answer: TAPPED_ANSWER[act],
    answered_at: at,
  });
}

/**
 * One tap. Returns whether it changed anything, and the two records, so the
 * page can follow the one that is kept.
 */
export async function decidePersonMerge(
  env,
  { userId, mergeId, act, at = new Date().toISOString() },
) {
  if (
    !UUID.test(String(userId || '')) ||
    !UUID.test(String(mergeId || '')) ||
    !MERGE_ACTS.includes(act)
  )
    return { ok: false, reason: 'a merge and what to do with it are required' };
  const d = db(env);
  const [m] =
    (await d.select(
      `person_merges?id=eq.${mergeId}&user_id=eq.${userId}&select=id,status,kept_id,merged_id`,
    )) || [];
  if (!m) return { ok: false, reason: 'not found' };
  let result;
  if (act === 'merge') result = await mergePeople(d, userId, m.id);
  else if (act === 'decline') {
    const rows = await d.update(
      `person_merges?id=eq.${m.id}&user_id=eq.${userId}&status=eq.proposed`,
      {
        status: 'declined',
        decided_at: at,
      },
    );
    result = rows?.length ? { declined: true } : { declined: false, reason: `already ${m.status}` };
  } else if (m.status === 'merged') {
    result = await undoMerge(d, userId, m.id);
    // as it was before the tap: proposed, for them to decide again
    if (result.undone)
      await d.update(`person_merges?id=eq.${m.id}&user_id=eq.${userId}&status=eq.undone`, {
        status: 'proposed',
        decided_at: null,
      });
  } else if (m.status === 'declined') {
    const rows = await d.update(
      `person_merges?id=eq.${m.id}&user_id=eq.${userId}&status=eq.declined`,
      {
        status: 'proposed',
        decided_at: null,
      },
    );
    result = { undone: !!rows?.length };
  } else result = { undone: false, reason: `nothing to undo, it is ${m.status}` };
  const ok = !!(result.merged || result.declined || result.undone);
  if (ok) {
    await settleQuestions(d, userId, m.id, { act, at });
    await invalidateChatCache(env, userId);
  }
  return { ok, act, kept_id: m.kept_id, merged_id: m.merged_id, ...result };
}

/**
 * POST /api/person-merge { user_id, merge_id, act } (admin key checked
 * upstream; cortex sends it for the signed in person).
 */
export async function handlePersonMergeApi(request, env, corsResponse) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId =
      typeof body.user_id === 'string' && UUID.test(body.user_id) ? body.user_id : null;
    const mergeId =
      typeof body.merge_id === 'string' && UUID.test(body.merge_id) ? body.merge_id : null;
    const act = MERGE_ACTS.includes(body.act) ? body.act : null;
    if (!userId || !mergeId || !act)
      return corsResponse({ error: 'user_id, merge_id and act are required' }, 400);
    const r = await decidePersonMerge(env, { userId, mergeId, act });
    if (r.reason === 'not found')
      return corsResponse({ error: 'no such merge for this person' }, 404);
    return corsResponse(r, r.ok ? 200 : 409);
  } catch (e) {
    return corsResponse({ error: String(e?.message || e).slice(0, 300) }, 500);
  }
}
