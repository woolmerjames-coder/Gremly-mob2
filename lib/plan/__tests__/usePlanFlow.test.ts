import { renderHook, act } from '@testing-library/react-native';
import { usePlanFlow } from '../usePlanFlow';
import { PLAN_COPY } from '../planFlow';
import { callPlanPick } from '../../cortex/CortexClient';
import {
  dayRecordFromStore,
  lockPlanItems,
  poolForDay,
  meetingsFromStore,
  saveEstimates,
} from '../storePlan';
import { patchDailyThreadMeta } from '../../repo/dailyThreadRepo';
import type { SpaceChatMessage } from '../../types';

jest.mock('../../cortex/CortexClient', () => ({ callPlanPick: jest.fn() }));
let mockLate = false;
jest.mock('../../date/DateService', () => ({
  getDateService: () => ({
    // after midnight the clock says Thursday; the person's day is still Wednesday
    today: () => (mockLate ? '2026-10-01' : '2026-09-30'),
    ritualDay: () => '2026-09-30',
    isInLateNightPeriod: () => mockLate,
  }),
  nowTimestamp: () => '2026-09-30T20:00:00Z',
}));
jest.mock('../storePlan', () => ({
  poolForDay: jest.fn(),
  meetingsFromStore: jest.fn(),
  dayRecordFromStore: jest.fn(),
  saveEstimates: jest.fn(),
  lockPlanItems: jest.fn(),
  candidateFromStore: jest.fn(() => null),
}));
jest.mock('../../repo/dailyThreadRepo', () => ({
  patchDailyThreadMeta: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('../../brief/time', () => ({
  minutesOfDay: () => (mockLate ? 30 : 760),
  minutesOfTheirDay: () => (mockLate ? 24 * 60 + 30 : 760),
  localMinutesToIso: (d: string, m: number) => `${d}T${m}`,
  hhmmToMinutes: (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)),
  localDateOf: (iso: string) => iso.slice(0, 10),
}));
jest.mock('../../brief/todayThread', () => ({
  useTodayThread: { getState: () => ({ patchMeta: jest.fn() }) },
}));
jest.mock('../../store/useGremlyStore', () => {
  const state = { todos: [], habits: [] };
  const useGremlyStore: any = (sel: (s: any) => unknown) => sel(state);
  useGremlyStore.getState = () => state;
  return { useGremlyStore };
});
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

/** Set times and where planning stops, for a travel day */
let extra: { blocks?: any[]; planEnd?: number; travel?: any } = {};

/** The day record as the store would build it: meetings, plus `extra`. */
function recordFor(d: string) {
  const meetings = ((meetingsFromStore as jest.Mock)(d) ?? []) as { start: number; end: number }[];
  const blocks = extra.blocks ?? [];
  return {
    date: d,
    travel: extra.travel ?? null,
    away: null,
    blocks,
    busy: [
      ...meetings.map((m) => ({ start: m.start, end: m.end })),
      ...blocks.map((b: any) => ({ start: b.start, end: b.end ?? b.start + 30 })),
    ],
    planEnd: extra.planEnd ?? 1320,
    duringTravel: [],
    chip: null,
  };
}

beforeEach(() => {
  extra = {};
  (dayRecordFromStore as jest.Mock).mockImplementation(recordFor);
  (patchDailyThreadMeta as jest.Mock).mockResolvedValue(null);
  (poolForDay as jest.Mock).mockReturnValue(POOL);
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
  it('plans tomorrow from 8am, for that day', async () => {
    const { hook, messages } = harness();
    await act(async () => {
      await hook.result.current.start(null, { day: '2026-10-01' });
    });
    expect(callPlanPick).toHaveBeenCalledWith(
      expect.objectContaining({ gap_from: 480, now: 480, for_day: '2026-10-01' }),
    );
    expect(poolForDay).toHaveBeenCalledWith('2026-10-01');
    const plan = messages.find((m) => (m.metadata_json as any).type === 'brief-plan')!
      .metadata_json as any;
    expect(plan).toMatchObject({ date: '2026-10-01', from: 480 });
  });

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

  it('holds what was kept in Sweep, even when the picker leaves it out', async () => {
    (callPlanPick as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        intro: 'A light afternoon.',
        picks: [
          { id: 'social', window: [795, 1320], minutes: 30, estimated: false, reason: 'Behind' },
        ],
      },
    });
    const { hook, messages } = harness();
    await act(async () => {
      await hook.result.current.start({
        type: 'brief-offer',
        kind: 'follow_up',
        buttons: [],
        plan_from: 795,
        kept_ids: ['oat'],
      });
    });
    expect(callPlanPick).toHaveBeenCalledWith(
      expect.objectContaining({
        pool: expect.arrayContaining([expect.objectContaining({ id: 'oat', kept: true })]),
      }),
    );
    const plan = messages.find((m) => (m.metadata_json as any).type === 'brief-plan')!
      .metadata_json as any;
    // what they kept is theirs, so it claims its time first
    expect(plan.items.map((x: any) => [x.id, x.reason, !!x.chosen])).toEqual([
      ['oat', 'Kept for today', true],
      ['social', 'Behind', false],
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

  it('says yes to a plan and says so', async () => {
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
      await fresh.result.current.accept(planMsg);
    });
    expect(lockPlanItems).toHaveBeenCalledWith('2026-09-30', expect.any(Array), []);
    expect((planMsg.metadata_json as any).status).toBe('locked');
    expect(messages[messages.length - 1].content).toBe(
      "That's all on Today, with plenty of room left. I've added Book the car service as a todo too.",
    );
  });

  describe('after midnight, before the day ends', () => {
    beforeEach(() => {
      mockLate = true;
    });
    afterEach(() => {
      mockLate = false;
    });

    it('plans the day the clock already shows as another day, from the morning', async () => {
      const { hook, messages } = harness();
      await act(async () => {
        await hook.result.current.start(null, { day: '2026-10-01' });
      });
      expect(poolForDay).toHaveBeenCalledWith('2026-10-01');
      const plan = messages.find((m) => (m.metadata_json as any).type === 'brief-plan')!
        .metadata_json as any;
      expect(plan.date).toBe('2026-10-01');
      // from 8am, not from half past midnight
      expect(plan.from).toBe(8 * 60);
      expect(plan.items.every((x: any) => x.start >= 8 * 60)).toBe(true);
    });

    it('says it will be on Today in the morning, and that the brief will bring a plan put aside', async () => {
      const { hook, messages, deps } = harness();
      await act(async () => {
        await hook.result.current.start(null, { day: '2026-10-01' });
      });
      (lockPlanItems as jest.Mock).mockResolvedValue({ created: [], items: [] });
      const planMsg = messages.find((m) => (m.metadata_json as any).type === 'brief-plan')!;
      const fresh = renderHook(() => usePlanFlow({ ...deps, messages: [...messages] }));
      await act(async () => {
        await fresh.result.current.accept(planMsg);
      });
      expect(lockPlanItems).toHaveBeenCalledWith('2026-10-01', expect.any(Array), []);
      expect(messages[messages.length - 1].content).toBe(
        "Done. It'll be on Today when you wake up.",
      );
      await act(async () => {
        await fresh.result.current.dismiss(planMsg);
      });
      expect(messages[messages.length - 1].content).toBe(
        'No problem. The morning brief will bring it.',
      );
    });

    it('has no room left in the day being wrapped up', async () => {
      const { hook, messages } = harness();
      await act(async () => {
        await hook.result.current.start(null);
      });
      expect(messages.some((m) => (m.metadata_json as any).type === 'brief-plan')).toBe(false);
      expect(messages[messages.length - 1].content).toBe(PLAN_COPY.noRoom);
    });
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

  it('on a travel day, plans only until they set off and tells the picker so', async () => {
    // tomorrow: leaving for the airport at 12:30
    extra = {
      planEnd: 750,
      travel: { label: 'Flying to San Diego', departs: 750 },
      blocks: [{ id: 'b', title: 'Leave for the airport', start: 750, end: null, travel: true }],
    };
    (meetingsFromStore as jest.Mock).mockReturnValue([]);
    (callPlanPick as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        intro: 'A short morning before you head off.',
        picks: [
          { id: 'oat', window: [480, 1320], minutes: 15, estimated: true, reason: 'Due today' },
          { id: 'social', window: [480, 1320], minutes: 30, estimated: false, reason: 'Behind' },
        ],
      },
    });
    const { hook, messages } = harness();
    await act(async () => {
      await hook.result.current.start(null, { day: '2026-10-01' });
    });
    expect(callPlanPick).toHaveBeenCalledWith(
      expect.objectContaining({
        plan_end: 750,
        travel: { label: 'Flying to San Diego', departs: 750 },
        fixed: [{ title: 'Leave for the airport', start: 750, end: null, travel: true }],
      }),
    );
    const plan = messages.find((m) => (m.metadata_json as any).type === 'brief-plan')!
      .metadata_json as any;
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.items.every((x: any) => x.end <= 750)).toBe(true);
  });

  it('says there is no room once they have set off', async () => {
    // 12:40 now, set off at 12:30
    extra = { planEnd: 750, travel: { label: 'Flying to San Diego', departs: 750 } };
    const { hook, messages } = harness();
    await act(async () => {
      await hook.result.current.start(null);
    });
    expect(callPlanPick).not.toHaveBeenCalled();
    expect(messages.map((m) => m.content)).toEqual([PLAN_COPY.noRoomTravel]);
  });
});
