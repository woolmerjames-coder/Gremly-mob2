/**
 * @jest-environment node
 */
// Ask Gremly on the agent (workers/cortex/agent/chat.js): who it is on for,
// what it knows, and one turn end to end with a scripted model.

import { agentChatFor, chatContext, runChatTurn, AGENT_LANES, chatCacheKey } from '../chat.js';
import { chatAgentPersona, buildGeneralChatConfig } from '../../gremlyPersona.js';
import { configureModels } from '../../models.js';

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
