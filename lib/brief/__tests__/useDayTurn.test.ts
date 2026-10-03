/**
 * The day turn in today's thread: a message about the day becomes Gremly's
 * reply and one change card; Apply makes the changes and re-fits the plan
 * once; anything else is left to normal chat.
 */
import { renderHook, act } from '@testing-library/react-native';
import { useDayTurn, buildDayTurnRequest, DAY_TURN_COPY } from '../useDayTurn';
import { callDayTurn } from '../../cortex/CortexClient';
import { applyDayChanges } from '../applyChanges';
import type { SpaceChatMessage } from '../../types';

jest.mock('../../cortex/CortexClient', () => ({ callDayTurn: jest.fn() }));
jest.mock('../applyChanges', () => ({
  applyDayChanges: jest.fn(),
  changedEventText: (n: number) => `Updated ${n} things`,
  undoneEventText: (n: number) => `Put back ${n} things`,
}));
jest.mock('../time', () => ({
  minutesOfDay: () => 544,
  localDateOf: (iso: string) => iso.slice(0, 10),
}));
jest.mock('../../date/DateService', () => ({
  getDateService: () => ({
    addDays: (d: string, n: number) => {
      const x = new Date(`${d}T12:00:00Z`);
      x.setUTCDate(x.getUTCDate() + n);
      return x.toISOString().slice(0, 10);
    },
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

function harness() {
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
      livePlan: PLAN,
      reviseAfterChanges: jest.fn(async () => undefined),
      pauseSync: jest.fn(),
      resumeSync: jest.fn(),
    },
    continueBrief: jest.fn(async () => undefined),
  };
  const hook = renderHook(() => useDayTurn(deps));
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

describe('the day turn', () => {
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
    (callDayTurn as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
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
    (callDayTurn as jest.Mock).mockResolvedValue({
      ok: true,
      data: { about_day: true, reply: 'Sure.', changes: CHANGES, checklist: [] },
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
    (callDayTurn as jest.Mock).mockResolvedValue({
      ok: true,
      data: { about_day: true, reply: 'Sure.', changes: CHANGES, checklist: [] },
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
    (callDayTurn as jest.Mock).mockResolvedValue({
      ok: true,
      data: { about_day: true, reply: 'Sure.', changes: CHANGES, checklist: [] },
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
    (callDayTurn as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
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
    (callDayTurn as jest.Mock).mockResolvedValue({ ok: true, data: { about_day: false } });
    const { hook, messages } = harness();
    let handled = true;
    await act(async () => {
      handled = await hook.result.current.run('what is the capital of Peru?', null);
    });
    expect(handled).toBe(false);
    expect(messages).toHaveLength(1);
    (callDayTurn as jest.Mock).mockResolvedValue({ ok: false, error: 'offline' });
    await act(async () => {
      handled = await hook.result.current.run('call mum at 12', null);
    });
    expect(handled).toBe(false);
  });
});
