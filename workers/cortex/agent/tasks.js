// ============================================================================
// tasks.js: the agent's task list. What the person has asked for in this
// conversation and where each ask stands, kept with the conversation so
// nothing they asked for is lost between messages. The model keeps it with
// the track_tasks tool; the loop holds it (run.js) and the surface stores it
// with the conversation (today's thread, a chat).
// ============================================================================

import { arr, obj, str, strEnum } from './tools/schema.js';

export const TASK_STATES = ['open', 'proposed', 'needs_answer', 'done', 'not_possible', 'dropped'];
const MAX_TASKS = 12;
const ASK_MAX = 140;

const DESCRIPTION = `Keep the list of what the person has asked for in this conversation and where each ask stands, so nothing they asked for is lost across messages. Use it when they ask for more than one thing, or for something that takes more than one step, and whenever one of those asks moves on. Each ask is short and in their words. A state is open while you are still working on it, proposed when its change is on the card, needs_answer when you have asked them something it depends on, done once it has happened or they accepted it, not_possible when Gremly cannot do it here, and dropped when they no longer want it. Each call replaces the whole list.`;

export const trackTasks = {
  name: 'track_tasks',
  description: DESCRIPTION,
  parameters: obj(
    {
      tasks: arr(
        obj(
          {
            ask: str('what they asked for, short and in their words'),
            status: strEnum(TASK_STATES, 'where it stands'),
          },
          ['ask', 'status'],
        ),
        'every ask in this conversation that is still worth keeping, in the order they asked',
      ),
    },
    ['tasks'],
  ),
};

/** The list as the model gave it, cleaned: known states, short asks, no repeats. */
export function normalizeTasks(raw) {
  const out = [];
  for (const t of Array.isArray(raw) ? raw : []) {
    const ask = String(t?.ask || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, ASK_MAX);
    if (!ask || !TASK_STATES.includes(t?.status)) continue;
    if (out.some((x) => x.ask.toLowerCase() === ask.toLowerCase())) continue;
    out.push({ ask, status: t.status });
    if (out.length >= MAX_TASKS) break;
  }
  return out;
}

/** The list in words, for the model's instructions at the start of a turn. */
export function tasksWords(tasks) {
  if (!tasks?.length) return '';
  return tasks.map((t) => `- ${t.ask} (${t.status.replace('_', ' ')})`).join('\n');
}

/** What the model hears back after keeping the list. */
export function tasksReceipt(tasks) {
  const open = tasks.filter((t) => ['open', 'proposed', 'needs_answer'].includes(t.status)).length;
  return `Kept. ${tasks.length} ask${tasks.length === 1 ? '' : 's'} on the list, ${open} still in hand.`;
}
