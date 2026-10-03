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
// (db is workers/shared/db.js). Built per turn with toolContext.
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
import { proposeChanges } from './proposeChanges.js';

export const TOOLS = [findItems, getItem, getDay, recall, webSearch, proposeChanges];
const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** The tools a surface offers, by name; every tool when no list is given. */
export function toolsFor(names) {
  if (!names) return TOOLS;
  return names.map((n) => BY_NAME.get(n)).filter(Boolean);
}

/** What a model is told about each tool: name, description and parameters. */
export function toolDeclarations(tools = TOOLS) {
  return tools.map(({ name, description, parameters }) => ({ name, description, parameters }));
}

/** The context every tool runs with, for one turn. */
export function toolContext(env, { userId, today, timezone }) {
  return { env, userId, today, timezone: timezone || 'UTC', db: db(env), cache: new Map() };
}

/**
 * Run one tool call. Never throws: a tool that fails hands the model plain
 * words saying so, and the turn carries on.
 * @returns {Promise<{name: string, ok: boolean, text: string, result?: any, ms: number}>}
 */
export async function runTool(ctx, name, input) {
  const t0 = Date.now();
  const tool = BY_NAME.get(name);
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
