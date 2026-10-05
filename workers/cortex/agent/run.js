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

import { withAiNote, withAiStep } from '../../shared/aiUsage.js';
import { models } from '../models.js';
import { callModel as defaultCallModel } from './providers.js';
import { buildSystem, FINAL_NOTE, messageWithContext } from './prompt.js';
import { statusFor } from './status.js';
import { surfaceOf } from './surfaces.js';
import { normalizeTasks, tasksReceipt, trackTasks } from './tasks.js';
import { runTool as defaultRunTool, toolDeclarations, toolsFor } from './tools/index.js';

/** The model and its fallback for a surface (models.js agent, AGENT_MODEL_<SURFACE>). */
export function agentModelsFor(surface) {
  const a = models().agent;
  return {
    model: a.bySurface?.[surface] || a.model,
    fallback: a.fallback,
    thinking: a.thinkingBySurface?.[surface] || undefined,
  };
}

/** The card as the person will see it: rows numbered c1, c2, … */
function numbered(changes) {
  return (changes || []).map((c, i) => ({ ...c, cid: `c${i + 1}` }));
}

/**
 * Run one turn of the agent.
 * @param {object} p
 * @param {string} p.surface 'brief' | 'chat' (surfaces.js)
 * @param {string} p.persona the surface's persona and care rules, the same from one message to the next
 * @param {string} [p.context] what the surface knows that changes between messages, placed last
 * @param {string} [p.cacheKey] groups one person's turns on this surface for the provider's prompt cache
 * @param {{role: 'user'|'assistant', content: string}[]} [p.history] the conversation before this message
 * @param {string} p.message what the person just said
 * @param {object} p.ctx the tools' context (tools/index.js toolContext): env, userId, today, timezone, db
 * @param {number} [p.nowMin] minutes after midnight where they are
 * @param {number} [p.dayEndHour] the hour their day ends, so the small hours read as the end of their day
 * @param {{ask: string, status: string}[]} [p.tasks] the task list so far
 * @param {(line: string) => void} [p.onStatus] called with each status line
 * @param {string} [p.firstStatus] a line to show at once, before the first step
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
  const decls = [
    ...toolDeclarations(toolsFor(surface.tools, surface.name)),
    toolDeclarations([trackTasks])[0],
  ];
  // the tools run with the surface's own versions (tools/index.js)
  const ctx = { ...p.ctx, surface: surface.name };
  let tasks = normalizeTasks(p.tasks);
  // the same for every message, so it is cached; what changes rides with the message
  const system = buildSystem(surface, { persona: p.persona });
  const turns = [
    ...(p.history || [])
      .filter((h) => h && typeof h.content === 'string' && h.content.trim())
      .map((h) => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        text: h.content,
        provider: null,
      })),
    {
      role: 'user',
      text: messageWithContext({
        message: p.message,
        today: p.ctx.today,
        nowMin: p.nowMin,
        dayEndHour: p.dayEndHour,
        tasks,
        context: p.context,
      }),
    },
  ];

  const started = now();
  const steps = [];
  let card = [];
  // what the last step's tools said, in short, for the next step's usage row
  let lastResults = [];
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

  status(p.firstStatus);

  for (let step = 1; ; step++) {
    const final = step > surface.stepCap || now() - started > surface.maxMs;
    const t0 = now();
    // the last step is told so, so it never blames Gremly for steps it ran out of
    const sys = final && step > 1 ? `${system}\n\n${FINAL_NOTE}` : system;
    // each step's usage row says what the step before it got back and what
    // this step asked for, so a turn can be read afterwards from the log
    const ask = () => {
      let settle;
      const note = new Promise((resolve) => {
        settle = resolve;
      });
      const call = withAiStep('agent', () =>
        withAiNote(note, () =>
          callModel({
            model,
            system: sys,
            turns,
            tools: decls,
            final,
            keys,
            cacheKey: p.cacheKey,
            thinking: chosen.thinking,
          }),
        ),
      );
      return call.then(
        (r) => {
          settle({
            agent_step: step,
            final,
            got: lastResults,
            asked: (r?.calls || []).map((c) => c.name),
            replied: !!String(r?.text || '').trim(),
          });
          return r;
        },
        (err) => {
          settle(null);
          throw err;
        },
      );
    };
    let res = await ask();
    if (!res.ok && step === 1 && chosen.fallback && chosen.fallback !== model) {
      steps.push({ kind: 'model', model, ms: now() - t0, ok: false, error: res.error });
      model = chosen.fallback;
      res = await ask();
    }
    steps.push({
      kind: 'model',
      model,
      ms: now() - t0,
      ok: res.ok,
      ...(res.ok ? {} : { error: res.error }),
    });
    if (!res.ok) return done({ ok: false, error: res.error, reply: null, stopped: 'error' });

    let calls = final ? [] : res.calls || [];
    // a reply that comes with nothing but its task list is the answer: keep
    // the list and reply, rather than spending a step to say it again
    if (
      calls.length &&
      String(res.text || '').trim() &&
      calls.every((c) => c.name === trackTasks.name)
    ) {
      for (const c of calls) {
        tasks = normalizeTasks(c.args?.tasks);
        steps.push({ kind: 'tool', name: c.name, ms: 0, ok: true });
      }
      calls = [];
    }
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
    let proposed = null;
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
        status(statusFor(call.name, call.args, ctx));
        const allowed = surface.tools.includes(call.name);
        const r = allowed
          ? await runTool(ctx, call.name, call.args)
          : { ok: false, text: `${call.name} is not available here.` };
        if (call.name === 'propose_changes') {
          proposed = { ...r, reply: call.args?.reply };
          if (r.ok) card = r.result?.changes || [];
          // the task list can travel with the card
          if (Array.isArray(call.args?.tasks)) tasks = normalizeTasks(call.args.tasks);
        }
        steps.push({ kind: 'tool', name: call.name, ms: now() - t1, ok: !!r.ok });
        return {
          id: call.id,
          nativeId: call.nativeId,
          name: call.name,
          text: r.text,
          ok: !!r.ok,
          dropped: (r.result?.dropped || []).map((d) => d.reason),
        };
      }),
    );
    lastResults = results.map((x) => ({
      name: x.name,
      ok: x.ok !== false,
      ...(x.dropped?.length ? { dropped: x.dropped } : {}),
    }));
    // a reply written with its card is the answer when every change made the
    // card: no step is spent saying it again (when one was dropped, the next
    // step sees why and puts it right)
    const replyWithCard = String(res.text || '').trim() || String(proposed?.reply || '').trim();
    if (
      replyWithCard &&
      proposed?.ok &&
      !(proposed.result?.dropped || []).length &&
      calls.every((c) => c.name === 'propose_changes' || c.name === trackTasks.name)
    ) {
      return done({ ok: true, reply: replyWithCard, stopped: 'answer' });
    }
    turns.push({
      role: 'tool',
      results: results.map(({ id, nativeId, name, text }) => ({ id, nativeId, name, text })),
    });
  }
}
