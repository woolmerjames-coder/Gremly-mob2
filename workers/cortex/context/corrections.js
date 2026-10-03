/**
 * Corrections in chat. After each turn (Ask Gremly, and today's thread) a small
 * helper call reads the message the person just sent, with the end of the
 * conversation for background, and decides whether they said that something
 * Gremly holds about their life is wrong. If they did, their words go to the
 * context pipeline (inngest-jobs /api/correction), which marks the facts
 * corrected and rewrites every place that repeated them, straight away.
 *
 * Each message is checked once, on its own turn: an earlier message was
 * checked when it was sent, so it is never sent as a correction again.
 *
 * The model decides; code only checks that the words it returns are the
 * person's own, copied from the message they just sent.
 */

import { helperFetch } from '../helperClient.js';
import { fetchInngestWorker } from '../inngestWorker.js';

function correctionPrompt(conversationText, latest) {
  return `You read the end of a conversation between a person and Gremly, their companion app, and the message the person has just sent.

Decide whether, in the message they have just sent, the person says that something Gremly holds or said about their life is wrong: a plan, a date, an event, something about them or about the people in their life. That includes telling Gremly it has something wrong, that it never happened, or that it is not true.

The conversation is there so you can tell what Gremly said and what they are answering. What they said in earlier messages was checked when they sent it, so only the message they have just sent can hold a correction now.

A plan the person changes is not a correction of Gremly, and neither is a question, a preference about how Gremly talks, or a mistake in an item they asked Gremly to save.

CONVERSATION
${conversationText}

THE MESSAGE THEY HAVE JUST SENT
${latest}

Return only JSON: {"corrections":[{"said":"<their words, copied exactly from the message they have just sent>","about":"<what Gremly had wrong, in a few words>"}]}. Return an empty list when there is no correction.`;
}

/**
 * @param {object} p
 * @param {string} p.conversationText the end of the conversation, for background
 * @param {string} p.latest the message the person has just sent, the one checked
 * @returns {Promise<{sent: number}>}
 */
export async function checkForCorrection({
  conversationText,
  latest,
  chatId,
  userId,
  env,
  surface = 'chat',
}) {
  const own = String(latest || '').trim();
  if (!userId || !own || !conversationText || !env.INNGEST_WORKER_URL || !env.INNGEST_ADMIN_KEY)
    return { sent: 0 };
  const res = await helperFetch('correction_check', {
    messages: [
      { role: 'system', content: correctionPrompt(conversationText, own) },
      { role: 'user', content: 'Check the message they have just sent.' },
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
  let sent = 0;
  for (const c of parsed?.corrections || []) {
    const said = String(c?.said || '').trim();
    // Their own words, from this message only: what Gremly said is never a
    // correction, and an earlier message had its check on its own turn.
    if (!said || !own.includes(said)) continue;
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
