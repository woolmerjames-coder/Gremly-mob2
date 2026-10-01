import { renderHook, act } from '@testing-library/react-native';
import { usePlanFlow } from '../usePlanFlow';
import { callPlanPick } from '../../cortex/CortexClient';
import { lockPlanItems, poolFromStore, meetingsFromStore, saveEstimates } from '../storePlan';
import { patchDailyThreadMeta } from '../../repo/dailyThreadRepo';
import type { SpaceChatMessage } from '../../types';

jest.mock('../../cortex/CortexClient', () => ({ callPlanPick: jest.fn() }));
jest.mock('../storePlan', () => ({
  poolFromStore: jest.fn(),
  meetingsFromStore: jest.fn(),
  saveEstimates: jest.fn(),
  lockPlanItems: jest.fn(),
  candidateFromStore: jest.fn(() => null),
}));
jest.mock('../../repo/dailyThreadRepo', () => ({
  patchDailyThreadMeta: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('../../brief/time', () => ({ minutesOfDay: () => 760 }));
jest.mock('../../brief/todayThread', () => ({
  useTodayThread: { getState: () => ({ patchMeta: jest.fn() }) },
}));
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => ({}) },
}));
jest.mock('../../store/selectors', () => ({ selectOverdueTodos: () => [] }));

const POOL = [
  {
    id: 'social',
    kind: 'habit',
    title: 'Social posts',
    minutes: 30,
    why: '0 of 3 this week, behind',
    window: null,
    source: 'behind',
  },
  {
    id: 'oat',
    kind: 'todo',
    title: 'Buy Oat Milk',
    minutes: null,
    why: 'Due today',
    window: null,
    source: 'due',
  },
  {
    id: 'fact-1',
    kind: 'reach',
    title: 'Book the car service',
    minutes: null,
    why: 'Overdue for a service',
    window: null,
    source: 'reach',
    fromFact: true,
  },
];

function harness() {
  const messages: SpaceChatMessage[] = [];
  const deps = {
    threadId: 't1',
    date: '2026-09-30',
    messages,
    appendBriefMessage: jest.fn(async (role: string, content: string, meta: any) => {
      const m = {
        id: `m${messages.length + 1}`,
        role,
        content,
        metadata_json: meta,
      } as unknown as SpaceChatMessage;
      messages.push(m);
      return m;
    }),
    patchMessageMetadata: jest.fn(async (id: string, patch: any) => {
      const m = messages.find((x) => x.id === id) as any;
      if (m) m.metadata_json = { ...m.metadata_json, ...patch };
    }),
  };
  const hook = renderHook(() => usePlanFlow({ ...deps, messages: [...messages] }));
  return { hook, messages, deps };
}

beforeEach(() => {
  (patchDailyThreadMeta as jest.Mock).mockResolvedValue(null);
  (poolFromStore as jest.Mock).mockReturnValue(POOL);
  (meetingsFromStore as jest.Mock).mockReturnValue([
    { id: 'm', title: 'Search connect', start: 720, end: 795 },
  ]);
  (callPlanPick as jest.Mock).mockResolvedValue({
    ok: true,
    data: {
      intro: "Here's a light afternoon, with the car service since it's overdue.",
      picks: [
        {
          id: 'social',
          window: [795, 1320],
          minutes: 30,
          estimated: false,
          reason: 'Behind this week',
        },
        { id: 'oat', window: [795, 1320], minutes: 15, estimated: true, reason: 'Due today' },
        {
          id: 'fact-1',
          window: [900, 1080],
          minutes: 20,
          estimated: true,
          reason: 'Overdue for a service',
        },
      ],
    },
  });
});

describe('planning in the thread', () => {
  it('adds Gremly’s line, the plan card and suggested changes', async () => {
    const { hook, messages } = harness();
    await act(async () => {
      await hook.result.current.start({
        type: 'brief-offer',
        kind: 'plan',
        buttons: [],
        plan_from: 795,
      });
    });
    const types = messages.map((m) => (m.metadata_json as any).type);
    expect(types).toEqual(['brief-text', 'brief-plan', 'brief-offer']);
    expect(messages[0].content).toMatch(/light afternoon/);
    const plan = messages[1].metadata_json as any;
    expect(plan).toMatchObject({ status: 'proposal', version: 1, date: '2026-09-30', from: 795 });
    expect(plan.items.map((x: any) => [x.id, x.start])).toEqual([
      ['social', 810],
      ['oat', 855],
      ['fact-1', 900],
    ]);
    expect((messages[2].metadata_json as any).kind).toBe('plan_edit');
    expect(saveEstimates).toHaveBeenCalledWith([
      { id: 'oat', kind: 'todo', minutes: 15 },
      { id: 'fact-1', kind: 'reach', minutes: 20 },
    ]);
  });

  it('plans from the candidates when the picker cannot be reached', async () => {
    (callPlanPick as jest.Mock).mockResolvedValue({ ok: false, error: 'offline' });
    const { hook, messages } = harness();
    await act(async () => {
      await hook.result.current.start(null);
    });
    const plan = messages.find((m) => (m.metadata_json as any).type === 'brief-plan')!
      .metadata_json as any;
    // the reach is never added without the picker
    expect(plan.items.map((x: any) => x.id)).toEqual(['social', 'oat']);
  });

  it('locks a plan in and says so', async () => {
    const { hook, messages, deps } = harness();
    await act(async () => {
      await hook.result.current.start(null);
    });
    (lockPlanItems as jest.Mock).mockResolvedValue({
      created: ['Book the car service'],
      items: [],
    });
    const planMsg = messages.find((m) => (m.metadata_json as any).type === 'brief-plan')!;
    const fresh = renderHook(() => usePlanFlow({ ...deps, messages: [...messages] }));
    await act(async () => {
      await fresh.result.current.lock(planMsg);
    });
    expect(lockPlanItems).toHaveBeenCalledWith('2026-09-30', expect.any(Array), []);
    expect((planMsg.metadata_json as any).status).toBe('locked');
    expect(messages[messages.length - 1].content).toBe(
      "Locked in. It's all on Today, with plenty of room left. I've added book the car service as a todo too.",
    );
  });

  it('turns a typed change into a new version and folds the old one', async () => {
    const { hook, messages, deps } = harness();
    await act(async () => {
      await hook.result.current.start(null);
    });
    (callPlanPick as jest.Mock).mockResolvedValue({
      ok: true,
      data: { isPlanChange: true, ops: [{ op: 'remove', id: 'oat', window: null }] },
    });
    const fresh = renderHook(() => usePlanFlow({ ...deps, messages: [...messages] }));
    let used = false;
    await act(async () => {
      used = await fresh.result.current.editFromText('skip the oat milk today');
    });
    expect(used).toBe(true);
    const plans = messages.filter((m) => (m.metadata_json as any).type === 'brief-plan');
    expect(plans.map((p) => (p.metadata_json as any).status)).toEqual(['replaced', 'proposal']);
    expect((plans[1].metadata_json as any).items.map((x: any) => x.id)).not.toContain('oat');
    expect(messages.some((m) => m.role === 'user' && m.content === 'skip the oat milk today')).toBe(
      true,
    );
  });

  it('leaves a message that is not a plan change to chat', async () => {
    const { hook, messages, deps } = harness();
    await act(async () => {
      await hook.result.current.start(null);
    });
    (callPlanPick as jest.Mock).mockResolvedValue({
      ok: true,
      data: { isPlanChange: false, ops: [] },
    });
    const fresh = renderHook(() => usePlanFlow({ ...deps, messages: [...messages] }));
    let used = true;
    await act(async () => {
      used = await fresh.result.current.editFromText('how was my week?');
    });
    expect(used).toBe(false);
  });
});
