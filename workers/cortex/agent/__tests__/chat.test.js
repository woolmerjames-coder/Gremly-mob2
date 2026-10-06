/**
 * @jest-environment node
 */
// Ask Gremly on the agent (workers/cortex/agent/chat.js): who it is on for,
// what it knows, and one turn end to end with a scripted model.

import {
  agentChatFor,
  chatContext,
  prefetchForChat,
  runChatTurn,
  AGENT_LANES,
  chatCacheKey,
} from '../chat.js';
import { chatAgentPersona, buildGeneralChatConfig } from '../../gremlyPersona.js';
import { configureModels } from '../../models.js';
import { formatWeekAhead } from '../../context/weekAhead.js';

beforeEach(() => configureModels({}));

describe('who the agent answers for', () => {
  it('everyone when on, the listed accounts while it is tried, nobody otherwise', () => {
    expect(agentChatFor('on', 'u1')).toBe(true);
    expect(agentChatFor('u1, u2', 'u2')).toBe(true);
    expect(agentChatFor('u1', 'u3')).toBe(false);
    expect(agentChatFor('', 'u1')).toBe(false);
    expect(agentChatFor('off', 'u1')).toBe(false);
    expect(agentChatFor('on', null)).toBe(false);
    expect(AGENT_LANES).toEqual(['lookup', 'agent']);
  });
});

describe("Gremly's chat voice on the agent", () => {
  it('is the quick lane voice without the pill and item card rules or the date', () => {
    const p = chatAgentPersona();
    expect(p).toContain('=== HOW THE CONVERSATION FEELS ===');
    expect(p).toContain('TEMPORAL ACCURACY');
    expect(p).not.toContain('WHAT YOU CAN DO WITH THEIR ITEMS');
    expect(p).not.toContain('want me to save/track/add that?');
    expect(p).not.toContain('Never mention saving');
    expect(p).not.toContain('Today is');
    // the quick lane keeps all of it
    const quick = buildGeneralChatConfig(
      { mode: 'quick_ask', depth: 'brief', personal: 'none', search: 'none' },
      { runningSummary: '' },
      null,
      '',
      '',
      'UTC',
    ).systemPrompt;
    expect(quick).toContain('WHAT YOU CAN DO WITH THEIR ITEMS');
    expect(quick).toContain('Never mention saving');
  });

  it('knows what the quick lane knows, with the item a chat is about', () => {
    const c = chatContext({
      profileText: 'IDENTITY: James',
      todayActivity: "=== TODAY'S ACTIVITY ===",
      runningSummary: 'Talked about the trip.',
      anchor: { id: 't1', type: 'todo', title: 'Book hotel' },
      sessionContext: '=== THE WEEK AHEAD ===',
    });
    expect(c).toContain('ABOUT THIS USER\nIDENTITY: James');
    expect(c).toContain('THIS CONVERSATION EARLIER, IN SHORT\nTalked about the trip.');
    expect(c).toContain('the todo "Book hotel" (id t1)');
    expect(c).toContain('=== THE WEEK AHEAD ===');
    expect(chatContext({ anchor: { id: 't1', gone: true } })).toBe('');
    expect(chatCacheKey('u1')).toBe(chatCacheKey('u1'));
    expect(chatCacheKey('u1')).not.toBe(chatCacheKey('u2'));
  });

  it("gives the week's todos their ids, for the agent alone, and adds the items its message names", () => {
    const week = {
      first: '2026-10-03',
      days: [
        { date: '2026-10-03', meetings: [], allDay: [], todos: [] },
        {
          date: '2026-10-04',
          meetings: [],
          allDay: [],
          todos: [{ id: 'v1', title: 'Take Bella to the vet', due_time: '10:00:00' }],
        },
      ],
      overdue: [],
    };
    const plain = formatWeekAhead(week);
    const c = chatContext({
      sessionContext: `=== TODAY ===\n\n${plain}\n\n=== LIFE MAP ===`,
      week,
      found: 'THEIR ITEMS THAT SHARE WORDS WITH THIS MESSAGE (open ones, searched just now): none.',
    });
    expect(c).toContain('Take Bella to the vet (id v1) at 10:00am');
    expect(c).not.toContain(plain);
    expect(c).toContain('=== LIFE MAP ===');
    expect(c.endsWith('searched just now): none.')).toBe(true);
    // a week the preload lost on the way is still given, after it
    expect(chatContext({ sessionContext: '=== TODAY ===', week })).toContain('(id v1)');
  });
});

describe('one turn', () => {
  const ctx = { env: {}, userId: 'u1', timezone: 'America/Los_Angeles', db: {} };

  it('answers with the reply, the card and the task list, on the chat surface', async () => {
    const seen = [];
    const callModel = async (args) => {
      seen.push({ ...args, turns: args.turns.map((t) => ({ ...t })) });
      if (seen.length === 1)
        return {
          ok: true,
          provider: 'openai-responses',
          text: '',
          raw: [],
          calls: [
            {
              id: 'c1',
              nativeId: 'c1',
              name: 'propose_changes',
              args: { reply: 'Want me to move the vet to Friday?', changes: [] },
            },
          ],
        };
      return { ok: true, provider: 'openai-responses', text: 'Done thinking.', calls: [], raw: [] };
    };
    const runTool = async (_ctx, name) => ({
      ok: true,
      text: 'on the card',
      result:
        name === 'propose_changes'
          ? {
              changes: [
                {
                  op: 'change',
                  id: 'v1',
                  type: 'todo',
                  title: 'Vet',
                  fields: { day: '2026-10-09' },
                },
              ],
            }
          : {},
    });
    const statuses = [];
    const r = await runChatTurn({
      env: {},
      userId: 'u1',
      timezone: 'America/Los_Angeles',
      messages: [
        { role: 'system', content: 'ignored' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'Hello.' },
        { role: 'user', content: 'Move the vet to Friday' },
      ],
      preload: { profileText: 'IDENTITY: James' },
      onStatus: (line) => statuses.push(line),
      deps: { ctx, agent: { callModel, runTool }, now: () => Date.parse('2026-10-03T17:00:00Z') },
    });
    expect(r).toMatchObject({
      ok: true,
      reply: 'Want me to move the vet to Friday?',
      card: [{ cid: 'c1', op: 'change', id: 'v1' }],
      tools: ['propose_changes'],
    });
    expect(r.prompt_version).toMatch(/^chat-/);
    expect(statuses).toEqual(['Getting the changes ready']);
    // the conversation before, and their message with what Gremly knows ahead of it
    const turns = seen[0].turns;
    expect(turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user']);
    expect(turns.at(-1).text).toContain('Today is Saturday 3 October 2026, and it is 10:00am');
    expect(turns.at(-1).text).toContain('ABOUT THIS USER\nIDENTITY: James');
    expect(turns.at(-1).text.endsWith('THEIR MESSAGE\nMove the vet to Friday')).toBe(true);
    expect(seen[0].system).toContain('YOUR JOB HERE\nThis is a conversation with the person');
  });

  it("knows their week when the app sends it, and puts the week's button under the reply", async () => {
    const seen = [];
    const callModel = async (args) => {
      seen.push({ ...args, turns: args.turns.map((t) => ({ ...t })) });
      // with their week known the reply comes with the button; without it, alone
      const canOffer = args.tools.some((t) => t.name === 'offer_week');
      return {
        ok: true,
        provider: 'openai-responses',
        text: 'The button below opens your weekly review.',
        raw: [],
        calls: canOffer ? [{ id: 'c1', nativeId: 'c1', name: 'offer_week', args: {} }] : [],
      };
    };
    const turn = (week) =>
      runChatTurn({
        env: {},
        userId: 'u1',
        timezone: 'America/Los_Angeles',
        messages: [{ role: 'user', content: 'Can we plan my week?' }],
        preload: { found: '' },
        week,
        // Saturday 3 October 2026, 10am in Los Angeles
        deps: { ctx, agent: { callModel }, now: () => Date.parse('2026-10-03T17:00:00Z') },
      });
    const r = await turn({
      weekly_day: 0,
      days_off: [0, 6],
      review: null,
      extra_used: false,
      // a review is never under way in Ask Gremly, whatever is sent
      under_way: { step: 'shape', first: '2026-10-05', last: '2026-10-11' },
    });
    expect(r).toMatchObject({
      ok: true,
      reply: 'The button below opens your weekly review.',
      offer: { kind: 'week', done: false },
    });
    expect(seen[0].system).toContain('put the button to it under your reply with offer_week');
    expect(seen[0].tools.map((t) => t.name)).toEqual([
      'find_items',
      'get_item',
      'get_day',
      'recall',
      'web_search',
      'propose_changes',
      'offer_week',
      'track_tasks',
    ]);
    const said = seen[0].turns.at(-1).text;
    expect(said).toContain('THEIR WEEK: Their weekly review is on Sundays');
    expect(said).not.toContain('THE WEEKLY REVIEW, UNDER WAY');
    expect(said).not.toContain('is under way in this thread');

    // without their week the turn is what it was: no line, no tool, no button
    seen.length = 0;
    const plain = await turn(null);
    expect(plain.offer).toBeUndefined();
    expect(seen[0].system).not.toContain('offer_week');
    expect(seen[0].tools.map((t) => t.name)).not.toContain('offer_week');
    expect(seen[0].turns.at(-1).text).not.toContain('THEIR WEEK');
  });

  it('reads the items its message names before the first step: started alongside triage, or here', async () => {
    const contexts = [];
    const callModel = async (args) => {
      contexts.push(args.turns.at(-1).text);
      return {
        ok: true,
        provider: 'openai-responses',
        text: 'Friday is clear.',
        calls: [],
        raw: [],
      };
    };
    const base = {
      env: {},
      userId: 'u1',
      timezone: 'UTC',
      messages: [{ role: 'user', content: 'Move the vet to Friday' }],
    };
    await runChatTurn({
      ...base,
      preload: { found: Promise.resolve('THEIR ITEMS THAT SHARE WORDS: the vet') },
      deps: { ctx, agent: { callModel } },
    });
    expect(contexts[0]).toContain('THEIR ITEMS THAT SHARE WORDS: the vet');
    const asked = [];
    const db = {
      rpc: async (fn, a) => {
        asked.push([fn, a.p_query]);
        return [{ type: 'todo', id: 'v1', title: 'Vet', day: null, time: null, state: 'open' }];
      },
    };
    await runChatTurn({ ...base, deps: { ctx: { ...ctx, db }, agent: { callModel } } });
    expect(asked).toEqual([['find_items', 'Move the vet to Friday']]);
    expect(contexts[1]).toContain(
      '(open ones, searched just now)\n1 found, best first:\n- todo | id v1 | Vet',
    );
  });

  it('counts today from their day when it is given: after midnight it is still yesterday', async () => {
    const seen = [];
    const tools = [];
    const callModel = async (args) => {
      seen.push(args.turns.at(-1).text);
      return {
        ok: true,
        provider: 'openai-responses',
        text: 'Sunday is light.',
        calls: [],
        raw: [],
      };
    };
    const runTool = async (toolCtx) => {
      tools.push(toolCtx.today);
      return { ok: true, text: '', result: {} };
    };
    const base = {
      env: {},
      userId: 'u1',
      timezone: 'America/Los_Angeles',
      messages: [{ role: 'user', content: "What's on tomorrow?" }],
      // 1:46am on Sunday 4 October where they are
      deps: {
        ctx,
        agent: { callModel, runTool },
        now: () => Date.parse('2026-10-04T08:46:00Z'),
      },
    };
    // their day ends at 3am, so it is still Saturday for them
    await runChatTurn({ ...base, preload: { found: '', today: '2026-10-03' } });
    expect(seen[0]).toContain('Today is Saturday 3 October 2026, and it is 1:46am');
    // with no day given it is the calendar's date, as before
    await runChatTurn({ ...base, preload: { found: '' } });
    expect(seen[1]).toContain('Today is Sunday 4 October 2026, and it is 1:46am');
  });

  it('names the days of the items a message finds from their day too', async () => {
    const env = { SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_KEY: 'test-key' };
    // 1:46am on Sunday 4 October where they are
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-04T08:46:00Z'));
    jest.spyOn(global, 'fetch').mockImplementation(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify([
          { type: 'todo', id: 'v1', title: 'Vet', day: '2026-10-04', time: null, state: 'open' },
        ]),
    }));
    const args = { userId: 'u1', timezone: 'America/Los_Angeles', message: 'the vet' };
    // their day ends at 3am, so Sunday is still tomorrow for them
    const theirs = await prefetchForChat(env, { ...args, today: Promise.resolve('2026-10-03') });
    expect(theirs).toContain('Vet | Sun 4 Oct (tomorrow)');
    // with no day given, and with one that could not be read, it is the calendar's date
    expect(await prefetchForChat(env, args)).toContain('Vet | Sun 4 Oct (today)');
    expect(
      await prefetchForChat(env, { ...args, today: Promise.reject(new Error('down')) }),
    ).toContain('Vet | Sun 4 Oct (today)');
  });

  it('says it could not finish, so the quick lane answers', async () => {
    const callModel = async () => ({ ok: false, error: 'down' });
    const r = await runChatTurn({
      env: {},
      userId: 'u1',
      timezone: 'UTC',
      messages: [{ role: 'user', content: 'What is on Friday?' }],
      deps: { ctx, agent: { callModel } },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('down');
    expect((await runChatTurn({ env: {}, userId: 'u1', messages: [], deps: { ctx } })).ok).toBe(
      false,
    );
  });
});
