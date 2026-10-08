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
  easedWords,
  learnFromTurn,
  prioritiesWords,
  questionInPlay,
  questionSource,
  questionSourceContext,
  readWeek,
  readWrap,
  renderDay,
  reviewBlocked,
  reviewOf,
  runBriefTurn,
  weekContext,
  weekFrameOf,
  weekLine,
  weekVariant,
  wrapContext,
} from '../brief.js';
import { JUST_HAPPENED_RULE } from '../../../shared/lifePack.js';
import { readTurnRequest } from '../../../inngest-jobs/brief/dayTurn.js';
import { CHAT_WRITING_RULES, SOURCE_RULES_AGENT } from '../../../inngest-jobs/careRules.js';
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

  it('says what they planned for today in their week, and what came back from Later', () => {
    const planned = readTurnRequest({
      ...BODY,
      intention: 'Ship the submissions,\n  and keep my body in it',
      items: [
        {
          id: PUSHUPS,
          kind: 'habit',
          title: 'Pushups',
          minutes: 10,
          note: 'planned for today in their week',
        },
        { id: MUM, kind: 'todo', title: 'Call Mum', note: 'put off earlier, back today' },
        {
          id: 'step-1',
          kind: 'todo',
          title: 'Draft the cover letter',
          due_day: '2026-10-02',
          minutes: 30,
          note: 'due today',
          towards: 'Send the grant application',
        },
      ],
    });
    const text = renderDay(planned);
    expect(text).toContain(
      `${PUSHUPS} | habit | Pushups | no day | - | 10 min | planned for today in their week`,
    );
    expect(text).toContain(
      `${MUM} | todo | Call Mum | no day | - | - | put off earlier, back today`,
    );
    expect(text).toContain(
      'step-1 | todo | Draft the cover letter | 2026-10-02 | - | 30 min | due today, a step towards "Send the grant application"',
    );
    expect(text).toContain(
      'THEIR INTENTION FOR THIS WEEK (their own words, from their weekly review): "Ship the submissions, and keep my body in it"',
    );
    // the intention comes with the day, before Gremly's open question
    expect(text.indexOf('THEIR INTENTION')).toBeLessThan(text.indexOf("GREMLY'S OPEN QUESTION"));
  });

  it('says nothing of an intention or a goal when the app sent none', () => {
    const text = renderDay(req);
    expect(text).not.toContain('THEIR INTENTION');
    expect(text).not.toContain('a step towards');
    expect(readTurnRequest({ ...BODY, intention: '   ' }).intention).toBeNull();
    expect(readTurnRequest({ ...BODY, intention: 'x'.repeat(400) }).intention.length).toBe(201);
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
      breaking: false,
    });
    expect(day.blocks).toEqual([]);
  });

  it('knows which of their habits is one they are breaking, when the app says so', () => {
    const withBreaking = readTurnRequest({
      ...BODY,
      items: [
        ...BODY.items,
        { id: 'sugar', kind: 'habit', title: 'No sugar', breaking: true },
        // only a habit can be one: the flag on anything else is not taken
        { id: 'odd', kind: 'todo', title: 'Odd', breaking: true },
      ],
    });
    const day = dayFrameOf(withBreaking);
    expect(day.items.get('sugar').breaking).toBe(true);
    expect(day.items.get('odd').breaking).toBe(false);
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
    // a friend asks after what has just happened (data fabric stage 4e)
    expect(p).toContain(JUST_HAPPENED_RULE);
    expect(p).toContain(
      'or to ask after something that has just happened in their life, never to offer more',
    );
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
    // Up next among their Chapters, as the daily picture carries it (data fabric 4b)
    expect(
      dayMeaning({
        ...dco,
        up_next: { title: 'The half', date: '2026-10-04', which: 'ends', days_until: 2 },
      }),
    ).toMatch(/\n- Up next among their Chapters: "The half" ends on Sunday 2026-10-04$/);
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
  it('has nothing to read when the date is not a real day, and asks nobody', async () => {
    const dayTurn = jest.fn();
    const agent = jest.fn();
    for (const date of ['2026-13-01', '2026-02-30', '2026-10-2', 'today', null]) {
      const r = await runBriefTurn({
        env: {},
        userId: USER,
        body: { ...BODY, date, week: { weekly_day: 0 } },
        useAgent: true,
        dayTurn,
        deps: { person: {}, ctx: {}, dayEndHour: 3, agent: { ask: agent } },
      });
      expect(r).toEqual({ engine: 'agent', error: 'nothing to read' });
    }
    expect(dayTurn).not.toHaveBeenCalled();
    expect(agent).not.toHaveBeenCalled();
  });

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

  it('pings while the turn runs, and stops once the result is sent', async () => {
    const m = scripted(reply('Morning.'));
    // a model that takes a while to answer
    const slow = async (...a) => {
      await new Promise((r) => setTimeout(r, 60));
      return m.callModel(...a);
    };
    const res = briefTurnResponse({
      env: {},
      userId: USER,
      body: { ...BODY, text: 'morning' },
      useAgent: true,
      dayTurn: async () => null,
      deps: { person: {}, ctx: fakeCtx, agent: { callModel: slow } },
      pingEvery: 10,
    });
    const events = (await res.text())
      .split('\n\n')
      .filter(Boolean)
      .map((e) => JSON.parse(e.replace(/^data: /, '')));
    // the first ping, and more while the model was working
    expect(events.filter((e) => e.ping).length).toBeGreaterThan(2);
    // the result is the last thing sent: no ping follows it
    expect(events.at(-1)).toMatchObject({ done: true, reply: 'Morning.' });
    expect(events.filter((e) => e.done)).toHaveLength(1);
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
        {
          id: VET,
          type: 'todo',
          title: 'Do taxes',
          outcome: 'kept for tomorrow',
          was: 'was due Saturday 3 October',
        },
        { id: 'not-an-id', type: 'note', title: 'Gym idea', outcome: 'let go' },
        { title: '', outcome: 'x' },
      ],
    });
    const text = wrapContext(wrap);
    expect(text).toContain('THE EVENING WRAP UP, UNDER WAY');
    expect(text).toContain('Where it is now: their habits.');
    expect(text).toContain(
      `Sorted in the cards tonight (id | what it is | what they decided | before tonight):\n${VET} | todo "Do taxes" | kept for tomorrow | was due Saturday 3 October\nno id | note "Gym idea" | let go | not moved`,
    );
    expect(text).toContain("When they want one of tonight's decisions put back or changed");
    expect(text).toContain('carries on by itself after your reply');
    expect(text).not.toContain("GREMLY'S QUESTION");
  });

  it('once it is finished, still knows what the cards settled, and does not carry on', () => {
    const text = wrapContext(
      readWrap({
        step: 'done',
        decisions: [{ id: VET, type: 'todo', title: 'Do taxes', outcome: 'kept for Friday' }],
      }),
    );
    expect(text).toContain("TONIGHT'S WRAP UP, FINISHED");
    expect(text).toContain(`${VET} | todo "Do taxes" | kept for Friday | not moved`);
    expect(text).not.toContain('carries on by itself');
    expect(text).not.toContain('UNDER WAY');
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
    // the case that changes nothing comes first, and is the whole turn
    expect(text).toContain('Then see whether that item already agrees with the answer.');
    expect(text).toContain(
      'When it does, the reply is the whole turn: no card, and no remark that nothing changes.',
    );
    // else the change goes on the card in this step, to that item alone
    expect(text).toContain(
      'put the change to it on the card with propose_changes, with your reply, in this step, and change that item alone, since an item that goes with it stays as it is until they ask.',
    );
    // that the answer is saved is not said as if the matter were closed
    expect(text).toContain('saving the answer to what Gremly knows about them changes no item');
    expect(text).not.toContain('already saved');
    // a question about their life names no item, so no item is singled out
    const life = wrapContext(
      readWrap({ step: 'questions', decisions: [], answering: { question: 'Friday or Monday?' } }),
    );
    expect(life).toContain('Then see whether any of their items disagrees with the answer.');
    expect(life).toContain('When none does, the reply is the whole turn');
    expect(life).toContain(
      'When one does, it is still as it was, because saving the answer to what Gremly knows about them changes no item: put the change to it on the card with propose_changes, with your reply, in this step.',
    );
    expect(life).not.toContain('change that item alone');
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

// ── The person's week (the weekly review) ───────────────────────────────────

describe("the person's week, when the app sends it", () => {
  // Sunday 4 October 2026 is the weekly day; the week it plans is Monday 5 to Sunday 11
  const SUN = '2026-10-04';
  const MON = '2026-10-05';
  const WED = '2026-10-07';
  const NEXT_SUN = '2026-10-11';
  const RUN = '55555555-5555-4555-8555-555555555555';
  const PLAIN = { weekly_day: 0, days_off: [6, 0], review: null, extra_used: false };
  const done = { week_start: MON, span_start: MON, status: 'done', kind: 'weekly' };
  const UNDER = {
    ...PLAIN,
    review: { week_start: MON, span_start: MON, status: 'started', kind: 'weekly' },
    hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
    busy_days: ['2026-10-08'],
    under_way: {
      step: 'shape',
      first: MON,
      last: NEXT_SUN,
      challenge: { headline: 'The report has no room', why: 'It needs three hours.' },
      picks: [{ text: 'Write the report', item_ids: [MUM] }],
      settled: [
        {
          kind: 'day',
          id: MUM,
          type: 'todo',
          title: 'Call Mum',
          outcome: 'on Tuesday 6 Oct',
          was: 'was due Friday 2 Oct',
        },
        { kind: 'intention', title: 'Intention', outcome: 'One thing at a time' },
        { kind: 'made up', title: 'x', outcome: 'y' },
      ],
      habit_days: [{ id: RUN, days: [WED, MON] }],
    },
  };

  describe('as it is read', () => {
    it('is nothing from an app build that does not send it', () => {
      expect(readWeek(undefined)).toBeNull();
      expect(readWeek({})).toBeNull();
      expect(readWeek({ weekly_day: 9 })).toBeNull();
      expect(readWeek({ weekly_day: 'Sunday' })).toBeNull();
    });

    it('keeps the weekly day, days off, the review, the shape and the intention', () => {
      const w = readWeek({
        weekly_day: 3,
        days_off: [5, 6, 'x'],
        review: { week_start: MON, status: 'done', kind: 'extra' },
        extra_used: true,
        hours: { normal_day: 2.2, busy_day: 'lots', weekend_day: 4 },
        busy_days: ['2026-10-08', 'Friday', '2026-10-08'],
        intention: { id: MUM, text: '  Rest   first ' },
      });
      expect(w).toEqual({
        weekly_day: 3,
        days_off: [5, 6],
        review: { week_start: MON, span_start: MON, status: 'done', kind: 'extra' },
        extra_used: true,
        hours: { normal_day: 2, weekend_day: 4 },
        busy_days: ['2026-10-08'],
        intention: { id: MUM, text: 'Rest first' },
        // this build did not say what matters most now: a new priority is never put to it
        priorities: null,
        under_way: null,
        // this build did not say which habits are eased: that change is never offered to it
        eased: null,
      });
    });

    it('reads what matters most this week, from a build that sends it', () => {
      const w = readWeek({
        weekly_day: 0,
        priorities: ['  Finish   the grant ', '', 7, 'x'.repeat(200)],
      });
      expect(w.priorities).toEqual(['Finish the grant', 'x'.repeat(120)]);
      expect(readWeek({ weekly_day: 0, priorities: [] }).priorities).toEqual([]);
      // it is told with their week, and nothing is said from a build that did not send it
      expect(prioritiesWords(w)).toContain(
        'What matters most to them this week, as it stands: “Finish the grant”',
      );
      expect(prioritiesWords({ priorities: [] })).toBe(
        ' Nothing is chosen as mattering most this week yet.',
      );
      expect(prioritiesWords(readWeek({ weekly_day: 0 }))).toBe('');
      expect(weekFrameOf(w, MON).priorities).toEqual(w.priorities);
      expect(weekFrameOf(readWeek({ weekly_day: 0 }), MON).priorities).toBeNull();
    });

    it('reads the habits paused or on a lighter version, from a build that sends them', () => {
      const eased = [
        { habit_id: MUM, title: ' Run ', mode: 'pause', first: MON, last: NEXT_SUN },
        {
          habit_id: MUM,
          title: 'Swim',
          mode: 'lighter',
          first: MON,
          last: NEXT_SUN,
          note: 'Two  lengths',
        },
        // not ones it can read: no id, no such mode, days the wrong way round, over already
        { habit_id: 'h1', title: 'A', mode: 'pause', first: MON, last: NEXT_SUN },
        { habit_id: MUM, title: 'B', mode: 'rest', first: MON, last: NEXT_SUN },
        { habit_id: MUM, title: 'C', mode: 'pause', first: NEXT_SUN, last: MON },
        { habit_id: MUM, title: 'D', mode: 'pause', first: '2026-09-01', last: '2026-09-07' },
      ];
      const w = readWeek({ ...PLAIN, eased }, MON);
      expect(w.eased).toEqual([
        { habit_id: MUM, title: 'Run', mode: 'pause', first: MON, last: NEXT_SUN, note: '' },
        {
          habit_id: MUM,
          title: 'Swim',
          mode: 'lighter',
          first: MON,
          last: NEXT_SUN,
          note: 'Two lengths',
        },
      ]);
      // none eased is still a build that can apply the change
      expect(readWeek({ ...PLAIN, eased: [] }, MON).eased).toEqual([]);
      expect(weekVariant(readWeek({ ...PLAIN, eased: [] }, MON))).toBe('week_ease');
      expect(weekVariant(readWeek(PLAIN, MON))).toBe('week');
      expect(weekVariant(null)).toBeUndefined();
      // a turn that answers a question of Gremly's is not offered it: its one job is that answer
      expect(weekVariant(readWeek({ ...PLAIN, eased: [] }, MON), { answering: true })).toBe('week');
      // the tools are handed the same list
      expect(weekFrameOf(w, MON).eased).toEqual(w.eased);
      expect(weekFrameOf(readWeek(PLAIN, MON), MON).eased).toBeNull();
    });

    it('says which habits are eased in what Gremly knows about their week, with their ids', () => {
      const w = readWeek(
        {
          ...PLAIN,
          eased: [
            { habit_id: MUM, title: 'Run', mode: 'pause', first: MON, last: NEXT_SUN },
            {
              habit_id: MUM,
              title: 'Swim',
              mode: 'lighter',
              first: MON,
              last: MON,
              note: 'Two lengths',
            },
            { habit_id: MUM, title: 'Walk', mode: 'lighter', first: MON, last: MON },
          ],
        },
        MON,
      );
      const line = weekLine(w, MON);
      expect(line).toContain(
        'HABITS EASED FOR NOW (habit id | habit | how | first day | last day)',
      );
      expect(line).toContain(`${MUM} | Run | paused | ${MON} | ${NEXT_SUN}`);
      expect(line).toContain(`${MUM} | Swim | lighter version: “Two lengths” | ${MON} | ${MON}`);
      expect(line).toContain(`${MUM} | Walk | lighter version | ${MON} | ${MON}`);
      expect(line).not.toMatch(/ — | – | - /);
      // nothing is said when none are eased, or by a build that does not send them
      expect(easedWords(readWeek({ ...PLAIN, eased: [] }, MON))).toBe('');
      expect(weekLine(readWeek(PLAIN, MON), MON)).not.toContain('EASED');
    });

    it('drops what it cannot read: a review with no week, an id that is not one', () => {
      const w = readWeek({
        ...PLAIN,
        review: { status: 'done' },
        intention: { id: 'i1', text: 'Rest' },
        under_way: { step: 'somewhere', first: MON, last: NEXT_SUN },
      });
      expect(w.review).toBeNull();
      expect(w.intention).toEqual({ id: null, text: 'Rest' });
      expect(w.under_way).toBeNull();
    });

    it('takes ids only as strings, kinds only from its own list, and lists only to their length', () => {
      expect(
        readWeek({ ...PLAIN, intention: { id: [MUM], text: 'Rest' } }).intention.id,
      ).toBeNull();
      const week = readWeek({
        ...UNDER,
        under_way: {
          ...UNDER.under_way,
          picks: [{ text: 'x', item_ids: [[MUM], MUM, 7, null] }],
          settled: [
            { kind: 'constructor', title: 'x', outcome: 'y' },
            { kind: 'toString', title: 'x', outcome: 'y' },
            { kind: 'day', id: [MUM], title: 'Call Mum', outcome: 'on Tuesday' },
          ],
          habit_days: [
            { id: [RUN], days: [MON] },
            { id: RUN, days: [MON] },
          ],
          placed: Array.from({ length: 5000 }, () => ({ id: MUM, day: MON })),
        },
      });
      const u = week.under_way;
      expect(u.picks).toEqual([{ text: 'x', item_ids: [MUM] }]);
      expect(u.settled).toEqual([expect.objectContaining({ kind: 'day', id: null })]);
      expect(u.habit_days).toEqual([{ id: RUN, days: [MON] }]);
      expect(u.placed).toHaveLength(200);
      // nothing that is not a kind of settled thing reaches what Gremly reads
      expect(weekContext(week)).not.toContain('function');
    });

    it('is not under way when its days are not a week around now', () => {
      const under = (over, today) =>
        readWeek({ ...UNDER, under_way: { ...UNDER.under_way, ...over } }, today).under_way;
      expect(under({}, SUN)).toBeTruthy();
      // more than two weeks of days is not a week
      expect(under({ last: '2026-10-25' }, SUN)).toBeNull();
      // its days have all gone
      expect(under({}, '2026-10-12')).toBeNull();
      // further off than the week after next
      expect(under({ first: '2026-11-02', last: '2026-11-08' }, SUN)).toBeNull();
      // the week it belongs to starts on or before its first day
      expect(under({ first: WED, week_start: MON }, SUN).week_start).toBe(MON);
      expect(under({ week_start: '2026-10-09' }, SUN).week_start).toBe(MON);
    });

    it('reads a review under way: where it is, the days, and what is settled', () => {
      const u = readWeek(UNDER).under_way;
      expect(u).toMatchObject({ step: 'shape', first: MON, last: NEXT_SUN, hold: '', about: null });
      expect(u.picks).toEqual([{ text: 'Write the report', item_ids: [MUM] }]);
      // a kind it does not know is left out
      expect(u.settled.map((s) => s.kind)).toEqual(['day', 'intention']);
      expect(u.habit_days).toEqual([{ id: RUN, days: [MON, WED] }]);
      expect(u.placed).toEqual([]);
    });
  });

  describe('for the tools', () => {
    it('acts from today to the end of this week, and shows the whole week', () => {
      const f = weekFrameOf(readWeek({ ...PLAIN, review: done }), WED);
      expect(f).toMatchObject({
        first: WED,
        last: NEXT_SUN,
        view_first: MON,
        view_last: NEXT_SUN,
        has_review: true,
        blocked: false,
        next_review: NEXT_SUN,
      });
    });

    it('on the weekly day shows today with the week ahead: every day a change can act on', () => {
      const f = weekFrameOf(readWeek(PLAIN), SUN);
      expect(f).toMatchObject({
        view_first: SUN,
        view_last: NEXT_SUN,
        first: SUN,
        last: NEXT_SUN,
        week_start: MON,
        has_review: false,
        next_review: SUN,
      });
    });

    it('reads what is saved once the review is finished: nothing is under way for the tools', () => {
      const finished = readWeek({
        ...UNDER,
        review: done,
        under_way: { ...UNDER.under_way, step: 'done' },
      });
      const f = weekFrameOf(finished, WED);
      expect(f.under_way).toBeNull();
      expect(f).toMatchObject({ first: WED, last: NEXT_SUN, view_first: MON, has_review: true });
      // the finished review is still told to Gremly in words
      expect(weekContext(finished)).toContain('THE WEEKLY REVIEW, FINISHED');
    });

    it('leaves out a review that is for another week, as one is once the weekly day has moved', () => {
      // the weekly day is now Wednesday: the week they are in starts Thursday 8 October
      const moved = readWeek({ ...PLAIN, weekly_day: 3, review: done, extra_used: true });
      expect(reviewOf(moved, WED)).toBeNull();
      expect(reviewOf(readWeek({ ...PLAIN, review: done }), WED)).toEqual(done);
      const f = weekFrameOf(moved, WED);
      expect(f).toMatchObject({ review: null, has_review: false, week_start: '2026-10-08' });
      // so the review for the new week has not been done, and one can be started
      expect(weekLine(moved, WED)).toContain('has not been done');
      expect(reviewBlocked(moved, WED)).toBe(false);
    });

    it('keeps the week a brought forward review is for, apart from the week today is in', () => {
      const forward = readWeek({
        ...UNDER,
        review: done,
        under_way: {
          ...UNDER.under_way,
          first: '2026-10-12',
          last: '2026-10-18',
          week_start: '2026-10-12',
        },
      });
      const f = weekFrameOf(forward, '2026-10-10');
      expect(f).toMatchObject({
        first: '2026-10-12',
        last: '2026-10-18',
        week_start: '2026-10-12',
      });
      expect(weekLine(forward, '2026-10-10')).toContain(
        'The review for the week ahead, Monday 12 Oct to Sunday 18 Oct, is under way in this thread.',
      );
    });

    it('keeps to the days being planned while a review is under way', () => {
      const f = weekFrameOf(readWeek(UNDER), SUN);
      expect(f).toMatchObject({
        first: MON,
        last: NEXT_SUN,
        view_first: MON,
        view_last: NEXT_SUN,
        has_review: true,
        hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
        busy_days: ['2026-10-08'],
      });
    });

    it('is nothing without a week', () => {
      expect(weekFrameOf(null, WED)).toBeNull();
    });
  });

  describe('whether a review can be started today', () => {
    const used = (review) => readWeek({ ...PLAIN, review, extra_used: true });
    it('cannot midweek once the extra is used', () => {
      expect(reviewBlocked(used(done), WED)).toBe(true);
      expect(reviewBlocked(readWeek({ ...PLAIN, review: done }), WED)).toBe(false);
    });
    it('can midweek while the extra is still under way: opening it picks it up', () => {
      expect(reviewBlocked(used({ ...done, status: 'started' }), WED)).toBe(false);
    });
    it('can on the weekly day and the two days after, until the weekly review is done', () => {
      expect(reviewBlocked(used(null), MON)).toBe(false);
      expect(reviewBlocked(used(done), MON)).toBe(true);
    });
    it('can the day before the weekly day: next week is brought forward', () => {
      expect(reviewBlocked(used(done), '2026-10-10')).toBe(false);
    });
  });

  describe('the line about their week', () => {
    it('says their weekly day, the next one, whether the review is done and the extra free', () => {
      expect(weekLine(readWeek({ ...PLAIN, review: done }), WED)).toBe(
        'THEIR WEEK: Their weekly review is on Sundays, and the next is Sunday 11 Oct. The review for this week, Monday 5 Oct to Sunday 11 Oct, is done. The one extra review a week is still free.',
      );
    });

    it('on the weekly day speaks of the week ahead', () => {
      const line = weekLine(readWeek(PLAIN), SUN);
      expect(line).toContain('Today is their weekly day, Sunday');
      expect(line).toContain(
        'The review for the week ahead, Monday 5 Oct to Sunday 11 Oct, has not been done.',
      );
    });

    it('says when no review can be started, and what can be offered instead', () => {
      const line = weekLine(readWeek({ ...PLAIN, review: done, extra_used: true }), WED);
      expect(line).toContain('has been used, so no other review can be started today');
      expect(line).toContain(
        'what Gremly can offer instead is to move their weekly day, on the card',
      );
      // in Ask Gremly the card cannot move it, and the line says where it can be moved
      const chat = weekLine(readWeek({ ...PLAIN, review: done, extra_used: true }), WED, {
        moveOnCard: false,
      });
      expect(chat).toContain('has been used, so no other review can be started today.');
      expect(chat).toContain("can be moved from today's thread, and not from here");
      expect(chat).not.toContain('on the card');
      // the day before the weekly day, next week can still be brought forward
      const sat = weekLine(readWeek({ ...PLAIN, review: done, extra_used: true }), '2026-10-10');
      expect(sat).toContain('The one extra review a week has been used.');
    });

    it('follows a weekly day that is not Sunday, and a review under way', () => {
      const line = weekLine(readWeek({ ...UNDER, weekly_day: 3 }), '2026-10-08');
      expect(line).toContain(
        'Their weekly review is on Wednesdays, and the next is Wednesday 14 Oct.',
      );
      expect(line).toContain('is under way in this thread');
    });

    it('joins the day only when the app sent the week', () => {
      const req = readTurnRequest(BODY);
      expect(renderDay(req)).not.toContain('THEIR WEEK');
      const withWeek = renderDay(req, null, readWeek({ ...PLAIN, review: done }));
      expect(withWeek).toContain('THEIR WEEK: Their weekly review is on Sundays');
      // the day itself reads the same, with the line added before Gremly's question
      expect(withWeek.replace(/THEIR WEEK:[^\n]*\n\n/, '')).toBe(renderDay(req));
    });
  });

  describe('the review under way', () => {
    it('says where it is, the challenge, the picks, the habit days and what is settled, with ids', () => {
      const text = weekContext(readWeek(UNDER));
      expect(text).toContain('THE WEEKLY REVIEW, UNDER WAY');
      expect(text).toContain('It plans Monday 5 Oct to Sunday 11 Oct.');
      expect(text).toContain('Where it is now: the shape of the week');
      expect(text).toContain(
        'The challenge Gremly opened with: "The report has no room" It needs three hours.',
      );
      expect(text).toContain(`Write the report | ${MUM}`);
      expect(text).toContain(`${RUN} | Monday 5 Oct, Wednesday 7 Oct`);
      expect(text).toContain(
        `a todo given a day | ${MUM} | todo "Call Mum" | on Tuesday 6 Oct | was due Friday 2 Oct`,
      );
      expect(text).toContain(
        'their intention | no id | "Intention" | One thing at a time | not set before',
      );
      expect(text).toContain('put back or changed');
    });

    it('tells Gremly how to answer what they type, to read the board, to hold, and the health rule', () => {
      const text = weekContext(readWeek(UNDER));
      expect(text).toContain('They can type anything at any moment of the review.');
      expect(text).toContain('read with get_week');
      expect(text).toContain('call hold with your reply');
      // the review no longer moves on by itself: a button carries it on, and Gremly is told so
      expect(text).toContain('The review carries on after your reply, from the step it is on');
      expect(text).not.toContain('by itself');
      expect(text).toContain(
        'What carries the review on is a button under the thread, which they tap when they are ready.',
      );
      expect(text).toContain('never name a condition, treatment or medication in your own words');
      // semantic rules only: no dashes used as punctuation
      expect(text).not.toMatch(/ — | – | - /);
    });

    it('takes work Gremly cannot see as the shape of the week, and never copies their calendar', () => {
      const text = weekContext(readWeek(UNDER));
      // a task they name comes first and is a new todo, put on the card without asking
      expect(text).toContain('It is a new todo, put on the card with add');
      expect(text).toContain('without asking whether they want it or which day');
      // a load is the week's shape, never an item
      expect(text).toContain('The load itself is never a todo and never a note');
      expect(text).toContain('with week_shape: the days they say it falls on become busy days');
      expect(text.indexOf('It is a new todo')).toBeLessThan(text.indexOf('The load itself'));
      expect(text).toContain(
        'never put a todo, a note or a set time on the card for a calendar entry',
      );
      // adding it to what matters most is put only to a build that can keep it
      expect(text).not.toContain('with priority');
      const can = weekContext(readWeek({ ...UNDER, priorities: [] }));
      expect(can).toContain('add the load to what matters most this week with priority');
      // the task is never folded into the priority's words
      expect(can).toContain('the load alone, never a task they named');
      expect(can).not.toMatch(/ — | – | - /);
      // none of it is said once the review is finished
      const finished = readWeek({ ...UNDER, under_way: { ...UNDER.under_way, step: 'done' } });
      expect(weekContext(finished)).not.toContain('The load itself is never a todo');
    });

    it('says when it plans only the rest of a week', () => {
      const part = readWeek({
        ...UNDER,
        under_way: { ...UNDER.under_way, first: WED },
      });
      expect(weekContext(part)).toContain(
        'It plans Wednesday 7 Oct to Sunday 11 Oct, the rest of this week rather than a whole one',
      );
    });

    it('says what the review is waiting on, and the one they opened to talk through', () => {
      const text = weekContext(
        readWeek({
          ...UNDER,
          under_way: {
            ...UNDER.under_way,
            step: 'needs_you',
            hold: 'Which accountant do you want to use?',
            about: {
              title: 'Sort out the accountant',
              item_ids: [MUM],
              stuck_because: 'It has moved six times',
              question: 'What is the first small step?',
            },
          },
        }),
      );
      expect(text).toContain(
        'waiting on this step for their answer to what Gremly asked: "Which accountant do you want to use?"',
      );
      expect(text).toContain('THEY OPENED ONE TO TALK IT THROUGH');
      expect(text).toContain(`"Sort out the accountant" (todos ${MUM})`);
      expect(text).toContain('Gremly asked: "What is the first small step?"');
      // talking one through ends with something to say yes to
      expect(text).toContain('End your reply with one concrete offer on the card');
    });

    it('once it is finished, keeps what was settled and stops carrying on', () => {
      const text = weekContext(
        readWeek({ ...UNDER, under_way: { ...UNDER.under_way, step: 'done' } }),
      );
      expect(text).toContain('THE WEEKLY REVIEW, FINISHED');
      expect(text).toContain('Settled so far in the review');
      expect(text).not.toContain('What carries the review on');
      expect(text).not.toContain('hold');
    });

    it('lets the wrap up put one off too, and leaves the wrap up as it was without the week', () => {
      const wrap = readWrap({
        step: 'journal',
        decisions: [
          { id: MUM, type: 'todo', title: 'Call Mum', outcome: 'to come back on Monday' },
        ],
      });
      const without = wrapContext(wrap);
      // word for word what the wrap up said before the week's changes existed
      expect(without).toContain(
        "When they want one of tonight's decisions put back or changed, offer the change by its id: its day as it was before tonight, or restore one they let go. Keeping one as it is and bringing one back on a later night are the cards' own and cannot go on a card; to bring one of those sooner, offer it a day.",
      );
      expect(without).not.toContain('put off until another day');
      const withWeek = wrapContext(wrap, readWeek(PLAIN));
      expect(withWeek).toContain("Keeping one as it is is the cards' own and cannot go on a card.");
      expect(withWeek).toContain('or put off until another day');
      expect(withWeek).not.toContain('bringing one back on a later night are');
    });

    it('is nothing when none is under way, and comes after the day', () => {
      expect(weekContext(readWeek(PLAIN))).toBe('');
      expect(weekContext(null)).toBe('');
      const req = readTurnRequest(BODY);
      const all = dayContext(req, null, null, null, readWeek(UNDER));
      expect(all.indexOf('THE WEEKLY REVIEW, UNDER WAY')).toBeGreaterThan(
        all.indexOf("GREMLY'S OPEN QUESTION"),
      );
      // with no week the day ends on Gremly's open question, as it always has
      expect(dayContext(req).endsWith("GREMLY'S OPEN QUESTION: none")).toBe(true);
      expect(dayContext(req)).not.toContain('WEEK');
    });
  });

  describe('a turn', () => {
    const turn = (body, m) =>
      runBriefTurn({
        env: {},
        userId: USER,
        body,
        useAgent: true,
        dayTurn: async () => null,
        deps: { person: { first_name: 'Alex' }, ctx: fakeCtx, agent: { callModel: m.callModel } },
      });
    const names = (m) => m.seen[0].tools.map((t) => t.name);

    it("has the week's tools and changes only when the app sent the week", async () => {
      const without = scripted(reply('Morning.'));
      await turn({ ...BODY, text: 'morning' }, without);
      expect(names(without)).toEqual([
        'get_day',
        'find_items',
        'get_item',
        'recall',
        'web_search',
        'propose_changes',
        'track_tasks',
      ]);
      const ops = (m) =>
        m.seen[0].tools.find((t) => t.name === 'propose_changes').parameters.properties.changes
          .items.properties.op.enum;
      expect(ops(without)).not.toContain('later');
      expect(without.seen[0].system).not.toContain('weekly review');

      const withWeek = scripted(reply('Morning.'));
      await turn({ ...BODY, text: 'morning', week: { ...PLAIN, review: done } }, withWeek);
      expect(names(withWeek)).toEqual([
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
      expect(ops(withWeek)).toEqual(
        expect.arrayContaining([
          'later',
          'habit_days',
          'week_shape',
          'intention',
          'milestone',
          'weekly_day',
        ]),
      );
      expect(withWeek.seen[0].system).toContain('weekly review');
      expect(withWeek.seen[0].turns.at(-1).text).toContain(
        'THEIR WEEK: Their weekly review is on Sundays',
      );
    });

    it('holds the review when Gremly asks something the step waits on, in one step', async () => {
      const m = scripted({
        ...ask(['hold', { question: 'How many hours do you have on a normal day?' }]),
        text: 'How many hours do you have on a normal day?',
      });
      const r = await turn(
        { ...BODY, date: SUN, text: 'not sure about the hours', week: UNDER },
        m,
      );
      expect(r).toMatchObject({
        engine: 'agent',
        reply: 'How many hours do you have on a normal day?',
        hold: { question: 'How many hours do you have on a normal day?' },
        tools: ['hold'],
      });
      expect(r.offer).toBeUndefined();
      expect(m.seen).toHaveLength(1);
    });

    it("puts the week's button under the reply when they ask to plan their week", async () => {
      const m = scripted({ ...ask(['offer_week', {}]), text: 'Here you go.' });
      const r = await turn({ ...BODY, text: 'can we plan my week', week: PLAIN }, m);
      expect(r).toMatchObject({ reply: 'Here you go.', offer: { kind: 'week', done: false } });
      expect(r.hold).toBeUndefined();
      expect(m.seen).toHaveLength(1);
    });

    it("puts one of the week's changes on the card, checked against the week it was sent", async () => {
      const m = scripted(
        ask([
          'propose_changes',
          {
            changes: [
              { op: 'week_shape', shape: { busy_days: ['2026-10-08', '2026-10-09'] } },
              { op: 'weekly_day', weekday: 0 },
            ],
            reply: "I'd mark Thursday and Friday as busy.",
          },
        ]),
        reply("I'd mark Thursday and Friday as busy."),
      );
      const r = await turn(
        { ...BODY, date: SUN, text: 'thursday and friday are gone', week: UNDER },
        m,
      );
      expect(r.card).toEqual([
        {
          cid: 'c1',
          op: 'week_shape',
          type: null,
          id: null,
          title: '',
          week_start: MON,
          from: MON,
          shape: { busy_days: ['2026-10-08', '2026-10-09'] },
          before: { busy_days: ['2026-10-08'] },
        },
      ]);
      // the weekly day is already Sunday: the model hears why that row was dropped
      expect(m.seen[1].turns.at(-1).results[0].text).toContain('c2: it already is that way');
    });
  });
});

// ── Where Gremly's question came from ───────────────────────────────────────

describe("where Gremly's question came from", () => {
  const QUESTION =
    'Did the move to the Lisbon office get confirmed, or are you still waiting to hear?';
  const FACT_ID = '77777777-7777-4777-8777-777777777777';
  const FACT = {
    id: FACT_ID,
    statement:
      'Alex said work is busy but good, and that a move to the Lisbon office might be coming.',
    about_date: '2026-09-29',
    state: 'current',
    private: false,
    said_by: 'user',
    source_table: 'user_corrections',
    source_kind: 'question',
    source_question: 'How is work going these days?',
    source_quote:
      'Busy but good. Might be moving to the Lisbon office in the new year, we will see',
    // the evening of Tuesday 29 September in Los Angeles
    observed_at: '2026-09-30T05:10:00Z',
  };
  /** A database holding the person's questions and each one's fact. */
  const dbWith = (questions, facts = [FACT]) => {
    const seen = [];
    return {
      seen,
      select: async (path) => {
        seen.push(path);
        return path.startsWith('gremly_questions') ? questions : [];
      },
      rpc: async (fn, args) => {
        seen.push([fn, args]);
        return fn === 'fact_sources' ? facts.filter((f) => args.p_fact_ids.includes(f.id)) : [];
      },
    };
  };
  const WRAP = { step: 'questions', decisions: [], answering: { question: QUESTION } };

  it("is the wrap up's question when the message answers one, else the thread's open one", () => {
    const req = readTurnRequest({ ...BODY, question: 'Friday or Monday?' });
    expect(questionInPlay(req, readWrap(WRAP))).toBe(QUESTION);
    expect(questionInPlay(req, null)).toBe('Friday or Monday?');
    expect(questionInPlay(readTurnRequest(BODY), null)).toBe('');
  });

  it("finds the question among the person's own by its words, then reads its fact's source", async () => {
    const db = dbWith([
      { question: 'Another question?', about_fact_id: '88888888-8888-4888-8888-888888888888' },
      // spaces differ; the words are the same
      {
        question: `  ${QUESTION.replace('Lisbon office', 'Lisbon  office')} `,
        about_fact_id: FACT_ID,
      },
    ]);
    const fact = await questionSource({ db }, USER, QUESTION);
    expect(fact).toEqual(FACT);
    // only this person's questions, and only ones written about a fact
    expect(db.seen[0]).toContain(`gremly_questions?user_id=eq.${USER}`);
    expect(db.seen[0]).toContain('about_fact_id=not.is.null');
    expect(db.seen[1]).toEqual(['fact_sources', { p_user: USER, p_fact_ids: [FACT_ID] }]);
  });

  it('is nothing when there is no question, no such question, or no fact behind it', async () => {
    const db = dbWith([{ question: 'Another question?', about_fact_id: FACT_ID }]);
    expect(await questionSource({ db }, USER, '')).toBeNull();
    expect(db.seen).toEqual([]);
    expect(await questionSource({ db }, USER, QUESTION)).toBeNull();
    expect(
      await questionSource(
        { db: dbWith([{ question: QUESTION, about_fact_id: FACT_ID }], []) },
        USER,
        QUESTION,
      ),
    ).toBeNull();
  });

  it('never stops the turn when it cannot be read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const db = {
      select: async () => {
        throw new Error('select gremly_questions 500');
      },
      rpc: async () => [],
    };
    expect(await questionSource({ db }, USER, QUESTION)).toBeNull();
    // said in the log, not swallowed
    expect(warn).toHaveBeenCalled();
  });

  it('tells the agent how Gremly knows it, and that it is for the one case of being asked', () => {
    const block = questionSourceContext(QUESTION, FACT, {
      today: '2026-10-03',
      timezone: 'America/Los_Angeles',
    });
    expect(block).toBe(
      `IF THEY ASK WHERE GREMLY'S QUESTION CAME FROM\nGremly asked "${QUESTION}" because of their answer when Gremly asked "How is work going these days?", on Tue 29 Sep 2026; their words: "Busy but good. Might be moving to the Lisbon office in the new year, we will see".\nThis is the record itself, read just now, and it is here for one case only: when their message asks where the question came from, or how Gremly knew, rather than answering it. Then it is not an answer: tell them plainly and warmly from this, the day, where they said it and what they said, with no lookup. When their message answers the question, leave this out of your reply and handle the answer as above.`,
    );
    expect(questionSourceContext(QUESTION, null)).toBe('');
    expect(questionSourceContext('', FACT)).toBe('');
  });

  it('gives the fact as Gremly wrote it when their own words were not kept', () => {
    const block = questionSourceContext(
      QUESTION,
      { ...FACT, source_quote: null },
      { today: '2026-10-03', timezone: 'America/Los_Angeles' },
    );
    expect(block).toContain(
      `on Tue 29 Sep 2026. On record from it: "${FACT.statement}"\nThis is the record itself`,
    );
    // a fact whose source is not known is still said, as what is on record
    expect(questionSourceContext(QUESTION, { statement: FACT.statement })).toContain(
      `Gremly asked "${QUESTION}" because of this on record about them: "${FACT.statement}"\nThis is the record itself`,
    );
  });

  it('comes last in what the agent knows about today, and only when there is one', () => {
    const req = readTurnRequest({ text: 'hi', date: '2026-10-03', now: 1250, items: [] });
    const block = questionSourceContext(QUESTION, FACT, { today: '2026-10-03', timezone: 'UTC' });
    const all = dayContext(req, null, readWrap(WRAP), null, null, block);
    expect(all.endsWith(block)).toBe(true);
    expect(all.indexOf("THEIR MESSAGE ANSWERS GREMLY'S QUESTION")).toBeLessThan(all.indexOf(block));
    expect(dayContext(req, null, readWrap(WRAP))).not.toContain(
      "IF THEY ASK WHERE GREMLY'S QUESTION CAME FROM",
    );
  });

  it("leaves the wrap up's own words about an answer exactly as they were", () => {
    // what to do when they ask about the question is said with its source, not here:
    // a line here took the card off a plain answer
    const text = wrapContext(readWrap(WRAP));
    expect(text).not.toContain('it is not the answer');
    expect(text.endsWith('with your reply, in this step.')).toBe(true);
  });

  it('reaches the model with the message, and changes nothing about who Gremly is in the thread', async () => {
    const m = scripted(reply('You told me on Tuesday, when I asked how work was going.'));
    const db = dbWith([{ question: QUESTION, about_fact_id: FACT_ID }]);
    const r = await runBriefTurn({
      env: {},
      userId: USER,
      body: {
        ...BODY,
        text: 'How did you know about the Lisbon move?',
        date: '2026-10-03',
        wrap: WRAP,
      },
      useAgent: true,
      dayTurn: async () => null,
      deps: {
        person: { first_name: 'Alex' },
        ctx: { ...fakeCtx, db },
        dayEndHour: 3,
        agent: { callModel: m.callModel },
      },
    });
    expect(r).toMatchObject({ engine: 'agent', stopped: 'answer' });
    const sent = JSON.stringify(m.seen[0]);
    expect(sent).toContain("IF THEY ASK WHERE GREMLY'S QUESTION CAME FROM");
    expect(sent).toContain('on Tue 29 Sep 2026');
    expect(sent).toContain('Might be moving to the Lisbon office in the new year');
    // no standing rule in the thread: it cost the card on a plain answer (careRules.js)
    expect(m.seen[0].system).not.toContain('HOW GREMLY KNOWS WHAT IT KNOWS');
    expect(briefPersona({ first_name: 'Alex' })).not.toContain(SOURCE_RULES_AGENT);
  });

  it('a turn with no question in play asks the database nothing more', async () => {
    const m = scripted(reply('Morning.'));
    const db = dbWith([{ question: QUESTION, about_fact_id: FACT_ID }]);
    await runBriefTurn({
      env: {},
      userId: USER,
      body: { ...BODY, text: 'morning' },
      useAgent: true,
      dayTurn: async () => null,
      deps: {
        person: {},
        ctx: { ...fakeCtx, db },
        dayEndHour: 3,
        agent: { callModel: m.callModel },
      },
    });
    expect(db.seen.filter((x) => String(x).startsWith('gremly_questions'))).toEqual([]);
    const sent = JSON.stringify(m.seen[0]);
    expect(sent).not.toContain("WHERE GREMLY'S QUESTION CAME FROM");
    expect(sent).not.toContain('HOW GREMLY KNOWS');
  });
});
