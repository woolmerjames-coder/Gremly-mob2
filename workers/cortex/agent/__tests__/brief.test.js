/**
 * @jest-environment node
 */
// Today's thread on the agent (workers/cortex/agent/brief.js): the day the
// thread sends becomes what the agent knows, with real ids; the agent's card
// can change the plan on screen and today's set times; the day turn answers
// when the agent is off or cannot finish; the route streams status lines.

import { briefPersona, briefTurnResponse, dayFrameOf, renderDay, runBriefTurn } from '../brief.js';
import { readTurnRequest } from '../../../inngest-jobs/brief/dayTurn.js';
import { configureModels } from '../../models.js';

const MUM = '11111111-1111-4111-8111-111111111111';
const PUSHUPS = '22222222-2222-4222-8222-222222222222';
const USER = '0b7c6f0e-1d2a-4c3b-9e8f-112233445566';

const BODY = {
  text: 'I need to call my parents at 12 and then leave for the airport at 12:30',
  question: null,
  history: [
    { role: 'assistant', content: 'Morning. Calls and packing today.' },
    { role: 'user', content: 'yes busy one' },
  ],
  date: '2026-10-02',
  now: 9 * 60 + 4,
  timezone: 'America/Los_Angeles',
  items: [
    {
      id: MUM,
      kind: 'todo',
      title: 'Call Mum',
      due_day: '2026-10-02',
      due_time: null,
      minutes: 20,
      note: 'in the plan',
    },
    {
      id: PUSHUPS,
      kind: 'habit',
      title: 'Pushups',
      due_day: null,
      due_time: null,
      minutes: 10,
      note: 'habit today',
    },
  ],
  meetings: [{ title: 'Team huddle', start: 480, end: 510 }],
  record: { travel: { label: 'Flying to San Diego', departs: null }, blocks: [], plan_end: 1320 },
  plan: {
    status: 'proposal',
    items: [{ id: MUM, kind: 'todo', title: 'Call Mum', start: 710, end: 730 }],
  },
  tasks: [{ ask: 'Pack', status: 'done' }],
};

const reply = (text) => ({ ok: true, provider: 'google', text, calls: [], raw: [{ text }] });
const ask = (...calls) => ({
  ok: true,
  provider: 'google',
  text: '',
  calls: calls.map(([name, args], i) => ({ id: `g${i + 1}`, nativeId: null, name, args })),
  raw: [],
});
function scripted(...replies) {
  const seen = [];
  return {
    seen,
    callModel: async (args) => {
      seen.push(JSON.parse(JSON.stringify({ ...args, keys: undefined })));
      const next = replies.shift();
      if (!next) throw new Error('script ran out');
      return next;
    },
  };
}
const fakeCtx = {
  env: {},
  userId: USER,
  timezone: 'America/Los_Angeles',
  cache: new Map(),
  db: { select: async () => [], rpc: async () => [] },
};

beforeEach(() => configureModels({}));

describe('the day the agent knows', () => {
  const req = readTurnRequest(BODY);

  it('is the day the thread sent, with real ids rather than refs', () => {
    const text = renderDay(req);
    expect(text).toContain('TODAY: Friday 2026-10-02. TIME NOW: 9:04am.');
    expect(text).toContain(
      'TRAVEL TODAY: Flying to San Diego; the time they set off is not known yet.',
    );
    expect(text).toContain(
      `THE PLAN ON SCREEN, A PROPOSAL (id | time | title):\n${MUM} | 11:50am | Call Mum`,
    );
    expect(text).toContain(`${PUSHUPS} | habit | Pushups | no day | - | 10 min | habit today`);
    expect(text).toContain('8am to 8:30am Team huddle');
    expect(text).toContain("GREMLY'S OPEN QUESTION: none");
    expect(text).not.toMatch(/\bi1\b/);
    expect(text).not.toContain('yes busy one');
  });

  it('gives the tools the plan on screen, the set times and the items by id', () => {
    const day = dayFrameOf(req);
    expect(day.plan.items.map((x) => x.id)).toEqual([MUM]);
    expect(day.items.get(PUSHUPS)).toEqual({
      id: PUSHUPS,
      kind: 'habit',
      title: 'Pushups',
      minutes: 10,
    });
    expect(day.blocks).toEqual([]);
  });

  it("carries Gremly's care rules, voice, the person and the day", () => {
    const p = briefPersona({ first_name: 'Alex', pronouns: null, identity: {} }, req);
    expect(p).toContain('HOW TO READ TIME, PLANS AND ABSENCE');
    expect(p).toContain('PRIVATE');
    expect(p).toContain('WRITING');
    expect(p).toContain('Their first name is Alex.');
    expect(p).toContain('no headings, lists, bold or emoji');
    expect(p).toContain('WHAT YOU KNOW ABOUT TODAY');
    expect(p).not.toMatch(/ — | – /);
  });
});

describe('a turn', () => {
  it('is the day turn when the agent is switched off', async () => {
    const dayTurn = jest.fn(async () => ({ about_day: true, changes: [], reply: 'Sure.' }));
    const r = await runBriefTurn({ env: {}, userId: USER, body: BODY, useAgent: false, dayTurn });
    expect(r).toEqual({ engine: 'day_turn', about_day: true, changes: [], reply: 'Sure.' });
    expect(dayTurn).toHaveBeenCalledWith(BODY);
  });

  it('is the agent: the reply, a card that can change the plan and set times, and the task list', async () => {
    const m = scripted(
      ask([
        'propose_changes',
        {
          changes: [
            { op: 'plan', plan: { kind: 'plan_move', id: MUM, time: '12:00' } },
            {
              op: 'plan',
              plan: {
                kind: 'add_block',
                title: 'Leave for the airport',
                time: '12:30',
                travel: true,
              },
            },
          ],
        },
      ]),
      reply(
        "I'd move the call with your parents to 12 and keep 12:30 for leaving for the airport.",
      ),
    );
    const lines = [];
    const dayTurn = jest.fn();
    const r = await runBriefTurn({
      env: {},
      userId: USER,
      body: BODY,
      useAgent: true,
      dayTurn,
      onStatus: (l) => lines.push(l),
      deps: { person: { first_name: 'Alex' }, ctx: fakeCtx, agent: { callModel: m.callModel } },
    });
    expect(dayTurn).not.toHaveBeenCalled();
    expect(r).toMatchObject({
      engine: 'agent',
      reply:
        "I'd move the call with your parents to 12 and keep 12:30 for leaving for the airport.",
      tasks: [{ ask: 'Pack', status: 'done' }],
      stopped: 'answer',
      tools: ['propose_changes'],
    });
    expect(r.card).toEqual([
      expect.objectContaining({
        cid: 'c1',
        op: 'plan',
        id: MUM,
        plan: expect.objectContaining({ kind: 'plan_move', start: 720 }),
      }),
      expect.objectContaining({
        cid: 'c2',
        op: 'plan',
        plan: expect.objectContaining({ kind: 'add_block', start: 750, travel: true }),
      }),
    ]);
    expect(lines).toEqual(['Looking at your day', 'Getting the changes ready']);
    // what it was told: the day, then the conversation, then the message
    expect(m.seen[0].system).toContain('WHAT YOU KNOW ABOUT TODAY');
    expect(m.seen[0].system).toContain('YOUR JOB HERE');
    expect(m.seen[0].system).toContain('- Pack (done)');
    expect(m.seen[0].turns.map((t) => t.role)).toEqual(['assistant', 'user', 'user']);
    expect(m.seen[0].turns[2].text).toBe(BODY.text);
  });

  it('falls back to the day turn when the agent cannot finish, and says why', async () => {
    const m = scripted({ ok: false, error: 'overloaded' }, { ok: false, error: 'overloaded' });
    const dayTurn = jest.fn(async () => ({
      about_day: true,
      changes: [],
      reply: 'From the day turn.',
    }));
    const r = await runBriefTurn({
      env: {},
      userId: USER,
      body: BODY,
      useAgent: true,
      dayTurn,
      deps: { person: {}, ctx: fakeCtx, agent: { callModel: m.callModel } },
    });
    expect(r).toMatchObject({
      engine: 'day_turn',
      reply: 'From the day turn.',
      agent_error: 'overloaded',
    });
    expect(r.agent).toMatchObject({ stopped: 'error' });
  });

  it('says so when the day turn cannot answer either', async () => {
    const r = await runBriefTurn({
      env: {},
      userId: USER,
      body: BODY,
      useAgent: false,
      dayTurn: async () => null,
    });
    expect(r).toEqual({ engine: 'day_turn', about_day: false, error: 'no answer' });
  });
});

describe('the route', () => {
  it('streams a first line, the status lines, then the result', async () => {
    const m = scripted(reply('Morning.'));
    const waited = [];
    const res = briefTurnResponse({
      env: {},
      userId: USER,
      body: { ...BODY, text: 'morning' },
      useAgent: true,
      dayTurn: async () => null,
      deps: { person: {}, ctx: fakeCtx, agent: { callModel: m.callModel } },
      waitUntil: (p) => waited.push(p),
    });
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    const text = await res.text();
    const events = text
      .split('\n\n')
      .filter(Boolean)
      .map((e) => JSON.parse(e.replace(/^data: /, '')));
    expect(events[0]).toEqual({ ping: true });
    expect(events[1]).toEqual({ status: 'Looking at your day' });
    expect(events.at(-1)).toMatchObject({
      done: true,
      engine: 'agent',
      reply: 'Morning.',
      card: [],
    });
    expect(waited).toHaveLength(1);
  });
});
