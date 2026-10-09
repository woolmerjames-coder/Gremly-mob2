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

import { chatAgentPersona, chatTurnGuidance } from '../gremlyPersona.js';
import { formatWeekAhead } from '../context/weekAhead.js';
import { localDateOf, minutesIn } from '../../shared/calendar.js';
import { runAgent } from './run.js';
import { runTool, toolContext } from './tools/index.js';
import { AGENT_PROMPT_VERSION } from './prompt.js';
import { readWeek, weekFrameOf, weekLine, weekVariant } from './brief.js';
import { placesContext, readPlaces } from './places.js';

export const CHAT_AGENT_VERSION = `chat-2026-10-17b/${AGENT_PROMPT_VERSION}`;

/** How many of their items the search before the first step offers. */
const FOUND_LIMIT = 8;

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
 * Their items that share words with the message, searched the way find_items
 * searches, before the agent's first step: a change to one of them, or the
 * check that something new is not already there, then needs no step of its
 * own. Never throws; a search that fails leaves the section out.
 */
export async function foundForMessage(ctx, message) {
  const query = String(message || '')
    .trim()
    .slice(0, 200);
  if (!query) return '';
  const r = await runTool(ctx, 'find_items', { query, limit: FOUND_LIMIT });
  if (!r.ok) return '';
  const head = 'THEIR ITEMS THAT SHARE WORDS WITH THIS MESSAGE (open ones, searched just now)';
  return r.result?.items?.length ? `${head}\n${r.text}` : `${head}: none.`;
}

/** The search above for a message on its way in, started alongside triage (cortex-index.js). */
export function prefetchForChat(env, { userId, timezone, message, today = null }) {
  const tz = timezone || 'UTC';
  // today: the person's day when the caller knows it (a day or a promise of
  // one, workers/shared/day.js), the calendar's date when it does not
  return Promise.resolve(today)
    .catch(() => null)
    .then((theirDay) =>
      foundForMessage(
        {
          ...toolContext(env, {
            userId,
            today: theirDay || localDateOf(tz, Date.now()),
            timezone: tz,
          }),
          surface: 'chat',
        },
        message,
      ),
    )
    .catch(() => '');
}

/** The preload's week ahead with its todos' ids, for the agent alone (the writer reads it without). */
function weekWithIds(sessionContext, week) {
  const text = sessionContext || '';
  if (!week) return text;
  const plain = formatWeekAhead(week);
  const withIds = formatWeekAhead(week, { ids: true });
  if (plain && text.includes(plain)) return text.replace(plain, () => withIds);
  return [text, withIds].filter(Boolean).join('\n\n');
}

/**
 * What the agent knows that changes between messages: the preload the quick
 * lane's writer reads (who they are, today so far, the conversation in short,
 * the item a chat is about, their life and week), with the week's todos
 * carrying their ids, and their items that share words with the message. When
 * the app sent their week (the weekly review), one line about it too: their
 * weekly day, where this week's review stands, and whether the extra is free.
 * First, how triage read the message (its mode and how personal it is), as the
 * quick lane's writer is told it (gremlyPersona.js chatTurnGuidance). For an
 * app build that can apply changes to Worlds and Chapters, their Worlds and
 * Chapters with ids (places.js).
 */
export function chatContext({
  profileText,
  todayActivity,
  runningSummary,
  anchor,
  sessionContext,
  week,
  found,
  theirWeek,
  triage,
  places,
  page,
}) {
  return [
    // first, as the quick lane's writer reads it before what it knows of them
    chatTurnGuidance(triage),
    profileText ? `ABOUT THIS USER\n${profileText}` : '',
    todayActivity || '',
    runningSummary ? `THIS CONVERSATION EARLIER, IN SHORT\n${runningSummary}` : '',
    anchor && !anchor.gone && anchor.id
      ? `THIS CHAT IS ABOUT ONE OF THEIR ITEMS: the ${anchor.type} "${anchor.title}" (id ${anchor.id})`
      : '',
    // a World's or a Chapter's own chat: what is on its page (context/pageDetail.js)
    typeof page === 'string' ? page : '',
    weekWithIds(sessionContext, week),
    typeof places === 'string' ? places : '',
    typeof theirWeek === 'string' ? theirWeek : '',
    typeof found === 'string' ? found : '',
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
 * @param {object} p.preload for chatContext; found may be a promise (the search started alongside triage), else the search runs here; triage is how triage read the message; today is the person's day when the caller knows it (workers/shared/day.js), and dayEndHour the hour it ends
 * @param {object} [p.week] the person's week as the app sent it (lib/cortex/CortexClient.ts WeekTurnContext); with it Gremly knows where their weekly review stands and can put the button to it under a reply
 * @param {boolean} [p.worlds] the app build can apply changes to Worlds and Chapters (the request's worldsCard): Gremly is told theirs, with ids, and can put changes to them on the card
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
  week: sentWeek = null,
  worlds = false,
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
  // their day, which after midnight is still yesterday until their day ends
  const today = preload.today || localDateOf(tz, at);
  // their week, when this app build sends it. A review is never under way in
  // Ask Gremly: it happens in today's thread.
  const theirWeek = readWeek(sentWeek ? { ...sentWeek, under_way: null } : null, today);
  const weekFrame = weekFrameOf(theirWeek, today);
  const ctx = deps.ctx
    ? { ...deps.ctx, today, week: weekFrame }
    : toolContext(env, { userId, today, timezone: tz, week: weekFrame });
  const [found, places, page] = await Promise.all([
    preload.found !== undefined
      ? Promise.resolve(preload.found).catch(() => '')
      : foundForMessage({ ...ctx, surface: 'chat' }, last.content).catch(() => ''),
    worlds ? readPlaces(ctx).catch(() => null) : Promise.resolve(null),
    Promise.resolve(preload.page).catch(() => ''),
  ]);
  const r = await runAgent({
    surface: 'chat',
    variant: weekVariant(theirWeek),
    persona: chatAgentPersona(),
    places: worlds === true,
    context: chatContext({
      ...preload,
      found,
      page: page || '',
      places: places ? placesContext(places, today) : '',
      // the weekly day is moved on the card in today's thread, not here
      theirWeek: theirWeek ? weekLine(theirWeek, today, { moveOnCard: false }) : '',
    }),
    cacheKey: chatCacheKey(userId),
    history: turns.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
    message: last.content,
    ctx,
    nowMin: minutesIn(tz, at),
    dayEndHour: preload.dayEndHour,
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
  if (r.ok) {
    return {
      ok: true,
      reply: r.reply,
      card: r.card,
      tasks: r.tasks,
      // the button to their week goes under the reply
      ...(r.offer ? { offer: r.offer } : {}),
      ...how,
    };
  }
  return { ok: false, error: String(r.error || 'failed').slice(0, 200), ...how };
}
