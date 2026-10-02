/**
 * Notifications: the words. Written at the moment of sending, from that
 * moment's facts, in Gremly's voice, by a fast cheap model with the other model
 * as its fallback. If both fail, or the words break a hard rule, a plain fixed
 * line goes instead and the log says so, so a rising count shows up.
 *
 * Prompt policy: semantic rules only, no examples, no word lists. Reminders
 * the person set are worded plainly in code: their own words, every time.
 */

import { PRIVATE_RULES, WRITING_RULES } from '../careRules';
import { jsonCall } from '../context/llm';

export const COPY_PROMPT_VERSION = 'notif-copy-2026-10-02b';
export const COPY_MODELS = Object.freeze({
  primary: { provider: 'google', model: 'gemini-3.8-flash' },
  fallback: { provider: 'openai', model: 'gpt-6-luna' },
});
export const LIMITS = Object.freeze({ title: 30, body: 100, timeoutMs: 4000 });

/** What each angle asks of the writer, as a rule. */
export const ANGLE_RULES = Object.freeze({
  day_shape:
    'Describe the shape of today using only the facts: travel, meetings, free time, due items, habits, what waits in Sweep and anything dated today. When they travel today, that leads. Call the day clear or empty only when all of those are none.',
  callback:
    'Refer to one specific thing from the facts that the person dropped or planned, using their own words for it.',
  celebration: 'Notice one concrete thing from the facts that went well, plainly and without fuss.',
  gremly_state:
    "Speak from Gremly's own state as the facts give it (how fed he is, how close he is to growing up), as a small creature would, never as a demand.",
  tiny_invite: 'Invite one small thing that takes seconds, with nothing to catch up on.',
  something_waiting: 'Say plainly what is ready for them to look at.',
  memory: "Recall one moment from the person's story in the facts, warmly and in a few words.",
});

const MOMENT_RULES = Object.freeze({
  brief:
    "Today's brief is written and waiting in Chat. Tell them their day is ready, about today only.",
  sweep: 'There are a few things waiting in Sweep this evening. Make a short sweep feel light.',
  habit_checkin:
    'They usually log this habit by now and have not today. Ask, lightly, whether it happened.',
  nudge:
    'There is a real reason in the facts for Gremly to say something now. Say it in one easy line.',
  good_news: 'Something good is ready. Say what it is.',
  return_note:
    'They have not opened the app for a while. Say something light and welcoming that asks nothing of them.',
});

export const VOICE_RULES = `GREMLY'S VOICE
- Gremly is a friendly little companion who invites. Never a coach, a boss or a nag, and never tells the person what they should do.
- Put the point in the first few words. The line must make sense on its own, because the phone may fold it into a one line summary.
- Plain and specific beats clever. No teasers, no wordplay that hides the meaning.
- No guilt, no counting missed days, no mention of time away, no streak threats, no urgency.
- Mention only what the facts give you. Use item names exactly as given.
- Never repeat or closely echo any of the recent lines you are shown.
- A title is optional and at most ${LIMITS.title} characters. The body is at most ${LIMITS.body} characters.`;

/** Plain lines for when the writer cannot be used. Draft words for James to edit. */
export function fallbackCopy(moment, f = {}) {
  switch (moment) {
    case 'brief':
      return {
        title: f.weekday ? `Your ${f.weekday}’s ready` : 'Your day’s ready',
        body: 'Tap for the rundown in Chat.',
      };
    case 'sweep':
      return {
        title: 'Evening sweep',
        body: 'A few things are waiting. A couple of minutes and you’re clear.',
      };
    case 'habit_checkin':
      return {
        title: f.habitTitle ? clip(f.habitTitle, LIMITS.title) : 'Habit check in',
        body: 'Done today? Tap to log it.',
      };
    case 'nudge':
      return { title: '', body: 'Gremly’s here if anything’s on your mind.' };
    case 'good_news':
      return { title: f.goodNewsTitle || 'Something good is ready', body: 'Tap to have a look.' };
    case 'return_note':
      return {
        title: '',
        body: f.lastNote
          ? 'Gremly’s keeping everything safe. Here whenever you are.'
          : 'One thought for Gremly? Ten seconds, nothing to catch up on.',
      };
    default:
      return { title: '', body: 'Gremly has something for you.' };
  }
}

/** Reminders the person set: their own words, worded in code. */
export function reminderCopy({ itemTitle, rule, startClock }) {
  const title = clip(itemTitle || 'Reminder', LIMITS.title);
  if (rule?.kind === 'before') {
    if (rule.evening)
      return { title, body: startClock ? `Tomorrow at ${startClock}.` : 'Tomorrow.' };
    const m = Number(rule.minutes || 0);
    const when = m >= 60 ? `${m / 60 === 1 ? 'an hour' : `${m / 60} hours`}` : `${m} minutes`;
    return { title, body: `Starts in ${when}${startClock ? `, at ${startClock}` : ''}.` };
  }
  return { title, body: 'You asked me to remind you about this now.' };
}

function clip(s, n) {
  const t = String(s || '').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Hard rules on the writer's output (approved by James on 1 Oct 2026): length,
 * no dashes, and not a repeat of a line sent in the last 30 days. A failure is
 * reported, never quietly fixed.
 * @returns {string|null} what was wrong, or null when it passes
 */
export function checkCopy(out, recentLines = []) {
  if (!out || typeof out.body !== 'string' || !out.body.trim()) return 'empty body';
  const title = out.title ? String(out.title) : '';
  if (title.length > LIMITS.title) return `title over ${LIMITS.title} characters`;
  if (out.body.length > LIMITS.body) return `body over ${LIMITS.body} characters`;
  if (/[–—]|--/.test(`${title} ${out.body}`)) return 'contains a dash';
  const b = norm(out.body);
  if (recentLines.some((l) => norm(l) === b)) return 'repeats a recent line';
  return null;
}

export function buildPrompt({ moment, angle, facts, recentLines }) {
  const system = {
    fixed: `You write one push notification from Gremly, a small companion creature in a personal app.\n\n${VOICE_RULES}\n\n${WRITING_RULES}\n\n${PRIVATE_RULES}\n\nReturn JSON with "title" (may be empty) and "body".`,
    varying: '',
  };
  const lines = [];
  lines.push(`WHAT THIS IS: ${MOMENT_RULES[moment] || 'A notification from Gremly.'}`);
  if (angle && ANGLE_RULES[angle]) lines.push(`ANGLE: ${ANGLE_RULES[angle]}`);
  lines.push(`FACTS:\n${JSON.stringify(facts || {}, null, 1)}`);
  lines.push(
    `RECENT LINES (do not repeat or echo):\n${
      (recentLines || [])
        .slice(0, 10)
        .map((l) => `- ${l}`)
        .join('\n') || '- none'
    }`,
  );
  return { system, user: lines.join('\n\n') };
}

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', nullable: true },
    body: { type: 'string' },
  },
  required: ['body'],
};

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * The words for one notification.
 * @returns {{title, body, model, usedFallback, problem}}
 */
export async function writeCopy(
  env,
  { moment, angle, facts, recentLines = [], fallbackFacts = {} },
  call = jsonCall,
) {
  const { system, user } = buildPrompt({ moment, angle, facts, recentLines });
  const problems = [];
  for (const m of [COPY_MODELS.primary, COPY_MODELS.fallback]) {
    try {
      const { output } = await withTimeout(
        call(env, { primary: m, fallback: null, system, user, schema: SCHEMA, maxTokens: 1500 }),
        LIMITS.timeoutMs,
      );
      const out = {
        title: output?.title ? String(output.title).trim() : '',
        body: String(output?.body || '').trim(),
      };
      const bad = checkCopy(out, recentLines);
      if (!bad)
        return {
          ...out,
          model: m.model,
          usedFallback: false,
          problem: problems.join('; ') || null,
        };
      problems.push(`${m.model}: ${bad}`);
    } catch (err) {
      problems.push(`${m.model}: ${String(err?.message || err).slice(0, 160)}`);
    }
  }
  return {
    ...fallbackCopy(moment, fallbackFacts),
    model: null,
    usedFallback: true,
    problem: problems.join('; '),
  };
}
