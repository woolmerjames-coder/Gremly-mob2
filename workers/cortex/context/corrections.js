/**
 * Corrections in chat. After each Ask Gremly turn a small helper call reads the
 * end of the conversation and decides whether the person said that something
 * Gremly holds about their life is wrong. If they did, their words go to the
 * context pipeline (inngest-jobs /api/correction), which marks the facts
 * corrected and rewrites every place that repeated them, straight away.
 *
 * The model decides; code only checks that the words it returns are the
 * person's own, copied from their messages.
 */

import { helperFetch } from '../helperClient.js';
import { fetchInngestWorker } from '../inngestWorker.js';

function correctionPrompt(conversationText) {
  return `You read the end of a conversation between a person and Gremly, their companion app.

Decide whether, in their own words, the person says that something Gremly holds or said about their life is wrong: a plan, a date, an event, something about them or about the people in their life. That includes telling Gremly it has something wrong, that it never happened, or that it is not true.

A plan the person changes is not a correction of Gremly, and neither is a question, a preference about how Gremly talks, or a mistake in an item they asked Gremly to save.

CONVERSATION
${conversationText}

Return only JSON: {"corrections":[{"said":"<the person's words, copied exactly from one of their messages>","about":"<what Gremly had wrong, in a few words>"}]}. Return an empty list when there is no correction.`;
}

/**
 * @returns {Promise<{sent: number}>}
 */
export async function checkForCorrection({
  conversationText,
  userTexts,
  chatId,
  userId,
  env,
  surface = 'chat',
}) {
  if (!userId || !conversationText || !env.INNGEST_WORKER_URL || !env.INNGEST_ADMIN_KEY)
    return { sent: 0 };
  const res = await helperFetch('correction_check', {
    messages: [
      { role: 'system', content: correctionPrompt(conversationText) },
      { role: 'user', content: 'Check the conversation.' },
    ],
    max_tokens: 400,
    temperature: 0,
    response_format: { type: 'json_object' },
  });
  if (!res.ok) return { sent: 0 };
  const json = await res.json().catch(() => null);
  let parsed = null;
  try {
    parsed = JSON.parse(json?.choices?.[0]?.message?.content || '{}');
  } catch {
    return { sent: 0 };
  }
  const own = (userTexts || []).map((t) => String(t || ''));
  let sent = 0;
  for (const c of parsed?.corrections || []) {
    const said = String(c?.said || '').trim();
    // Their own words only: what Gremly said is never a correction.
    if (!said || !own.some((t) => t.includes(said))) continue;
    const r = await fetchInngestWorker(env, '/api/correction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': env.INNGEST_ADMIN_KEY },
      body: JSON.stringify({
        user_id: userId,
        said,
        // the day's brief thread sends 'brief' (Daily brief in Chat)
        surface: surface === 'brief' ? 'brief' : 'chat',
        chat_id: chatId || null,
        target_kind: 'chat',
        target_text: String(c?.about || '').slice(0, 300),
      }),
    }).catch(() => null);
    if (r?.ok) sent++;
  }
  return { sent };
}
