/**
 * Corrections in chat. After every message the person sends in a chat (Ask
 * Gremly, whichever writer answers and whatever the reply's mode, today's
 * thread, and a World's or Chapter's chat), a small helper call reads that
 * message, with the end of the conversation for background, and decides
 * whether they said that something Gremly holds about their life is wrong. If
 * they did, their words go to the context pipeline (inngest-jobs
 * /api/correction), which marks the facts corrected and rewrites every place
 * that repeated them, straight away. The check runs on its own, after the
 * reply has gone: whether anything is extracted from the message has no
 * bearing on it (data fabric stage 6).
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
  scope = null,
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
        // in a World's or Chapter's chat, what they said reaches its lines too
        target_kind: scopeOf(scope)?.kind || 'chat',
        ...(scopeOf(scope) ? { target_id: scope.id } : {}),
        target_text: String(c?.about || '').slice(0, 300),
      }),
    }).catch(() => null);
    if (r?.ok) sent++;
  }
  return { sent };
}

/** A World's or Chapter's chat, by its kind and id; null for any other chat. */
function scopeOf(scope) {
  return scope && ['world', 'chapter'].includes(scope.kind) && /^[0-9a-f-]{36}$/i.test(String(scope.id || ''))
    ? scope
    : null;
}

/**
 * Check the message the person has just sent, after the reply to it has gone.
 * Held open by ctx.waitUntil, so it never holds up the reply, and it never
 * throws: a check that fails is logged.
 * @param {object} p
 * @param {Array<{role: string, content: string}>} p.messages the conversation as sent, their newest message last
 * @param {string} [p.reply] Gremly's reply to it, for background
 * @param {{kind: 'world'|'chapter', id: string}} [p.scope] the World or Chapter a scoped chat is in
 * @returns {Promise<{sent: number}>}
 */
export function checkTurn({ env, ctx, messages, reply, chatId, userId, surface = 'chat', scope = null, tag = 'Chat', deps = {} }) {
  const said = (messages || []).filter((m) => m && m.role !== 'system');
  const latest = said.filter((m) => m.role === 'user').at(-1)?.content;
  if (!userId || typeof latest !== 'string' || !latest.trim()) return Promise.resolve({ sent: 0 });
  const recent = [...said, ...(reply ? [{ role: 'assistant', content: reply }] : [])].slice(-20);
  const check = deps.checkForCorrection || checkForCorrection;
  const p = Promise.resolve()
    .then(() =>
      check({
        conversationText: recent.map((m) => `${m.role === 'user' ? 'User' : 'Gremly'}: ${m.content}`).join('\n\n'),
        latest,
        chatId,
        userId,
        env,
        surface,
        scope,
      }),
    )
    .then((r) => {
      if (r?.sent) console.log(`[${tag}] Correction sent to the context pipeline`, r);
      return r || { sent: 0 };
    })
    .catch((e) => {
      console.warn(`[${tag}] Correction check failed:`, e?.message);
      return { sent: 0 };
    });
  ctx?.waitUntil?.(p);
  return p;
}
