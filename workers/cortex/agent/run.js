// ============================================================================
// run.js: the agent's loop, the one core every surface uses (step 5 of the
// agent plan, "Gremly agent: what exists and what it costs").
//
// One turn: the model reads the surface's job, Gremly's persona and what the
// surface already knows, the conversation and the person's message, and the
// tools it may use. It either replies, or asks for tools; the loop runs them,
// hands back their words, and asks again, until it replies, reaches the
// surface's step cap or its time budget. At the cap the model is asked once
// more with no tools, so it always replies with what it has.
//
// What comes back: the reply, the card (the last propose_changes, checked by
// the change model; nothing is applied until the person taps), the task list,
// and every step with its time. Status lines go out as each tool runs.
//
// It never throws. A model that fails on the first step is tried once on the
// fallback model; a failure after that returns ok: false with what was done,
// and the surface falls back to its old path.
// ============================================================================

import { withAiStep } from '../../shared/aiUsage.js';
import { models } from '../models.js';
import { callModel as defaultCallModel } from './providers.js';
import { buildSystem, FINAL_NOTE } from './prompt.js';
import { statusFor } from './status.js';
import { surfaceOf } from './surfaces.js';
import { normalizeTasks, tasksReceipt, trackTasks } from './tasks.js';
import { runTool as defaultRunTool, toolDeclarations, toolsFor } from './tools/index.js';

/** The model and its fallback for a surface (models.js agent, AGENT_MODEL_<SURFACE>). */
export function agentModelsFor(surface) {
  const a = models().agent;
  return { model: a.bySurface?.[surface] || a.model, fallback: a.fallback };
}

/** The card as the person will see it: rows numbered c1, c2, … */
function numbered(changes) {
  return (changes || []).map((c, i) => ({ ...c, cid: `c${i + 1}` }));
}

/**
 * Run one turn of the agent.
 * @param {object} p
 * @param {string} p.surface 'brief' | 'chat' (surfaces.js)
 * @param {string} p.persona the surface's persona, care rules and preloaded context
 * @param {{role: 'user'|'assistant', content: string}[]} [p.history] the conversation before this message
 * @param {string} p.message what the person just said
 * @param {object} p.ctx the tools' context (tools/index.js toolContext): env, userId, today, timezone, db
 * @param {number} [p.nowMin] minutes after midnight where they are
 * @param {{ask: string, status: string}[]} [p.tasks] the task list so far
 * @param {(line: string) => void} [p.onStatus] called with each status line
 * @param {{model?: string, fallback?: string}} [p.models] overrides, for replays
 * @param {object} [p.deps] { callModel, runTool, now } for tests and replays
 */
export async function runAgent(p) {
  const deps = p.deps || {};
  const callModel = deps.callModel || defaultCallModel;
  const runTool = deps.runTool || defaultRunTool;
  const now = deps.now || (() => Date.now());
  const surface = surfaceOf(p.surface);
  if (!surface)
    return {
      ok: false,
      error: `no surface ${p.surface}`,
      reply: null,
      card: [],
      tasks: p.tasks || [],
      steps: [],
    };

  const chosen = { ...agentModelsFor(p.surface), ...(p.models || {}) };
  const keys = {
    google: p.ctx?.env?.GOOGLE_API_KEY || p.ctx?.env?.GEMINI_API_KEY,
    openai: p.ctx?.env?.OPENAI_API_KEY,
  };
  const decls = [...toolDeclarations(toolsFor(surface.tools)), toolDeclarations([trackTasks])[0]];
  let tasks = normalizeTasks(p.tasks);
  const system = buildSystem(surface, {
    persona: p.persona,
    today: p.ctx.today,
    nowMin: p.nowMin,
    tasks,
  });
  const turns = [
    ...(p.history || [])
      .filter((h) => h && typeof h.content === 'string' && h.content.trim())
      .map((h) => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        text: h.content,
        provider: null,
      })),
    { role: 'user', text: p.message },
  ];

  const started = now();
  const steps = [];
  let card = [];
  let model = chosen.model;
  let lastStatus = null;
  const status = (line) => {
    if (!line || line === lastStatus) return;
    lastStatus = line;
    try {
      p.onStatus?.(line);
    } catch {
      // a status line never stops the turn
    }
  };
  const done = (extra) => ({
    card: numbered(card),
    tasks,
    steps,
    model,
    ms: now() - started,
    ...extra,
  });

  for (let step = 1; ; step++) {
    const final = step > surface.stepCap || now() - started > surface.maxMs;
    const t0 = now();
    // the last step is told so, so it never blames Gremly for steps it ran out of
    const sys = final && step > 1 ? `${system}\n\n${FINAL_NOTE}` : system;
    let res = await withAiStep('agent', () =>
      callModel({ model, system: sys, turns, tools: decls, final, keys }),
    );
    if (!res.ok && step === 1 && chosen.fallback && chosen.fallback !== model) {
      steps.push({ kind: 'model', model, ms: now() - t0, ok: false, error: res.error });
      model = chosen.fallback;
      res = await withAiStep('agent', () =>
        callModel({ model, system: sys, turns, tools: decls, final, keys }),
      );
    }
    steps.push({
      kind: 'model',
      model,
      ms: now() - t0,
      ok: res.ok,
      ...(res.ok ? {} : { error: res.error }),
    });
    if (!res.ok) return done({ ok: false, error: res.error, reply: null, stopped: 'error' });

    const calls = final ? [] : res.calls || [];
    if (!calls.length) {
      const reply = String(res.text || '').trim();
      if (!reply) return done({ ok: false, error: 'empty reply', reply: null, stopped: 'error' });
      return done({ ok: true, reply, stopped: final ? 'cap' : 'answer' });
    }

    turns.push({
      role: 'assistant',
      text: res.text || '',
      calls,
      raw: res.raw,
      provider: res.provider,
    });
    const results = await Promise.all(
      calls.map(async (call) => {
        const t1 = now();
        if (call.name === trackTasks.name) {
          tasks = normalizeTasks(call.args?.tasks);
          steps.push({ kind: 'tool', name: call.name, ms: 0, ok: true });
          return {
            id: call.id,
            nativeId: call.nativeId,
            name: call.name,
            text: tasksReceipt(tasks),
          };
        }
        status(statusFor(call.name, call.args, p.ctx));
        const allowed = surface.tools.includes(call.name);
        const r = allowed
          ? await runTool(p.ctx, call.name, call.args)
          : { ok: false, text: `${call.name} is not available here.` };
        if (call.name === 'propose_changes' && r.ok) card = r.result?.changes || [];
        steps.push({ kind: 'tool', name: call.name, ms: now() - t1, ok: !!r.ok });
        return { id: call.id, nativeId: call.nativeId, name: call.name, text: r.text };
      }),
    );
    turns.push({ role: 'tool', results });
  }
}
