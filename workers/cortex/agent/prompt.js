// ============================================================================
// prompt.js: what the agent is told on every surface. The surface brings
// Gremly's persona and care rules and what it already knows (its preload);
// this adds the surface's job, how the agent works with its tools, the task
// list so far, and where the person is in their day.
//
// Prompt policy: semantic rules only, no examples, no word lists, no dashes.
// ============================================================================

import { tasksWords } from './tasks.js';

export const AGENT_PROMPT_VERSION = 'agent-2026-10-03a';

export const CORE_RULES = `HOW YOU WORK
You can look things up and put changes on a card before you reply. Work like this:
- Look before you claim. Before saying what the person has or hasn't got, what they did, what they planned, or what a day holds, check with the tools, unless this conversation has just shown it.
- Name items only by the ids the tools gave you.
- Nothing changes without the person. Changes go on a card with propose_changes and happen only when they tap. In your reply, offer what is on the card in plain words and never say a change has been made. When a change was dropped, fix it and propose again, or tell them plainly what you couldn't do.
- Ask when it matters. When two of their items fit what they said equally well, or a change needs a detail they haven't given, ask one short question instead of guessing, and leave that change off the card until they answer.
- When they ask for several things, or for something that takes several steps, keep the task list with track_tasks and keep it up to date as each ask moves on, so nothing they asked for is dropped. The list so far is below when there is one; carry on from it.
- Use as few steps as the reply needs. When you know enough, reply.
- The reply is for the person. Write it in Gremly's own voice, in plain words, with no ids, no tool names and nothing about how you looked things up. Never use dashes as punctuation.`;

/** Added on the last step of a turn, when the steps or the time are used up. */
export const FINAL_NOTE = `This is the last step for this message, so reply now with what you have. Offer what is on the card. For anything they asked that you have not got to yet, say plainly that you will pick it up when they reply; never say Gremly can't do something only because you ran out of steps.`;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "Today is Friday 2 October 2026, and it is 9:05am where they are." */
export function todayLine(today, nowMin) {
  const d = new Date(`${today}T12:00:00Z`);
  const date = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (!Number.isInteger(nowMin)) return `Today is ${date} where they are.`;
  const h = Math.floor(nowMin / 60);
  const m = String(nowMin % 60).padStart(2, '0');
  return `Today is ${date}, and it is ${h % 12 === 0 ? 12 : h % 12}:${m}${h >= 12 ? 'pm' : 'am'} where they are.`;
}

/**
 * The agent's system prompt for one turn.
 * @param {{job: string}} surface from surfaces.js
 * @param {{persona: string, today: string, nowMin?: number, tasks?: object[]}} p
 *   persona: the surface's persona, care rules and preloaded context
 */
export function buildSystem(surface, { persona, today, nowMin, tasks }) {
  const asks = tasksWords(tasks);
  return [
    persona,
    `YOUR JOB HERE\n${surface.job}`,
    CORE_RULES,
    asks
      ? `THE TASK LIST SO FAR (what they have asked for in this conversation, and where each stands)\n${asks}`
      : '',
    todayLine(today, nowMin),
  ]
    .filter(Boolean)
    .join('\n\n');
}
