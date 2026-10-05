/**
 * @jest-environment node
 */
// Today's thread on the agent (workers/cortex/agent/brief.js): the day the
// thread sends becomes what the agent knows, with real ids; the agent's card
// can change the plan on screen and today's set times; the day turn answers
// when the agent is off or cannot finish; the route streams status lines.

import {
  briefPersona,
  briefTurnResponse,
  cacheKeyFor,
  dayContext,
  dayFrameOf,
  dayMeaning,
  learnFromTurn,
  readWrap,
  renderDay,
  runBriefTurn,
  wrapContext,
} from '../brief.js';
import { readTurnRequest } from '../../../inngest-jobs/brief/dayTurn.js';
import { CHAT_WRITING_RULES } from '../../../inngest-jobs/careRules.js';
import { configureModels } from '../../models.js';

const MUM = '11111111-1111-4111-8111-111111111111';
const PUSHUPS = '22222222-2222-4222-8222-222222222222';
const USER = '0b7c6f0e-1d2a-4c3b-9e8f-112233445566';
const CHAT = '3c9f1a52-7d1e-4b8a-9c3f-5e6d7a8b9c0d';

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
const asked = [];
const fakeCtx = {
  env: {},
  userId: USER,
  timezone: 'America/Los_Angeles',
  cache: new Map(),
  db: {
    asked,
    select: async (path) => {
      asked.push(path);
      return [];
    },
    rpc: async () => [],
  },
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

  it('marks the small hours as the end of their day', () => {
    const late = readTurnRequest({ ...BODY, now: 46 });
    expect(renderDay(late, 3)).toContain(
      'TODAY: Friday 2026-10-02. TIME NOW: 12:46am, after midnight; their Friday ends at 3am.',
    );
    expect(renderDay(late, 0)).toContain('TODAY: Friday 2026-10-02. TIME NOW: 12:46am.');
    expect(renderDay(req, 3)).toContain('TODAY: Friday 2026-10-02. TIME NOW: 9:04am.');
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

  it("carries Gremly's care rules, voice and the person, the same from one message to the next", () => {
    const p = briefPersona({ first_name: 'Alex', pronouns: null, identity: {} });
    expect(p).toContain('HOW TO READ TIME, PLANS AND ABSENCE');
    expect(p).toContain('PRIVATE');
    expect(p).toContain('WRITING');
    // a conversation may celebrate with them now and then (the brief itself may not)
    expect(p).toContain(CHAT_WRITING_RULES);
    expect(p).not.toContain('No exclamation marks.');
    expect(p).toContain('Their first name is Alex.');
    expect(p).toContain('no headings, lists, bold or emoji');
    // the day changes from message to message, so it is not here (it goes last)
    expect(p).not.toContain('WHAT YOU KNOW ABOUT TODAY');
    expect(p).not.toMatch(/ — | – /);
    expect(dayContext(req)).toBe(`WHAT YOU KNOW ABOUT TODAY\n${renderDay(req)}`);
  });

  it("knows what today is about, from Gremly's picture of their day", () => {
    const dco = {
      lead_story: {
        what: 'Anniversary weekend with Dave in San Diego',
        why_today: 'A multi-day trip celebrating your anniversary, running through Sunday.',
      },
      day_frame: { away: { label: 'San Diego anniversary trip', through: '2026-10-04' } },
      voice_note: 'Keep things warm and unhurried.',
    };
    expect(dayMeaning(dco)).toBe(
      "WHAT TODAY IS ABOUT (Gremly's picture of their day)\n" +
        '- Anniversary weekend with Dave in San Diego: A multi-day trip celebrating your anniversary, running through Sunday.\n' +
        '- Away: San Diego anniversary trip, until Sunday 2026-10-04\n' +
        "- How Gremly's brief is pitching today: Keep things warm and unhurried.",
    );
    expect(dayMeaning(null)).toBe('');
    expect(dayContext(req, dco).indexOf('WHAT TODAY IS ABOUT')).toBeLessThan(
      dayContext(req, dco).indexOf('TODAY: Friday'),
    );
    expect(dayContext(req)).toBe(`WHAT YOU KNOW ABOUT TODAY\n${renderDay(req)}`);
  });

  it('keys the prompt cache by person, without sending their id', () => {
    expect(cacheKeyFor(USER)).toBe(cacheKeyFor(USER));
    expect(cacheKeyFor(USER)).not.toBe(cacheKeyFor(MUM));
    expect(cacheKeyFor(USER)).not.toContain(USER);
    expect(cacheKeyFor(USER)).toMatch(/^gremly-brief-[0-9a-f]+$/);
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
    // what it was told: the same instructions for every message (cached), then the
    // conversation, then what it knows right now with their message last
    const sys = m.seen[0].system;
    expect(sys).toContain('YOUR JOB HERE');
    expect(sys).toContain('HOW YOU WORK');
    expect(sys).not.toContain('WHAT YOU KNOW ABOUT TODAY');
    expect(m.seen[0].cacheKey).toBe(cacheKeyFor(USER));
    expect(m.seen[0].turns.map((t) => t.role)).toEqual(['assistant', 'user', 'user']);
    const last = m.seen[0].turns[2].text;
    expect(last).toContain('- Pack (done)');
    expect(last).toContain(renderDay(readTurnRequest(BODY)));
    expect(last.endsWith(`THEIR MESSAGE\n${BODY.text}`)).toBe(true);
    expect(fakeCtx.db.asked).toContain(
      `user_daily_state?user_id=eq.${USER}&date=eq.2026-10-02&select=dco&limit=1`,
    );
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

  it('learns from the message once the stream has closed', async () => {
    const m = scripted(reply('Glad you caught that.'));
    const checked = [];
    const waited = [];
    const res = briefTurnResponse({
      env: {},
      userId: USER,
      body: { ...BODY, text: 'the dinner is Sunday, not today', chat_id: CHAT },
      useAgent: true,
      dayTurn: async () => null,
      deps: {
        person: {},
        ctx: fakeCtx,
        agent: { callModel: m.callModel },
        learn: { checkForCorrection: async (a) => (checked.push(a), { sent: 1 }) },
      },
      waitUntil: (p) => waited.push(p),
    });
    await res.text();
    await waited[0];
    expect(checked).toHaveLength(1);
    expect(checked[0]).toMatchObject({
      latest: 'the dinner is Sunday, not today',
      chatId: CHAT,
      userId: USER,
      surface: 'brief',
    });
  });
});

describe('learning from the turn', () => {
  it('checks the message just sent, with the conversation and the reply as background', async () => {
    const checked = [];
    const r = await learnFromTurn({
      env: {},
      userId: USER,
      body: { ...BODY, chat_id: CHAT },
      result: { engine: 'agent', reply: 'Done, both are on the card.' },
      deps: { checkForCorrection: async (a) => (checked.push(a), { sent: 0 }) },
    });
    expect(r).toEqual({ sent: 0 });
    expect(checked[0].latest).toBe(BODY.text);
    expect(checked[0].conversationText).toBe(
      [
        ...BODY.history.map((m) => `${m.role === 'user' ? 'User' : 'Gremly'}: ${m.content}`),
        `User: ${BODY.text}`,
        'Gremly: Done, both are on the card.',
      ].join('\n\n'),
    );
    expect(checked[0].chatId).toBe(CHAT);
  });

  it('files without a thread when the app sends none', async () => {
    const checked = [];
    await learnFromTurn({
      env: {},
      userId: USER,
      body: { ...BODY, chat_id: 'not-a-thread' },
      result: { engine: 'agent', reply: 'Noted.', card: [] },
      deps: { checkForCorrection: async (a) => (checked.push(a), { sent: 0 }) },
    });
    expect(checked[0].chatId).toBeNull();
  });

  it('leaves a message the thread does not answer to normal chat, which checks it there', async () => {
    const checked = [];
    const check = async (a) => (checked.push(a), { sent: 0 });
    for (const result of [
      { engine: 'agent', reply: '  ', card: [] },
      { engine: 'day_turn', about_day: false, reply: 'Not about today.' },
      { engine: 'day_turn', about_day: true, reply: '', changes: [] },
      { engine: 'agent', error: 'nothing to read' },
      null,
    ]) {
      const r = await learnFromTurn({
        env: {},
        userId: USER,
        body: BODY,
        result,
        deps: { checkForCorrection: check },
      });
      expect(r).toEqual({ sent: 0 });
    }
    expect(checked).toHaveLength(0);
    // the day turn answering in the thread is checked like the agent
    await learnFromTurn({
      env: {},
      userId: USER,
      body: BODY,
      result: { engine: 'day_turn', about_day: true, reply: 'Moved it.', changes: [] },
      deps: { checkForCorrection: check },
    });
    expect(checked).toHaveLength(1);
  });
});

describe('a message typed while the evening wrap up is under way', () => {
  const VET = '0b7c6f0e-1d2a-4c3b-9e8f-112233445566';

  it('tells Gremly where the wrap up is, what was sorted, and that it carries on by itself', () => {
    const wrap = readWrap({
      step: 'habits',
      decisions: [
        { title: 'Do taxes', outcome: 'kept for tomorrow' },
        { title: '', outcome: 'x' },
      ],
    });
    const text = wrapContext(wrap);
    expect(text).toContain('THE EVENING WRAP UP, UNDER WAY');
    expect(text).toContain('Where it is now: their habits.');
    expect(text).toContain('Sorted in the cards tonight: Do taxes (kept for tomorrow).');
    expect(text).toContain('carries on by itself after your reply');
    expect(text).not.toContain("GREMLY'S QUESTION");
  });

  it('says which of his questions the message answers, and the item it is about', () => {
    const wrap = readWrap({
      step: 'questions',
      decisions: [],
      answering: {
        question: "Is Bella's vet visit on Friday or Monday?",
        item: { id: VET, kind: 'todo', title: 'Take Bella to the vet', when: 'Fri 9 Oct' },
      },
    });
    const text = wrapContext(wrap);
    expect(text).toContain("THEIR MESSAGE ANSWERS GREMLY'S QUESTION");
    expect(text).toContain(
      `Gremly asked: "Is Bella's vet visit on Friday or Monday?", about their todo "Take Bella to the vet" (id ${VET}), Fri 9 Oct.`,
    );
    expect(text).toContain('put that change on the card with your reply');
  });

  it('is nothing when no wrap up is under way, and comes after the day', () => {
    expect(readWrap(null)).toBeNull();
    expect(readWrap({ step: 'somewhere' })).toBeNull();
    expect(wrapContext(null)).toBe('');
    const req = readTurnRequest({ text: 'hi', date: '2026-10-03', now: 600, items: [] });
    const ctx = dayContext(req, null, readWrap({ step: 'journal', decisions: [] }));
    expect(ctx.indexOf('TODAY:')).toBeLessThan(ctx.indexOf('THE EVENING WRAP UP'));
  });

  it('calls a plan they said yes to On Today, not Lock In', () => {
    const req = readTurnRequest({
      text: 'hi',
      date: '2026-10-03',
      now: 600,
      items: [{ id: 't1', kind: 'todo', title: 'Taxes' }],
      plan: {
        status: 'locked',
        items: [{ id: 't1', kind: 'todo', title: 'Taxes', start: 660, end: 720 }],
      },
    });
    const text = renderDay(req);
    expect(text).toContain('THE PLAN ON SCREEN, ON TODAY (they said yes to it)');
    expect(text).not.toMatch(/LOCKED IN/);
  });

  it('an answer is not read again for corrections: the app saves it as the answer', async () => {
    const check = jest.fn().mockResolvedValue({ sent: 1 });
    const out = await learnFromTurn({
      env: {},
      userId: 'u1',
      body: {
        text: 'Monday',
        date: '2026-10-03',
        history: [],
        wrap: { step: 'questions', decisions: [], answering: { question: 'Friday or Monday?' } },
      },
      result: { engine: 'agent', reply: 'Monday it is.' },
      deps: { checkForCorrection: check },
    });
    expect(out).toEqual({ sent: 0 });
    expect(check).not.toHaveBeenCalled();
  });
});
