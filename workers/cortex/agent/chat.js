// ============================================================================
// chat.js: Ask Gremly's lookups and changes on the agent (step 9 of the agent
// plan, "Gremly agent: general chat").
//
// Triage gives every Ask Gremly message a lane. Quick (conversation Gremly can
// answer from what it holds) stays with the quick lane's writer. Lookup and
// agent (a question about their own things, or a change to them) come here
// when the account is on AGENT_CHAT and the app build can draw the agent's
// card: the agent reads the preload the writer reads, in Gremly's chat voice
// (gremlyPersona.js chatAgentPersona), looks things up, and puts any changes
// on one card; nothing changes until the person taps. When the agent cannot
// finish, the quick lane's writer answers instead (cortex-index.js).
// ============================================================================

import { chatAgentPersona } from '../gremlyPersona.js';
import { localDateOf, minutesIn } from '../../shared/calendar.js';
import { runAgent } from './run.js';
import { toolContext } from './tools/index.js';
import { AGENT_PROMPT_VERSION } from './prompt.js';

export const CHAT_AGENT_VERSION = `chat-2026-10-03a/${AGENT_PROMPT_VERSION}`;

/** The lanes the agent answers in Ask Gremly. */
export const AGENT_LANES = ['lookup', 'agent'];

/**
 * Whether this person's lookups and changes go to the agent. AGENT_CHAT is
 * "on" for everyone, or user ids separated by commas while it is tried; empty
 * or anything else is off.
 */
export function agentChatFor(setting, userId) {
  const v = String(setting || '').trim();
  if (!v || !userId) return false;
  if (v === 'on') return true;
  return v
    .split(',')
    .map((x) => x.trim())
    .includes(userId);
}

/**
 * What the agent knows that changes between messages, the same preload the
 * quick lane's writer reads: who they are, today so far, the conversation in
 * short, the item a chat is about, and their life and week.
 */
export function chatContext({
  profileText,
  todayActivity,
  runningSummary,
  anchor,
  sessionContext,
}) {
  return [
    profileText ? `ABOUT THIS USER\n${profileText}` : '',
    todayActivity || '',
    runningSummary ? `THIS CONVERSATION EARLIER, IN SHORT\n${runningSummary}` : '',
    anchor && !anchor.gone && anchor.id
      ? `THIS CHAT IS ABOUT ONE OF THEIR ITEMS: the ${anchor.type} "${anchor.title}" (id ${anchor.id})`
      : '',
    sessionContext || '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** A short, stable key for one person's Ask Gremly turns (the provider's prompt cache). */
export function chatCacheKey(userId) {
  let h = 0x811c9dc5;
  for (const ch of String(userId || '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `gremly-chat-${h.toString(16)}`;
}

/**
 * One Ask Gremly message on the agent.
 * @param {object} p
 * @param {object} p.env
 * @param {string} p.userId
 * @param {string} p.timezone
 * @param {{role: string, content: string}[]} p.messages the conversation, ending with their message
 * @param {object[]} [p.tasks] the task list kept on the chat
 * @param {object} p.preload for chatContext
 * @param {(line: string) => void} [p.onStatus]
 * @param {object} [p.deps] { ctx, models, agent, now } for tests and replays
 * @returns {Promise<object>} ok with reply, card and tasks, or not ok with why
 */
export async function runChatTurn({
  env,
  userId,
  timezone,
  messages,
  tasks = [],
  preload = {},
  onStatus,
  deps = {},
}) {
  const turns = (messages || []).filter(
    (m) =>
      (m?.role === 'user' || m?.role === 'assistant') &&
      typeof m.content === 'string' &&
      m.content.trim(),
  );
  const last = turns.at(-1);
  if (!last || last.role !== 'user') return { ok: false, error: 'no message' };
  const tz = timezone || 'UTC';
  const at = deps.now ? deps.now() : Date.now();
  const today = localDateOf(tz, at);
  const ctx = deps.ctx ? { ...deps.ctx, today } : toolContext(env, { userId, today, timezone: tz });
  const r = await runAgent({
    surface: 'chat',
    persona: chatAgentPersona(),
    context: chatContext(preload),
    cacheKey: chatCacheKey(userId),
    history: turns.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
    message: last.content,
    ctx,
    nowMin: minutesIn(tz, at),
    tasks: Array.isArray(tasks) ? tasks : [],
    onStatus,
    models: deps.models,
    deps: deps.agent,
  });
  const how = {
    model: r.model,
    ms: r.ms,
    stopped: r.stopped,
    tools: (r.steps || []).filter((s) => s.kind === 'tool').map((s) => s.name),
    prompt_version: CHAT_AGENT_VERSION,
  };
  if (r.ok) return { ok: true, reply: r.reply, card: r.card, tasks: r.tasks, ...how };
  return { ok: false, error: String(r.error || 'failed').slice(0, 200), ...how };
}
