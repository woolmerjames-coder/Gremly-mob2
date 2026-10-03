/**
 * @jest-environment node
 */
// The agent's loop (workers/cortex/agent/run.js): tools run and their words go
// back, the card is the last one proposed, the task list carries, the step cap
// and time budget always end in a reply, and a failing model falls back once.

import { runAgent } from '../run.js';
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
    expect(m.seen[0].system).toContain('Today is Friday 2 October 2026');
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
    expect(m.seen[0].system).toContain('THE TASK LIST SO FAR');
    expect(m.seen[0].system).toContain('- Call Mum (done)');
    expect(r.tasks).toEqual([
      { ask: 'Move the dentist', status: 'proposed' },
      { ask: 'Book a haircut', status: 'needs_answer' },
    ]);
    expect(m.seen[1].turns[2].results[0].text).toBe('Kept. 2 asks on the list, 2 still in hand.');
  });

  it('at the step cap asks once more with no tools, so there is always a reply', async () => {
    const loops = Array.from({ length: 4 }, () => ask(['find_items', { query: 'x' }]));
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
    expect(m.seen).toHaveLength(5);
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
