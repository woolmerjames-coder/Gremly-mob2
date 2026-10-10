// ============================================================================
// The agent's tools (step 4 of the agent plan, "Gremly agent: the tools").
//
// Each tool is { name, description, parameters, run(ctx, input), render(result,
// ctx) }: the description and parameters are what the model reads, run does
// the work in code, and render puts the result into compact words for the
// model, with the ids it needs to act. Descriptions follow the prompt policy:
// semantic rules only, no examples, no word lists.
//
// ctx: { env, userId, today (YYYY-MM-DD where they are), timezone, db }
// (db is workers/shared/db.js). Built per turn with toolContext. On today's
// thread it also carries day (the plan on screen, set times and items the
// thread sent), week (the person's week, when the thread sent it) and surface,
// which picks a surface's own version of a tool.
//
// Reading tools change nothing. propose_changes changes nothing either: it
// puts checked changes on a card, and the app applies a card only when the
// person taps.
// ============================================================================

import { db } from '../../../shared/db.js';
import { withAiStep } from '../../../shared/aiUsage.js';
import { findItems } from './findItems.js';
import { getItem } from './getItem.js';
import { getDay } from './getDay.js';
import { recall } from './recall.js';
import { webSearch } from './webSearch.js';
import {
  proposeChanges,
  proposeDayChanges,
  proposeEaseChanges,
  proposeEasePlaceChanges,
  proposePlaceChanges,
  proposeWeekChanges,
  proposeWeekEaseChanges,
} from './proposeChanges.js';
import { getWeek } from './getWeek.js';
import { hold, offerWeek } from './review.js';

export const TOOLS = [findItems, getItem, getDay, recall, webSearch, proposeChanges];

// The week's tools (the weekly review): offered only where the person's week
// is known, which is today's thread when the app sent it (surfaces.js).
export const WEEK_TOOLS = [getWeek, hold, offerWeek];

const BY_NAME = new Map([...TOOLS, ...WEEK_TOOLS].map((t) => [t.name, t]));

// A surface's own version of a tool, under the same name: on today's thread
// propose_changes can also change the plan on screen and today's set times,
// and the week's own changes when the thread sent the person's week. For an
// app build that said which habits are paused or on a lighter version, it can
// change that too, on today's thread and in chat.
const FOR_SURFACE = {
  brief: { propose_changes: proposeDayChanges },
  brief_week: { propose_changes: proposeWeekChanges },
  brief_week_ease: { propose_changes: proposeWeekEaseChanges },
  chat_ease: { propose_changes: proposeEaseChanges },
  // an app build that can apply changes to Worlds and Chapters (Worlds rebuild, stage 2)
  chat_places: { propose_changes: proposePlaceChanges },
  chat_ease_places: { propose_changes: proposeEasePlaceChanges },
};

function toolNamed(name, surface) {
  return FOR_SURFACE[surface]?.[name] || BY_NAME.get(name);
}

/** The tools a surface offers, by name; every tool when no list is given. */
export function toolsFor(names, surface) {
  if (!names) return TOOLS.map((t) => toolNamed(t.name, surface));
  return names.map((n) => toolNamed(n, surface)).filter(Boolean);
}

/** What a model is told about each tool: name, description and parameters. */
export function toolDeclarations(tools = TOOLS) {
  return tools.map(({ name, description, parameters }) => ({ name, description, parameters }));
}

/** Whether a tool only tells the app something about the reply (hold, offer_week). */
export function isSignal(name) {
  return BY_NAME.get(name)?.signal === true;
}

/** The context every tool runs with, for one turn. */
export function toolContext(
  env,
  { userId, today, timezone, day = null, week = null, noteKinds = false },
) {
  return {
    env,
    userId,
    today,
    timezone: timezone || 'UTC',
    db: db(env),
    cache: new Map(),
    day,
    week,
    // the app build can write a note's kind (the request's noteKinds)
    noteKinds: noteKinds === true,
  };
}

/**
 * Run one tool call. Never throws: a tool that fails hands the model plain
 * words saying so, and the turn carries on.
 * @returns {Promise<{name: string, ok: boolean, text: string, result?: any, ms: number}>}
 */
export async function runTool(ctx, name, input) {
  const t0 = Date.now();
  const tool = toolNamed(name, ctx?.surface);
  if (!tool) return { name, ok: false, text: `There is no tool called ${name}.`, ms: 0 };
  try {
    const result = await withAiStep(`tool_${name}`, () => tool.run(ctx, input || {}));
    return { name, ok: true, result, text: tool.render(result, ctx), ms: Date.now() - t0 };
  } catch (err) {
    console.warn(`[agent] tool ${name} failed`, String(err?.message || err).slice(0, 200));
    return {
      name,
      ok: false,
      text: `${name} did not work just now, so its answer is unknown. Carry on without it and do not guess what it would have said.`,
      ms: Date.now() - t0,
    };
  }
}
