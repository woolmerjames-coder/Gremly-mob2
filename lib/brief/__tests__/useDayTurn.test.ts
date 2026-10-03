/**
 * A message in today's thread: the agent's reply and card (agent plan step
 * 7), or the day turn's when the agent is off or could not finish; Apply
 * makes the changes and re-fits the plan once; a day turn answer that is not
 * about the day is left to normal chat.
 */
import { renderHook, act } from '@testing-library/react-native';
import {
  useDayTurn,
  buildDayTurnRequest,
  buildBriefTurnRequest,
  cardOutcomeWords,
  DAY_TURN_COPY,
} from '../useDayTurn';
import { callBriefTurn } from '../../cortex/CortexClient';
import { applyCardChanges, applyDayChanges } from '../applyChanges';
import { patchDailyThreadMeta } from '../../repo/dailyThreadRepo';
import type { SpaceChatMessage } from '../../types';

jest.mock('../../cortex/CortexClient', () => ({ callBriefTurn: jest.fn() }));
jest.mock('../../repo/dailyThreadRepo', () => ({
  patchDailyThreadMeta: jest.fn(async () => null),
}));
const mockPatchMeta = jest.fn();
jest.mock('../todayThread', () => ({
  useTodayThread: {
    getState: () => ({
      thread: { id: 't1', metadata_json: { agent_tasks: [{ ask: 'Pack', status: 'done' }] } },
      patchMeta: mockPatchMeta,
    }),
  },
}));
jest.mock('../applyChanges', () => ({
  applyDayChanges: jest.fn(),
  applyCardChanges: jest.fn(),
  changedEventText: (n: number) => `Updated ${n} things`,
  undoneEventText: (n: number) => `Put back ${n} things`,
}));
jest.mock('../time', () => ({
  minutesOfDay: () => 544,
  localDateOf: (iso: string) => iso.slice(0, 10),
}));
jest.mock('../../date/DateService', () => ({
  getDateService: () => ({
    getTimezone: () => 'America/Los_Angeles',
    addDays: (d: string, n: number) => {
      const x = new Date(`${d}T12:00:00Z`);
      x.setUTCDate(x.getUTCDate() + n);
      return x.toISOString().slice(0, 10);
    },
    // for the words of a card's rows
    isToday: () => false,
    isTomorrow: () => false,
    fromLocalDate: (d: string) => new Date(`${d}T12:00:00`),
  }),
}));
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: {
    getState: () => ({
      todos: [
        { id: 'mum', name: 'Call Mum', due_day: '2026-10-02', created_at: '2026-09-30T10:00:00Z' },
        {
          id: 'deck',
          name: 'Send the deck',
          due_day: '2026-10-03',
          created_at: '2026-09-20T10:00:00Z',
        },
        { id: 'old', name: 'Old idea', due_day: null, created_at: '2026-08-01T10:00:00Z' },
        {
          id: 'late',
          name: 'Timesheets',
          due_day: '2026-09-30',
          created_at: '2026-09-20T10:00:00Z',
        },
      ],
      habits: [{ id: 'run', name: 'Run' }],
    }),
  },
}));
jest.mock('../../store/selectors', () => ({ selectHabitsDueToday: () => [{ id: 'run' }] }));
jest.mock('../../plan/storePlan', () => ({
  meetingsFromStore: () => [{ id: 'm', title: 'Team huddle', start: 480, end: 510 }],
  dayRecordFromStore: () => ({
    travel: { label: 'Flying to San Diego', departs: null },
    blocks: [],
    planEnd: 1320,
  }),
}));

const PLAN = {
  id: 'p1',
  role: 'system',
  content: '',
  metadata_json: {
    type: 'brief-plan',
    version: 1,
    status: 'proposal',
    date: '2026-10-02',
    items: [{ id: 'mum', kind: 'todo', title: 'Call Mum', start: 710, end: 730 }],
    unplaced: [],
  },
} as unknown as SpaceChatMessage;

function harness(onRender?: (r: ReturnType<typeof useDayTurn>) => void) {
  const messages: SpaceChatMessage[] = [PLAN];
  const deps = {
    threadId: 't1',
    date: '2026-10-02',
    messages,
    appendBriefMessage: jest.fn(async (role: string, content: string, meta: any) => {
      const m = { id: `m${messages.length + 1}`, role, content, metadata_json: meta } as any;
      messages.push(m);
      return m;
    }),
    patchMessageMetadata: jest.fn(async (id: string, patch: any) => {
      const m = messages.find((x) => x.id === id) as any;
      m.metadata_json = { ...m.metadata_json, ...patch };
    }),
    plan: {
      livePlan: PLAN as SpaceChatMessage | null,
      start: jest.fn(async (_day: string) => undefined),
      reviseAfterChanges: jest.fn(async () => undefined),
      pauseSync: jest.fn(),
      resumeSync: jest.fn(),
    },
    continueBrief: jest.fn(async () => undefined),
  };
  const hook = renderHook(() => {
    const r = useDayTurn(deps);
    onRender?.(r);
    return r;
  });
  return { hook, deps, messages };
}

const CHANGES = [
  {
    cid: 'c1',
    kind: 'retime',
    label: 'Call Mum at 12pm',
    id: 'mum',
    item: 'todo',
    title: 'Call Mum',
    start: 720,
  },
  {
    cid: 'c2',
    kind: 'add_block',
    label: 'Leave for the airport at 12:30pm',
    title: 'Leave for the airport',
    start: 750,
    travel: true,
  },
];

describe('the day turn, when it answers', () => {
  it('tells the worker about the day, the plan and their items, most relevant first', () => {
    const req = buildDayTurnRequest('call mum at 12', null, '2026-10-02', [PLAN], PLAN);
    expect(req.items.map((x) => [x.id, x.note])).toEqual([
      ['mum', 'in the plan'],
      ['late', 'past its day'],
      ['deck', 'upcoming'],
      ['run', 'habit today'],
    ]);
    expect(req.record).toEqual({
      travel: { label: 'Flying to San Diego', departs: null },
      blocks: [],
      plan_end: 1320,
    });
    expect(req.plan?.items).toEqual([
      { id: 'mum', kind: 'todo', title: 'Call Mum', start: 710, end: 730 },
    ]);
  });

  it('a message about the day: the reply, then one card with every change', async () => {
    (callBriefTurn as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        engine: 'day_turn',
        about_day: true,
        reply: "Here's what I'd change for this morning.",
        changes: CHANGES,
        checklist: [],
      },
    });
    const { hook, messages, deps } = harness();
    let handled = false;
    await act(async () => {
      handled = await hook.result.current.run(
        'call mum at 12, leave for the airport at 12:30',
        null,
      );
    });
    expect(handled).toBe(true);
    expect(messages.slice(1).map((m) => [m.role, (m.metadata_json as any).type ?? null])).toEqual([
      ['user', null],
      ['assistant', 'brief-text'],
      ['system', 'brief-changes'],
    ]);
    expect((messages[3].metadata_json as any).status).toBe('open');
    // nothing applied yet, and the brief waits for the card
    expect(applyDayChanges).not.toHaveBeenCalled();
    expect(deps.continueBrief).not.toHaveBeenCalled();
  });

  it('Apply makes the ticked changes, says so, re-fits the plan once and carries on', async () => {
    (callBriefTurn as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        engine: 'day_turn',
        about_day: true,
        reply: 'Sure.',
        changes: CHANGES,
        checklist: [],
      },
    });
    (applyDayChanges as jest.Mock).mockResolvedValue({
      done: ['c1', 'c2'],
      failed: [],
      plan: { add: [], remove: [], pin: [{ id: 'mum', start: 720 }] },
      frameChanged: true,
    });
    const { hook, messages, deps } = harness();
    await act(async () => {
      await hook.result.current.run('call mum at 12, leave at 12:30', null);
    });
    const card = messages[3];
    await act(async () => {
      await hook.result.current.apply(card, []);
    });
    expect(applyDayChanges).toHaveBeenCalledWith(
      CHANGES,
      expect.objectContaining({ hasPlan: true }),
    );
    expect(card.metadata_json as any).toMatchObject({ status: 'applied', applied: ['c1', 'c2'] });
    expect(messages[4].content).toBe('Updated 2 things');
    expect(deps.plan.reviseAfterChanges).toHaveBeenCalledWith({
      add: [],
      remove: [],
      pin: [{ id: 'mum', start: 720 }],
    });
    expect(deps.plan.pauseSync).toHaveBeenCalled();
    expect(deps.plan.resumeSync).toHaveBeenCalled();
    expect(deps.continueBrief).toHaveBeenCalled();
  });

  it('Undo puts everything back, says so, and moves the plan back to how it was', async () => {
    (callBriefTurn as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        engine: 'day_turn',
        about_day: true,
        reply: 'Sure.',
        changes: CHANGES,
        checklist: [],
      },
    });
    const revert = jest.fn(async () => undefined);
    (applyDayChanges as jest.Mock).mockResolvedValue({
      done: ['c1', 'c2'],
      failed: [],
      plan: { add: [], remove: [], pin: [{ id: 'mum', start: 720 }] },
      frameChanged: true,
      revert,
    });
    const { hook, messages, deps } = harness();
    await act(async () => {
      await hook.result.current.run('call mum at 12, leave at 12:30', null);
    });
    const card = messages[3];
    expect(hook.result.current.canUndo(card.id)).toBe(false);
    await act(async () => {
      await hook.result.current.apply(card, []);
    });
    expect(hook.result.current.canUndo(card.id)).toBe(true);
    await act(async () => {
      await hook.result.current.undo(card);
    });
    expect(revert).toHaveBeenCalledTimes(1);
    expect((card.metadata_json as any).status).toBe('undone');
    expect(messages[messages.length - 1].content).toBe('Put back 2 things');
    // Call Mum goes back to 11:50, where the plan had it
    expect(deps.plan.reviseAfterChanges).toHaveBeenLastCalledWith({
      add: [],
      remove: [],
      pin: [{ id: 'mum', start: 710 }],
    });
    expect(hook.result.current.canUndo(card.id)).toBe(false);
  });

  it('Not now changes nothing and the brief carries on', async () => {
    (callBriefTurn as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        engine: 'day_turn',
        about_day: true,
        reply: 'Sure.',
        changes: CHANGES,
        checklist: [],
      },
    });
    const { hook, messages, deps } = harness();
    await act(async () => {
      await hook.result.current.run('call mum at 12', null);
    });
    await act(async () => {
      await hook.result.current.dismiss(messages[3]);
    });
    expect((messages[3].metadata_json as any).status).toBe('dismissed');
    expect(messages[4].content).toBe(DAY_TURN_COPY.dismissed);
    expect(applyDayChanges).not.toHaveBeenCalled();
    expect(deps.continueBrief).toHaveBeenCalled();
  });

  it('a question back waits for their answer', async () => {
    (callBriefTurn as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        engine: 'day_turn',
        about_day: true,
        reply: 'What time do you need to leave for the airport?',
        changes: [],
        checklist: [{ ask: 'Plan around the flight', status: 'needs_answer' }],
      },
    });
    const { hook, deps } = harness();
    await act(async () => {
      await hook.result.current.run('we fly today, plan around it', null);
    });
    expect(deps.continueBrief).not.toHaveBeenCalled();
  });

  it('anything not about the day, or no answer at all, goes to normal chat', async () => {
    (callBriefTurn as jest.Mock).mockResolvedValue({
      ok: true,
      data: { engine: 'day_turn', about_day: false },
    });
    const { hook, messages } = harness();
    let handled = true;
    await act(async () => {
      handled = await hook.result.current.run('what is the capital of Peru?', null);
    });
    expect(handled).toBe(false);
    expect(messages).toHaveLength(1);
    (callBriefTurn as jest.Mock).mockResolvedValue({ ok: false, error: 'offline' });
    await act(async () => {
      handled = await hook.result.current.run('call mum at 12', null);
    });
    expect(handled).toBe(false);
  });
});

const CARD = [
  {
    cid: 'c1',
    op: 'plan',
    type: 'todo',
    id: 'mum',
    title: 'Call Mum',
    plan: { kind: 'plan_move', id: 'mum', item: 'todo', start: 720, title: 'Call Mum' },
  },
  {
    cid: 'c2',
    op: 'plan',
    type: null,
    id: null,
    title: 'Leave for the airport',
    plan: {
      kind: 'add_block',
      start: 750,
      end: null,
      travel: true,
      title: 'Leave for the airport',
    },
  },
];

describe('the agent', () => {
  beforeEach(() => {
    (callBriefTurn as jest.Mock).mockReset();
    (patchDailyThreadMeta as jest.Mock).mockClear();
    mockPatchMeta.mockClear();
  });

  it('is told the day turn request, where they are and the task list so far', () => {
    const req = buildBriefTurnRequest('call mum at 12', null, '2026-10-02', [PLAN], PLAN, 't1');
    expect(req).toMatchObject({
      text: 'call mum at 12',
      timezone: 'America/Los_Angeles',
      tasks: [{ ask: 'Pack', status: 'done' }],
    });
    expect(req.items.map((x) => x.id)).toEqual(['mum', 'late', 'deck', 'run']);
  });

  it('hears what each card came to, so a choice made on a card stands', () => {
    const card = [
      {
        cid: 'c1',
        op: 'log',
        type: 'habit',
        id: 'blink',
        title: 'Blinkist',
        days: ['2026-10-02'],
      },
      {
        cid: 'c2',
        op: 'plan',
        id: 'deck',
        title: 'Finish the deck',
        plan: { kind: 'plan_remove', id: 'deck' },
      },
    ];
    const applied = {
      id: 'k1',
      role: 'system',
      content: '',
      metadata_json: {
        type: 'brief-changes',
        status: 'applied',
        changes: [],
        card,
        applied: ['c1'],
      },
    } as unknown as SpaceChatMessage;
    expect(cardOutcomeWords(applied.metadata_json as any)).toBe(
      "(On Gremly's card they accepted: Log Blinkist for Fri 2 Oct. They left out: Take Finish the deck out of today's plan.)",
    );
    expect(
      cardOutcomeWords({ type: 'brief-changes', status: 'dismissed', changes: [], card } as any),
    ).toBe(
      "(They set Gremly's card aside and changed nothing: Log Blinkist for Fri 2 Oct; Take Finish the deck out of today's plan.)",
    );
    expect(
      cardOutcomeWords({ type: 'brief-changes', status: 'open', changes: [], card } as any),
    ).toBeNull();
    const said = {
      id: 'u1',
      role: 'user',
      content: 'log blinkist and clear the deck',
      metadata_json: {},
    } as any;
    const req = buildBriefTurnRequest(
      'and now?',
      null,
      '2026-10-02',
      [PLAN, said, applied],
      PLAN,
      't1',
    );
    expect(req.history).toEqual([
      { role: 'user', content: 'log blinkist and clear the deck' },
      {
        role: 'user',
        content:
          "(On Gremly's card they accepted: Log Blinkist for Fri 2 Oct. They left out: Take Finish the deck out of today's plan.)",
      },
    ]);
  });

  it('shows what Gremly is doing while it works, then the reply and its card', async () => {
    const { hook, messages, deps } = harness();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    (callBriefTurn as jest.Mock).mockImplementation(async (_req: unknown, opts: any) => {
      opts.onStatus('Looking at your day');
      await gate;
      return {
        ok: true,
        data: {
          engine: 'agent',
          reply: "I'd move the call to 12 and keep 12:30 for leaving.",
          card: CARD,
          tasks: [{ ask: 'Call at 12', status: 'proposed' }],
          prompt_version: 'v',
        },
      };
    });
    let pending: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      pending = hook.result.current.run('call mum at 12, leave at 12:30', null);
      await Promise.resolve();
    });
    // while it works, with their message shown at once
    expect(hook.result.current.thinking).toBe(true);
    expect(hook.result.current.status).toBe('Looking at your day');
    expect(hook.result.current.pending).toBe('call mum at 12, leave at 12:30');
    let handled = false;
    await act(async () => {
      release();
      handled = await pending;
    });
    expect(handled).toBe(true);
    expect(hook.result.current.status).toBeNull();
    // saved into the thread, so no longer shown on its own
    expect(hook.result.current.pending).toBeNull();
    expect(messages.slice(1).map((m) => [m.role, (m.metadata_json as any).type ?? null])).toEqual([
      ['user', null],
      ['assistant', 'brief-text'],
      ['system', 'brief-changes'],
    ]);
    expect(messages[3].metadata_json).toMatchObject({
      type: 'brief-changes',
      changes: [],
      card: CARD,
      checklist: [{ ask: 'Call at 12', status: 'proposed' }],
      status: 'open',
    });
    expect(patchDailyThreadMeta).toHaveBeenCalledWith('t1', {
      agent_tasks: [{ ask: 'Call at 12', status: 'proposed' }],
    });
    expect(mockPatchMeta).toHaveBeenCalledWith('t1', {
      agent_tasks: [{ ask: 'Call at 12', status: 'proposed' }],
    });
    expect(deps.continueBrief).not.toHaveBeenCalled();
  });

  it('applies the ticked rows of its card through the change model', async () => {
    (callBriefTurn as jest.Mock).mockResolvedValue({
      ok: true,
      data: { engine: 'agent', reply: 'Sure.', card: CARD, tasks: [] },
    });
    (applyCardChanges as jest.Mock).mockResolvedValue({
      done: ['c1'],
      failed: [],
      plan: { add: [], remove: [], pin: [{ id: 'mum', start: 720 }] },
      frameChanged: false,
      revert: jest.fn(),
    });
    const { hook, messages, deps } = harness();
    await act(async () => {
      await hook.result.current.run('call mum at 12', null);
    });
    await act(async () => {
      await hook.result.current.apply(messages[3], ['c2']);
    });
    expect(applyCardChanges).toHaveBeenCalledWith(
      [CARD[0]],
      expect.objectContaining({ hasPlan: true }),
    );
    expect(messages[3].metadata_json).toMatchObject({ status: 'applied', applied: ['c1'] });
    expect(deps.plan.reviseAfterChanges).toHaveBeenCalledWith({
      add: [],
      remove: [],
      pin: [{ id: 'mum', start: 720 }],
    });
  });

  it("starts the planner when they accept Gremly's offer to plan the day", async () => {
    const offer = [
      { cid: 'c1', op: 'plan', title: 'Plan the rest of today', plan: { kind: 'plan_day' } },
    ];
    (callBriefTurn as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        engine: 'agent',
        reply: 'Want me to plan the rest of today?',
        card: offer,
        tasks: [],
      },
    });
    (applyCardChanges as jest.Mock).mockResolvedValue({
      done: ['c1'],
      failed: [],
      plan: { add: [], remove: [], pin: [] },
      frameChanged: false,
      planDay: true,
      revert: jest.fn(),
    });
    const { hook, messages, deps } = harness();
    deps.plan.livePlan = null;
    await act(async () => {
      await hook.result.current.run('what should I do today?', null);
    });
    const card = messages.find((m) => (m.metadata_json as any)?.type === 'brief-changes')!;
    await act(async () => {
      await hook.result.current.apply(card, []);
    });
    expect(deps.plan.start).toHaveBeenCalledWith('2026-10-02');
    expect(deps.continueBrief).not.toHaveBeenCalled();
  });

  it('waits when it asked something back, and carries on when there is nothing to do', async () => {
    (callBriefTurn as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        engine: 'agent',
        reply: 'What time do you need to leave?',
        card: [],
        tasks: [{ ask: 'Plan around the flight', status: 'needs_answer' }],
      },
    });
    const first = harness();
    await act(async () => {
      await first.hook.result.current.run('we fly today', null);
    });
    expect(first.deps.continueBrief).not.toHaveBeenCalled();

    (callBriefTurn as jest.Mock).mockResolvedValue({
      ok: true,
      data: { engine: 'agent', reply: 'Morning to you too.', card: [], tasks: [] },
    });
    const second = harness();
    await act(async () => {
      await second.hook.result.current.run('morning', null);
    });
    expect(second.deps.continueBrief).toHaveBeenCalled();
  });

  it('answers every message itself: only an empty answer goes to normal chat', async () => {
    (callBriefTurn as jest.Mock).mockResolvedValue({
      ok: true,
      data: { engine: 'agent', reply: '', card: [], tasks: [] },
    });
    const { hook, messages } = harness();
    let handled = true;
    await act(async () => {
      handled = await hook.result.current.run('hmm', null);
    });
    expect(handled).toBe(false);
    expect(messages).toHaveLength(1);
  });
});
