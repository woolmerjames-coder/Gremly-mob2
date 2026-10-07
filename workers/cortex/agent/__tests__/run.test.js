/**
 * @jest-environment node
 */
// The agent's loop (workers/cortex/agent/run.js): tools run and their words go
// back, the card is the last one proposed, the task list carries, the step cap
// and time budget always end in a reply, and a failing model falls back once.

import { runAgent } from '../run.js';
import { SURFACES } from '../surfaces.js';
import { aiContext } from '../../../shared/aiUsage.js';
import { configureModels } from '../../models.js';

const ctx = {
  env: { GOOGLE_API_KEY: 'g', OPENAI_API_KEY: 'o' },
  userId: 'u1',
  today: '2026-10-02',
  timezone: 'America/Los_Angeles',
};

/** A model that answers from a script, one entry per call, and records what it was sent. */
function scripted(...replies) {
  const seen = [];
  const callModel = async (args) => {
    seen.push(JSON.parse(JSON.stringify({ ...args, keys: undefined })));
    const next = replies.shift();
    if (!next) throw new Error('script ran out');
    return typeof next === 'function' ? next(args) : next;
  };
  return { callModel, seen };
}

const reply = (text) => ({ ok: true, provider: 'google', text, calls: [], raw: [{ text }] });
const ask = (...calls) => ({
  ok: true,
  provider: 'google',
  text: '',
  calls: calls.map(([name, args], i) => ({ id: `g${i + 1}`, nativeId: null, name, args })),
  raw: calls.map(([name, args]) => ({ functionCall: { name, args }, thoughtSignature: 'sig' })),
});

function tools(answers = {}) {
  const ran = [];
  const runTool = async (_ctx, name, args) => {
    ran.push([name, args]);
    const a = answers[name];
    return typeof a === 'function'
      ? a(args)
      : a || { ok: true, text: `${name} answered`, result: {} };
  };
  return { runTool, ran };
}

beforeEach(() => configureModels({}));

describe('a turn', () => {
  it('replies straight away when no tool is needed', async () => {
    const m = scripted(reply('Morning! Nothing to change.'));
    const r = await runAgent({
      surface: 'chat',
      persona: 'PERSONA',
      message: 'hi',
      ctx,
      deps: { callModel: m.callModel },
    });
    expect(r).toMatchObject({
      ok: true,
      reply: 'Morning! Nothing to change.',
      stopped: 'answer',
      card: [],
      model: 'gemini-3.8-flash',
    });
    expect(m.seen[0].system).toContain('PERSONA');
    expect(m.seen[0].system).toContain('YOUR JOB HERE');
    // the instructions are the same for every message (cached); the date rides with the message
    expect(m.seen[0].system).not.toContain('Today is');
    const last = m.seen[0].turns.at(-1).text;
    expect(last).toContain('Today is Friday 2 October 2026');
    expect(last.endsWith('THEIR MESSAGE\nhi')).toBe(true);
    expect(m.seen[0].tools.map((t) => t.name)).toEqual([
      'find_items',
      'get_item',
      'get_day',
      'recall',
      'web_search',
      'propose_changes',
      'track_tasks',
    ]);
  });

  it('runs the tools asked for, says what it is doing, and hands their words back', async () => {
    const m = scripted(
      ask(['find_items', { query: 'dentist' }], ['get_day', {}]),
      reply('Your dentist is at 10.'),
    );
    const t = tools({ find_items: { ok: true, text: 'Dentist id t1' } });
    const lines = [];
    const r = await runAgent({
      surface: 'chat',
      persona: 'P',
      message: 'when is the dentist',
      ctx,
      onStatus: (l) => lines.push(l),
      deps: { callModel: m.callModel, runTool: t.runTool },
    });
    expect(r.reply).toBe('Your dentist is at 10.');
    expect(t.ran).toEqual([
      ['find_items', { query: 'dentist' }],
      ['get_day', {}],
    ]);
    expect(lines).toEqual(['Looking through your things', 'Looking at your day']);
    const second = m.seen[1].turns;
    expect(second[1]).toMatchObject({
      role: 'assistant',
      provider: 'google',
      raw: [{ thoughtSignature: 'sig' }, { thoughtSignature: 'sig' }],
    });
    expect(second[2]).toEqual({
      role: 'tool',
      results: [
        { id: 'g1', nativeId: null, name: 'find_items', text: 'Dentist id t1' },
        { id: 'g2', nativeId: null, name: 'get_day', text: 'get_day answered' },
      ],
    });
    expect(r.steps.map((s) => s.kind)).toEqual(['model', 'tool', 'tool', 'model']);
  });

  it('keeps the last card proposed, numbered for the person', async () => {
    const m = scripted(
      ask(['propose_changes', { changes: [1] }]),
      ask(['propose_changes', { changes: [1, 2] }]),
      reply('Shall I move both?'),
    );
    const t = tools({
      propose_changes: (args) => ({
        ok: true,
        text: 'on the card',
        result: {
          changes: args.changes.map((n) => ({ cid: `c${n * 10}`, op: 'change', id: `t${n}` })),
        },
      }),
    });
    const r = await runAgent({
      surface: 'brief',
      persona: 'P',
      message: 'move them',
      ctx,
      deps: { callModel: m.callModel, runTool: t.runTool },
    });
    expect(r.card).toEqual([
      { cid: 'c1', op: 'change', id: 't1' },
      { cid: 'c2', op: 'change', id: 't2' },
    ]);
  });

  it('keeps the task list the model gives it, and starts the next turn from it', async () => {
    const m = scripted(
      ask([
        'track_tasks',
        {
          tasks: [
            { ask: 'Move the dentist', status: 'proposed' },
            { ask: 'Book a haircut', status: 'needs_answer' },
            { ask: '', status: 'open' },
          ],
        },
      ]),
      reply('Which day suits for the haircut?'),
    );
    const r = await runAgent({
      surface: 'chat',
      persona: 'P',
      message: 'move the dentist and book a haircut',
      ctx,
      tasks: [{ ask: 'Call Mum', status: 'done' }],
      deps: { callModel: m.callModel, runTool: tools().runTool },
    });
    expect(m.seen[0].turns.at(-1).text).toContain('THE TASK LIST SO FAR');
    expect(m.seen[0].turns.at(-1).text).toContain('- Call Mum (done)');
    expect(m.seen[0].system).not.toContain('THE TASK LIST SO FAR');
    expect(r.tasks).toEqual([
      { ask: 'Move the dentist', status: 'proposed' },
      { ask: 'Book a haircut', status: 'needs_answer' },
    ]);
    expect(m.seen[1].turns[2].results[0].text).toBe('Kept. 2 asks on the list, 2 still in hand.');
  });

  it('at the step cap asks once more with no tools, so there is always a reply', async () => {
    const cap = SURFACES.brief.stepCap;
    const loops = Array.from({ length: cap }, () => ask(['find_items', { query: 'x' }]));
    const m = scripted(...loops, (args) => {
      expect(args.final).toBe(true);
      expect(args.system).toContain('This is the last step for this message');
      return { ...ask(['find_items', {}]), text: 'Here is what I found.' };
    });
    const r = await runAgent({
      surface: 'brief',
      persona: 'P',
      message: 'x',
      ctx,
      deps: { callModel: m.callModel, runTool: tools().runTool },
    });
    expect(r).toMatchObject({ ok: true, reply: 'Here is what I found.', stopped: 'cap' });
    expect(m.seen).toHaveLength(cap + 1);
  });

  const onCard = (dropped = []) => ({
    propose_changes: (args) => ({
      ok: true,
      text: dropped.length ? 'some dropped' : 'on the card',
      result: {
        changes: args.changes.map((n) => ({ cid: `c${n}`, op: 'change', id: `t${n}` })),
        dropped,
      },
    }),
  });

  it('ends the turn with a reply written alongside its card, when every change made the card', async () => {
    const m = scripted({
      ...ask(
        ['propose_changes', { changes: [1] }],
        ['track_tasks', { tasks: [{ ask: 'Move it', status: 'proposed' }] }],
      ),
      text: "I'd move it to Monday.",
    });
    const r = await runAgent({
      surface: 'brief',
      persona: 'P',
      message: 'move it to Monday',
      ctx,
      deps: { callModel: m.callModel, runTool: tools(onCard()).runTool },
    });
    expect(r).toMatchObject({
      ok: true,
      reply: "I'd move it to Monday.",
      stopped: 'answer',
      tasks: [{ ask: 'Move it', status: 'proposed' }],
    });
    expect(r.card).toEqual([{ cid: 'c1', op: 'change', id: 't1' }]);
    // one model call for the whole message
    expect(m.seen).toHaveLength(1);
  });

  it('takes the reply and the task list from the card itself, in one step', async () => {
    const m = scripted(
      ask([
        'propose_changes',
        {
          changes: [1],
          reply: "I'd move it to Monday.",
          tasks: [{ ask: 'Move it', status: 'proposed' }],
        },
      ]),
    );
    const r = await runAgent({
      surface: 'brief',
      persona: 'P',
      message: 'move it to Monday',
      ctx,
      deps: { callModel: m.callModel, runTool: tools(onCard()).runTool },
    });
    expect(r).toMatchObject({
      ok: true,
      reply: "I'd move it to Monday.",
      stopped: 'answer',
      tasks: [{ ask: 'Move it', status: 'proposed' }],
    });
    expect(m.seen).toHaveLength(1);
    expect(
      m.seen[0].tools.find((d) => d.name === 'propose_changes').parameters.properties,
    ).toHaveProperty('reply');
  });

  it('takes another step when a change was dropped, so it can be put right', async () => {
    const m = scripted(
      { ...ask(['propose_changes', { changes: [1] }]), text: "I'd add it." },
      (args) => {
        expect(JSON.stringify(args.turns)).toContain('some dropped');
        return { ...ask(['propose_changes', { changes: [2] }]), text: "I'd add it on Thursday." };
      },
    );
    let first = true;
    const t = tools({
      propose_changes: (args) => {
        const out = onCard(first ? [{ cid: 'c1', reason: 'unknown_type' }] : []).propose_changes(
          args,
        );
        first = false;
        return out;
      },
    });
    const r = await runAgent({
      surface: 'brief',
      persona: 'P',
      message: 'add the dentist on Thursday at 10',
      ctx,
      deps: { callModel: m.callModel, runTool: t.runTool },
    });
    expect(r).toMatchObject({ ok: true, reply: "I'd add it on Thursday.", stopped: 'answer' });
    expect(m.seen).toHaveLength(2);
  });

  it("notes on each step's usage row what the step before got back and what this one asked for", async () => {
    const m = scripted(ask(['find_items', { query: 'x' }]), reply('Found it.'));
    const notes = [];
    await aiContext.run({ env: {}, worker: 'cortex', job: 'brief-turn' }, () =>
      runAgent({
        surface: 'brief',
        persona: 'P',
        message: 'x',
        ctx,
        deps: {
          callModel: async (args) => {
            notes.push(aiContext.getStore()?.note);
            return m.callModel(args);
          },
          runTool: tools().runTool,
        },
      }),
    );
    const settled = await Promise.all(notes);
    expect(settled).toEqual([
      { agent_step: 1, final: false, got: [], asked: ['find_items'], replied: false },
      {
        agent_step: 2,
        final: false,
        got: [{ name: 'find_items', ok: true }],
        asked: [],
        replied: true,
      },
    ]);
  });

  it('sends the cache key it is given with every step', async () => {
    const m = scripted(ask(['find_items', { query: 'x' }]), reply('ok'));
    await runAgent({
      surface: 'brief',
      persona: 'P',
      message: 'x',
      ctx,
      cacheKey: 'gremly-brief-abc',
      deps: { callModel: m.callModel, runTool: tools().runTool },
    });
    expect(m.seen.map((a) => a.cacheKey)).toEqual(['gremly-brief-abc', 'gremly-brief-abc']);
  });

  it('stops at the time budget the same way', async () => {
    let t = 0;
    const m = scripted(ask(['get_day', {}]), (args) => {
      expect(args.final).toBe(true);
      return reply('Out of time, but here it is.');
    });
    const r = await runAgent({
      surface: 'brief',
      persona: 'P',
      message: 'x',
      ctx,
      deps: { callModel: m.callModel, runTool: tools().runTool, now: () => (t += 7000) },
    });
    expect(r).toMatchObject({ ok: true, stopped: 'cap' });
  });

  it('tries the fallback model once when the first step fails', async () => {
    const m = scripted({ ok: false, error: 'overloaded' }, reply('From the fallback.'));
    const r = await runAgent({
      surface: 'chat',
      persona: 'P',
      message: 'hi',
      ctx,
      deps: { callModel: m.callModel },
    });
    expect(r).toMatchObject({ ok: true, reply: 'From the fallback.', model: 'gpt-6-luna' });
    expect(m.seen.map((s) => s.model)).toEqual(['gemini-3.8-flash', 'gpt-6-luna']);
  });

  it('hands back what it did when a later step fails, for the surface to fall back on', async () => {
    const m = scripted(ask(['find_items', {}]), { ok: false, error: 'down' });
    const r = await runAgent({
      surface: 'chat',
      persona: 'P',
      message: 'x',
      ctx,
      deps: { callModel: m.callModel, runTool: tools().runTool },
    });
    expect(r).toMatchObject({ ok: false, reply: null, stopped: 'error', error: 'down' });
    expect(r.steps.map((s) => s.kind)).toEqual(['model', 'tool', 'model']);
  });

  it('does not run a tool the surface does not offer', async () => {
    const m = scripted(ask(['send_email', { to: 'sam' }]), reply('Sorry, not here.'));
    const t = tools();
    const r = await runAgent({
      surface: 'brief',
      persona: 'P',
      message: 'email Sam',
      ctx,
      deps: { callModel: m.callModel, runTool: t.runTool },
    });
    expect(t.ran).toEqual([]);
    expect(m.seen[1].turns[2].results[0].text).toBe('send_email is not available here.');
    expect(r.reply).toBe('Sorry, not here.');
  });

  it('shows a first status line at once, before the first step', async () => {
    const m = scripted(reply('Morning.'));
    const lines = [];
    await runAgent({
      surface: 'brief',
      persona: 'P',
      message: 'hi',
      ctx,
      firstStatus: 'Looking at your day',
      onStatus: (l) => lines.push(l),
      deps: { callModel: m.callModel },
    });
    expect(lines).toEqual(['Looking at your day']);
  });

  it('takes a reply that comes with only its task list as the answer, with no extra step', async () => {
    const m = scripted({
      ...ask([
        'track_tasks',
        { tasks: [{ ask: 'Plan around the flight', status: 'needs_answer' }] },
      ]),
      text: 'What time do you need to leave?',
    });
    const r = await runAgent({
      surface: 'brief',
      persona: 'P',
      message: 'we fly today',
      ctx,
      deps: { callModel: m.callModel, runTool: tools().runTool },
    });
    expect(r).toMatchObject({
      ok: true,
      reply: 'What time do you need to leave?',
      stopped: 'answer',
    });
    expect(r.tasks).toEqual([{ ask: 'Plan around the flight', status: 'needs_answer' }]);
    expect(m.seen).toHaveLength(1);
  });

  it("offers the brief's own propose_changes, and runs tools with the surface on their context", async () => {
    const m = scripted(ask(['propose_changes', { changes: [] }]), reply('ok'));
    const seenCtx = [];
    const t = tools();
    const runTool = async (c, name, args) => {
      seenCtx.push(c.surface);
      return t.runTool(c, name, args);
    };
    await runAgent({
      surface: 'brief',
      persona: 'P',
      message: 'x',
      ctx,
      deps: { callModel: m.callModel, runTool },
    });
    const decl = m.seen[0].tools.find((d) => d.name === 'propose_changes');
    expect(decl.description).toContain("today's set times");
    expect(decl.parameters.properties.changes.items.properties.plan).toBeTruthy();
    expect(seenCtx).toEqual(['brief']);
    const chat = scripted(reply('ok'));
    await runAgent({
      surface: 'chat',
      persona: 'P',
      message: 'x',
      ctx,
      deps: { callModel: chat.callModel },
    });
    const chatDecl = chat.seen[0].tools.find((d) => d.name === 'propose_changes');
    expect(chatDecl.parameters.properties.changes.items.properties.plan).toBeUndefined();
  });

  it('uses the model set for a surface', async () => {
    configureModels({ AGENT_MODEL_BRIEF: 'gpt-6-luna' });
    const m = scripted(reply('ok'));
    const r = await runAgent({
      surface: 'brief',
      persona: 'P',
      message: 'x',
      ctx,
      deps: { callModel: m.callModel },
    });
    expect(r.model).toBe('gpt-6-luna');
  });
});

// ── The brief's week variant, and the tools that only tell the app something ─

describe("the brief's week variant", () => {
  const withText = (text, ...calls) => ({ ...ask(...calls), text });
  const signal = (s, extra = {}) => ({ ok: true, text: 'noted', result: { signal: s, ...extra } });
  const run = (m, t, extra = {}) =>
    runAgent({
      surface: 'brief',
      variant: 'week',
      persona: 'P',
      message: 'x',
      ctx,
      deps: { callModel: m.callModel, runTool: t.runTool },
      ...extra,
    });

  it("adds the week's tools and its own propose_changes, on the brief's model", async () => {
    configureModels({ AGENT_MODEL_BRIEF: 'gpt-6-luna' });
    const m = scripted(ask(['propose_changes', { changes: [] }]), reply('ok'));
    const seenCtx = [];
    const t = tools();
    const r = await run(m, {
      runTool: async (c, name, args) => {
        seenCtx.push(c.surface);
        return t.runTool(c, name, args);
      },
    });
    expect(m.seen[0].tools.map((d) => d.name)).toEqual([
      'get_day',
      'find_items',
      'get_item',
      'recall',
      'web_search',
      'propose_changes',
      'get_week',
      'hold',
      'offer_week',
      'track_tasks',
    ]);
    const decl = m.seen[0].tools.find((d) => d.name === 'propose_changes');
    expect(decl.description).toContain('Their week changes too');
    expect(decl.parameters.properties.changes.items.properties.back_on).toBeTruthy();
    expect(m.seen[0].system).toContain(SURFACES.brief.job);
    expect(m.seen[0].system).toContain(SURFACES.brief.variants.week.job);
    expect(seenCtx).toEqual(['brief_week']);
    expect(r.model).toBe('gpt-6-luna');
    expect(r).toMatchObject({ hold: null, offer: null });
  });

  it('is the brief as it is when no variant is asked for', async () => {
    const m = scripted(reply('ok'));
    await runAgent({
      surface: 'brief',
      persona: 'P',
      message: 'x',
      ctx,
      deps: { callModel: m.callModel },
    });
    expect(m.seen[0].tools.map((d) => d.name)).not.toContain('get_week');
    expect(m.seen[0].system).not.toContain(SURFACES.brief.variants.week.job);
  });

  it('a reply written with a hold is the answer: the review waits, and no step is spent', async () => {
    const m = scripted(
      withText('How many hours do you have?', [
        'hold',
        { question: 'How many hours do you have?' },
      ]),
    );
    const t = tools({ hold: signal({ hold: { question: 'How many hours do you have?' } }) });
    const r = await run(m, t);
    expect(r).toMatchObject({
      ok: true,
      reply: 'How many hours do you have?',
      stopped: 'answer',
      hold: { question: 'How many hours do you have?' },
      offer: null,
    });
    expect(m.seen).toHaveLength(1);
    expect(t.ran).toEqual([['hold', { question: 'How many hours do you have?' }]]);
  });

  it("a reply written with the week's button and a card arrives in one step", async () => {
    const m = scripted(
      withText('Here is your week.', ['offer_week', {}], ['propose_changes', { changes: [{}] }]),
    );
    const t = tools({
      offer_week: signal({ offer: { kind: 'week', done: true } }),
      propose_changes: {
        ok: true,
        text: 'on the card',
        result: { changes: [{ op: 'weekly_day' }], dropped: [] },
      },
    });
    const r = await run(m, t);
    expect(r).toMatchObject({
      reply: 'Here is your week.',
      offer: { kind: 'week', done: true },
      hold: null,
      card: [{ cid: 'c1', op: 'weekly_day' }],
    });
    expect(m.seen).toHaveLength(1);
  });

  it('takes another step when the signal has more for the model to act on', async () => {
    const m = scripted(
      withText('Here you go.', ['offer_week', {}]),
      reply('No other review today.'),
    );
    const t = tools({
      offer_week: signal({ offer: { kind: 'week', done: true } }, { more: true }),
    });
    const r = await run(m, t);
    expect(m.seen).toHaveLength(2);
    expect(m.seen[1].turns.at(-1)).toMatchObject({
      role: 'tool',
      results: [{ name: 'offer_week', text: 'noted' }],
    });
    // the button still goes under the reply the model ends on
    expect(r).toMatchObject({
      reply: 'No other review today.',
      offer: { kind: 'week', done: true },
    });
  });

  it('takes another step when a signal did not take, and tells the app nothing', async () => {
    const m = scripted(
      withText('Which day?', ['hold', { question: 'Which day?' }]),
      reply('Which day?'),
    );
    const t = tools({ hold: signal(null) });
    const r = await run(m, t);
    expect(m.seen).toHaveLength(2);
    expect(r).toMatchObject({ reply: 'Which day?', hold: null });
  });

  it('a signal with no reply yet is not an answer: the model is asked again', async () => {
    const m = scripted(ask(['hold', { question: 'Which day?' }]), reply('Which day works?'));
    const t = tools({ hold: signal({ hold: { question: 'Which day?' } }) });
    const r = await run(m, t);
    expect(m.seen).toHaveLength(2);
    expect(r).toMatchObject({ reply: 'Which day works?', hold: { question: 'Which day?' } });
  });

  it('does not offer the signals on a surface without the variant', async () => {
    const m = scripted(withText('ok', ['hold', { question: 'x?' }]), reply('ok'));
    const t = tools();
    const r = await runAgent({
      surface: 'brief',
      persona: 'P',
      message: 'x',
      ctx,
      deps: { callModel: m.callModel, runTool: t.runTool },
    });
    expect(t.ran).toEqual([]);
    expect(m.seen[1].turns.at(-1).results[0].text).toBe('hold is not available here.');
    expect(r.hold).toBeNull();
  });
});
