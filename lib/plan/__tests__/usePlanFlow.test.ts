import { renderHook, act } from '@testing-library/react-native';
import { addRoomFor, usePlanFlow } from '../usePlanFlow';
import { PLAN_COPY } from '../planFlow';
import { callPlanPick } from '../../cortex/CortexClient';
import {
  candidateFromStore,
  dayRecordFromStore,
  lockPlanItems,
  poolForDay,
  meetingsFromStore,
  saveEstimates,
} from '../storePlan';
import { patchDailyThreadMeta } from '../../repo/dailyThreadRepo';
import { applyChanges } from '../../changes/apply';
import { checkChange } from '../../changes/model';
import { contextFor } from '../../changes/snapshot';
import { laterBackDay, laterOffered } from '../../sweep/cardDays';
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
let mockTodos: any[] = [];
let mockHabits: any[] = [];
const mockUpdateTodo = jest.fn();
jest.mock('../../store/useGremlyStore', () => {
  // read when asked for: the list is made after this module is mocked
  const state = {
    get todos() {
      return mockTodos;
    },
    get habits() {
      return mockHabits;
    },
    weeklyDay: 0,
    updateTodo: (...args: unknown[]) => mockUpdateTodo(...args),
  };
  const useGremlyStore: any = (sel: (s: any) => unknown) => sel(state);
  useGremlyStore.getState = () => state;
  return { useGremlyStore };
});
jest.mock('../../store/selectors', () => ({ selectOverdueTodos: () => [] }));
// the todos that did not fit are moved through the change model
jest.mock('../../changes/apply', () => ({ applyChanges: jest.fn() }));
jest.mock('../../changes/model', () => ({ checkChange: jest.fn() }));
jest.mock('../../changes/snapshot', () => ({ contextFor: jest.fn() }));
jest.mock('../../sweep/cardDays', () => ({
  laterOffered: jest.fn(),
  laterBackDay: jest.fn(),
  backDayName: (day: string) => `on ${day}`,
}));

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
  mockTodos = [];
  mockHabits = [];
  (checkChange as jest.Mock).mockImplementation((raw: any) => ({
    ok: true,
    change: { ...raw, title: raw.id },
  }));
  (contextFor as jest.Mock).mockReturnValue({});
  (applyChanges as jest.Mock).mockImplementation(async (changes: any[]) => ({
    outcomes: changes.map((c) => ({ cid: c.cid, ok: true })),
    revertAll: jest.fn(),
  }));
  (laterOffered as jest.Mock).mockReturnValue(false);
  (laterBackDay as jest.Mock).mockReturnValue(null);
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
      await hook.result.current.start(null, { day: '2026-10-01', direct: true });
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
      await hook.result.current.start(
        {
          type: 'brief-offer',
          kind: 'plan',
          buttons: [],
          plan_from: 795,
        },
        { direct: true },
      );
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
      await hook.result.current.start(
        {
          type: 'brief-offer',
          kind: 'follow_up',
          buttons: [],
          plan_from: 795,
          kept_ids: ['oat'],
        },
        { direct: true },
      );
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
      await hook.result.current.start(null, { direct: true });
    });
    const plan = messages.find((m) => (m.metadata_json as any).type === 'brief-plan')!
      .metadata_json as any;
    // the reach is never added without the picker
    expect(plan.items.map((x: any) => x.id)).toEqual(['social', 'oat']);
  });

  it('says yes to a plan and says so', async () => {
    const { hook, messages, deps } = harness();
    await act(async () => {
      await hook.result.current.start(null, { direct: true });
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
        await hook.result.current.start(null, { day: '2026-10-01', direct: true });
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
        await hook.result.current.start(null, { day: '2026-10-01', direct: true });
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
        await hook.result.current.start(null, { direct: true });
      });
      expect(messages.some((m) => (m.metadata_json as any).type === 'brief-plan')).toBe(false);
      expect(messages[messages.length - 1].content).toBe(PLAN_COPY.noRoom);
    });
  });

  it('turns a typed change into a new version and folds the old one', async () => {
    const { hook, messages, deps } = harness();
    await act(async () => {
      await hook.result.current.start(null, { direct: true });
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
      await hook.result.current.start(null, { direct: true });
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
      await hook.result.current.start(null, { day: '2026-10-01', direct: true });
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
      await hook.result.current.start(null, { direct: true });
    });
    expect(callPlanPick).not.toHaveBeenCalled();
    expect(messages.map((m) => m.content)).toEqual([PLAN_COPY.noRoomTravel]);
  });
});

describe('planning through the pick sheet', () => {
  const OFFER = {
    type: 'brief-offer' as const,
    kind: 'plan' as const,
    buttons: [],
    plan_from: 795,
  };

  it("opens the sheet at once, adds Gremly's suggestions when they are back, and plans what they pick as theirs", async () => {
    const { hook, messages } = harness();
    await act(async () => {
      await hook.result.current.start(OFFER);
    });
    const session = hook.result.current.pickSession;
    expect(session).toMatchObject({ day: '2026-09-30' });
    expect(session?.suggested?.map((s) => s.id)).toEqual(['social', 'oat', 'fact-1']);
    // nothing goes in the thread until they pick
    expect(messages).toEqual([]);
    await act(async () => {
      await hook.result.current.planPicked([
        { id: 'oat', kind: 'todo', minutes: 15, estimated: true },
        { id: 'social', kind: 'habit', minutes: 30, estimated: false },
      ]);
    });
    expect(hook.result.current.pickSession).toBeNull();
    expect(messages[0].content).toBe(PLAN_COPY.yourPicks);
    const plan = messages.find((m) => (m.metadata_json as any).type === 'brief-plan')!
      .metadata_json as any;
    expect(plan.items.map((x: any) => [x.id, !!x.chosen])).toEqual([
      ['oat', true],
      ['social', true],
    ]);
  });

  it("keeps Gremly's line when they pick just what it suggested", async () => {
    const { hook, messages } = harness();
    await act(async () => {
      await hook.result.current.start(OFFER);
    });
    await act(async () => {
      await hook.result.current.planPicked(
        ['social', 'oat', 'fact-1'].map((id) => ({
          id,
          kind: 'todo' as const,
          minutes: 30,
          estimated: false,
        })),
      );
    });
    expect(messages[0].content).toMatch(/light afternoon/);
  });

  it('with nothing picked, asks what has to happen first, and plans around the answer', async () => {
    const { hook, messages } = harness();
    await act(async () => {
      await hook.result.current.start(OFFER);
    });
    await act(async () => {
      await hook.result.current.askFirst();
    });
    const ask = messages[0].metadata_json as any;
    expect(ask).toMatchObject({ type: 'brief-offer', kind: 'plan_ask', plan_day: '2026-09-30' });
    expect(ask.buttons).toEqual([
      expect.objectContaining({ id: 'plan_direct', action: 'plan', label: 'Just plan it' }),
    ]);
    expect(messages[0].content).toMatch(/has to happen today/);
    expect(hook.result.current.awaitingAnswer()).toBe(true);
    await act(async () => {
      expect(await hook.result.current.planWithAnswer('The oat milk, we are out')).toBe(true);
    });
    expect(callPlanPick).toHaveBeenLastCalledWith(
      expect.objectContaining({ asked: 'The oat milk, we are out' }),
    );
    expect(messages.map((m) => m.role)).toContain('user');
    expect(messages.some((m) => (m.metadata_json as any).type === 'brief-plan')).toBe(true);
    expect(hook.result.current.awaitingAnswer()).toBe(false);
  });

  it('closing the sheet leaves the thread as it was', async () => {
    const { hook, messages } = harness();
    await act(async () => {
      await hook.result.current.start(OFFER);
    });
    act(() => hook.result.current.closePicks());
    expect(hook.result.current.pickSession).toBeNull();
    expect(messages).toEqual([]);
  });
});

describe('what they picked and the gaps between things', () => {
  const OFFER = {
    type: 'brief-offer' as const,
    kind: 'plan' as const,
    buttons: [],
    plan_from: 795,
  };
  const PICKS = [
    { id: 'social', kind: 'habit' as const, minutes: 30, estimated: false },
    { id: 'oat', kind: 'todo' as const, minutes: 15, estimated: true },
  ];
  // the meeting ends at 1:15pm (795). Social posts takes 30 minutes and the
  // oat milk 15: with the usual gaps that is 1:30 to 2, then 2:15 to 2:30

  async function picking(planEnd: number) {
    extra = { planEnd };
    // what they pick from is theirs, in the store
    mockTodos = [{ id: 'oat', name: 'Buy Oat Milk', due_day: '2026-09-30' }];
    mockHabits = [{ id: 'social', name: 'Social posts' }];
    const h = harness();
    await act(async () => {
      await h.hook.result.current.start(OFFER);
    });
    return h;
  }
  const planOf = (messages: SpaceChatMessage[]) =>
    messages.filter((m) => (m.metadata_json as any).type === 'brief-plan').pop()
      ?.metadata_json as any;
  const offerOf = (messages: SpaceChatMessage[], kind: string) =>
    messages.find((m) => (m.metadata_json as any).kind === kind);

  it('tells the sheet how the picks sit in the day, gaps counted', async () => {
    // room until 3pm: both fit with their gaps, and 15 minutes are left after them
    const roomy = await picking(900);
    expect(roomy.hook.result.current.pickRoom(PICKS)).toEqual({ fit: 'spaced', left: 15, over: 0 });
    // nothing picked: the time after the meeting's own gap
    expect(roomy.hook.result.current.pickRoom([])).toEqual({ fit: 'spaced', left: 90, over: 0 });
    // until 2:25pm they fit only with no gaps between
    const snug = await picking(865);
    expect(snug.hook.result.current.pickRoom(PICKS)).toEqual({ fit: 'tight', left: 0, over: 0 });
    // until 1:50pm they do not fit back to back either: the plan keeps its
    // gaps, and Social posts (30 minutes) is what it will leave out
    const short = await picking(830);
    expect(short.hook.result.current.pickRoom(PICKS)).toEqual({ fit: 'over', left: 0, over: 30 });
  });

  it('makes the plan straight away when the picks fit with their gaps', async () => {
    const { hook, messages } = await picking(900);
    await act(async () => {
      await hook.result.current.planPicked(PICKS);
    });
    expect(offerOf(messages, 'plan_spacing')).toBeUndefined();
    expect(planOf(messages).items.map((x: any) => [x.id, x.start, x.end])).toEqual([
      ['social', 810, 840],
      ['oat', 855, 870],
    ]);
    expect(planOf(messages).buffer).toBeUndefined();
  });

  it('asks back to back or with some space when the picks only fit back to back', async () => {
    const { hook, messages } = await picking(865);
    await act(async () => {
      await hook.result.current.planPicked(PICKS);
    });
    // no plan yet: the question, with what they picked riding on it
    expect(planOf(messages)).toBeUndefined();
    const ask = offerOf(messages, 'plan_spacing')!;
    expect(ask.content).toBe(
      'Those only fit today back to back. Want them back to back, or with some space between them?',
    );
    const meta = ask.metadata_json as any;
    expect(meta.buttons.map((b: any) => [b.label, b.action, b.value])).toEqual([
      ['Back to back', 'plan_spacing', 'tight'],
      ['With some space', 'plan_spacing', 'spaced'],
    ]);
    expect(meta).toMatchObject({ plan_day: '2026-09-30', plan_from: 795 });
    expect(meta.picks.map((p: any) => [p.id, p.minutes, p.chosen])).toEqual([
      ['social', 30, true],
      ['oat', 15, true],
    ]);
  });

  it('back to back plans them with no gaps, and the plan keeps to that', async () => {
    const { hook, messages } = await picking(865);
    await act(async () => {
      await hook.result.current.planPicked(PICKS);
    });
    const ask = offerOf(messages, 'plan_spacing')!.metadata_json as any;
    await act(async () => {
      await hook.result.current.planSpacing(ask, 'tight');
    });
    expect(messages.map((m) => m.content)).toContain(PLAN_COPY.backToBack);
    const plan = planOf(messages);
    expect(plan.items.map((x: any) => [x.id, x.start, x.end])).toEqual([
      ['social', 795, 825],
      ['oat', 825, 840],
    ]);
    expect(plan.unplaced).toEqual([]);
    expect(plan.buffer).toBe(0);
    // changed by hand afterwards, it is still fitted with no gaps
    const msg = messages.find((m) => (m.metadata_json as any).type === 'brief-plan')!;
    await act(async () => {
      await hook.result.current.retimeItem(msg, 'social', 795, 40);
    });
    expect((msg.metadata_json as any).items.map((x: any) => [x.id, x.start, x.end])).toEqual([
      ['social', 795, 835],
      ['oat', 835, 850],
    ]);
    expect((msg.metadata_json as any).buffer).toBe(0);
  });

  it('with some space keeps the gaps, says what did not fit and offers another day', async () => {
    const { hook, messages } = await picking(865);
    await act(async () => {
      await hook.result.current.planPicked(PICKS);
    });
    const ask = offerOf(messages, 'plan_spacing')!.metadata_json as any;
    await act(async () => {
      await hook.result.current.planSpacing(ask, 'spaced');
    });
    expect(messages.map((m) => m.content)).toContain(PLAN_COPY.withSpace);
    const plan = planOf(messages);
    expect(plan.items.map((x: any) => [x.id, x.start, x.end])).toEqual([['social', 810, 840]]);
    expect(plan.unplaced.map((x: any) => x.id)).toEqual(['oat']);
    expect(plan.buffer).toBeUndefined();
    const unfit = offerOf(messages, 'plan_unfit')!;
    expect(unfit.content).toBe(
      "I couldn't find a good gap for Buy Oat Milk today, so it's not in the plan. Want it tomorrow instead?",
    );
    const meta = unfit.metadata_json as any;
    expect(meta.unfit).toEqual([{ id: 'oat', title: 'Buy Oat Milk' }]);
    // it cannot be put off again (laterOffered says no), so Later is not offered
    expect(meta.buttons.map((b: any) => [b.label, b.value])).toEqual([
      ['Move to tomorrow', 'tomorrow'],
      ['Leave it', 'leave'],
    ]);
    // it is the last thing in the thread: only the newest offer has buttons
    // to tap, so the suggested changes wait for this answer
    expect(messages[messages.length - 1]).toBe(unfit);
    expect(offerOf(messages, 'plan_edit')).toBeUndefined();
  });

  it('offers Later when every todo that did not fit can still be put off', async () => {
    (laterOffered as jest.Mock).mockReturnValue(true);
    (laterBackDay as jest.Mock).mockReturnValue('2026-10-05');
    const { hook, messages } = await picking(865);
    await act(async () => {
      await hook.result.current.planPicked(PICKS);
    });
    await act(async () => {
      await hook.result.current.planSpacing(
        offerOf(messages, 'plan_spacing')!.metadata_json as any,
        'spaced',
      );
    });
    const meta = offerOf(messages, 'plan_unfit')!.metadata_json as any;
    expect(meta.buttons.map((b: any) => b.label)).toEqual([
      'Move to tomorrow',
      'Later',
      'Leave it',
    ]);
  });

  it('plans with the gaps when they do not fit back to back either, and names a habit left out', async () => {
    const { hook, messages } = await picking(830);
    await act(async () => {
      await hook.result.current.planPicked(PICKS);
    });
    // no question: back to back would not hold them all
    expect(offerOf(messages, 'plan_spacing')).toBeUndefined();
    expect(planOf(messages).items.map((x: any) => x.id)).toEqual(['oat']);
    // a habit has no other day to go to, so there is nothing to offer
    expect(offerOf(messages, 'plan_unfit')).toBeUndefined();
    expect(messages.map((m) => m.content)).toContain(
      "I couldn't find a good gap for Social posts today, so it's not in the plan.",
    );
  });

  it('asks nothing about one pick alone: with no good gap it is left out, and no empty plan is made', async () => {
    const { hook, messages } = await picking(830);
    await act(async () => {
      await hook.result.current.planPicked([PICKS[0]]);
    });
    // 30 minutes would only fit hard up against the meeting
    expect(hook.result.current.pickRoom([PICKS[0]])).toEqual({ fit: 'over', left: 0, over: 30 });
    expect(offerOf(messages, 'plan_spacing')).toBeUndefined();
    expect(planOf(messages)).toBeUndefined();
    expect(messages.map((m) => m.content)).toEqual([
      "I couldn't find a good gap for Social posts today, so it's not in the plan.",
    ]);
  });

  describe('an answer to back to back or with some space that comes late', () => {
    async function asked() {
      const h = await picking(865);
      await act(async () => {
        await h.hook.result.current.planPicked(PICKS);
      });
      return { ...h, ask: offerOf(h.messages, 'plan_spacing')!.metadata_json as any };
    }

    it('starts from the time now, not from when it was asked', async () => {
      const { hook, messages, ask } = await asked();
      await act(async () => {
        // asked for 11:40am on; it is 12:40pm now
        await hook.result.current.planSpacing({ ...ask, plan_from: 700 }, 'tight');
      });
      expect(planOf(messages).from).toBe(760);
      expect(planOf(messages).items[0]).toMatchObject({ id: 'social', start: 795 });
    });

    it('leaves out what was done since', async () => {
      const { hook, messages, ask } = await asked();
      mockTodos = [{ id: 'oat', name: 'Buy Oat Milk', completed_at: '2026-09-30T19:00:00Z' }];
      await act(async () => {
        await hook.result.current.planSpacing(ask, 'tight');
      });
      expect(planOf(messages).items.map((x: any) => x.id)).toEqual(['social']);
    });

    it('makes no second plan when one was said yes to meanwhile', async () => {
      const { hook, messages, ask } = await asked();
      messages.push({
        id: 'locked',
        role: 'system',
        content: '',
        metadata_json: {
          type: 'brief-plan',
          version: 1,
          status: 'locked',
          date: '2026-09-30',
          items: [],
          unplaced: [],
        },
      } as unknown as SpaceChatMessage);
      hook.rerender({});
      await act(async () => {
        await hook.result.current.planSpacing(ask, 'tight');
      });
      expect(messages.filter((m) => (m.metadata_json as any).type === 'brief-plan')).toHaveLength(
        1,
      );
      expect(messages[messages.length - 1].content).toBe(
        "It's already on Today. Tell me what to change and I'll rework it.",
      );
    });

    it('plans nothing for a day that has gone', async () => {
      const { hook, messages, ask } = await asked();
      await act(async () => {
        await hook.result.current.planSpacing({ ...ask, plan_day: '2026-09-29' }, 'tight');
      });
      expect(planOf(messages)).toBeUndefined();
      expect(messages[messages.length - 1].content).toBe(PLAN_COPY.dayGone);
    });
  });

  it('keeps a back to back plan back to back through a removal and a new version', async () => {
    const { hook, messages } = await picking(865);
    await act(async () => {
      await hook.result.current.planPicked(PICKS);
    });
    await act(async () => {
      await hook.result.current.planSpacing(
        offerOf(messages, 'plan_spacing')!.metadata_json as any,
        'tight',
      );
    });
    const msg = messages.find((m) => (m.metadata_json as any).type === 'brief-plan')!;
    hook.rerender({});
    // a change from the thread makes a new version: still no gaps
    await act(async () => {
      await hook.result.current.reviseAfterChanges({
        add: [],
        remove: [],
        pin: [{ id: 'oat', start: 825 }],
      });
    });
    const next = planOf(messages);
    expect(next.version).toBe(2);
    expect(next.buffer).toBe(0);
    expect(next.items.map((x: any) => [x.id, x.start])).toEqual([
      ['social', 795],
      ['oat', 825],
    ]);
    // and taking one out of a card keeps the plan's own gap: what they picked
    // stays where it was, and the card still says it is back to back
    (msg.metadata_json as any).status = 'proposal';
    await act(async () => {
      await hook.result.current.removeItem(msg, 'social');
    });
    expect((msg.metadata_json as any).buffer).toBe(0);
    expect((msg.metadata_json as any).items.map((x: any) => [x.id, x.start])).toEqual([
      ['oat', 825],
    ]);
  });

  describe('adding to a plan already made', () => {
    const plan = (planEnd: number) => {
      extra = { planEnd };
      return {
        type: 'brief-plan',
        version: 1,
        status: 'proposal',
        date: '2026-09-30',
        from: 795,
        order: ['social', 'oat'],
        items: [
          { id: 'social', kind: 'habit', title: 'Social posts', start: 810, end: 840, minutes: 30 },
          { id: 'oat', kind: 'todo', title: 'Buy Oat Milk', start: 855, end: 870, minutes: 15 },
        ],
        unplaced: [],
      } as any;
    };
    const tap = { id: 'tap', kind: 'todo' as const, minutes: 30 };
    beforeEach(() => {
      (candidateFromStore as jest.Mock).mockImplementation((id: string) =>
        id === 'tap'
          ? {
              id,
              kind: 'todo',
              title: 'Fix the tap',
              minutes: 30,
              why: '',
              window: null,
              source: 'due',
            }
          : null,
      );
    });

    it('says how much room is left once the picks are in, gaps counted', () => {
      // until 4pm: Fix the tap goes in at 2:45, and 30 minutes are left after its gap
      expect(addRoomFor(plan(960), [tap])).toEqual({ fit: 'spaced', left: 30, over: 0 });
      expect(addRoomFor(plan(960), [])).toEqual({ fit: 'spaced', left: 75, over: 0 });
    });

    it('counts what a pick would push out of the plan, not only the pick', () => {
      // until 2:30pm the plan is full: a pick goes ahead of what Gremly chose, and something has to go
      const room = addRoomFor(plan(870), [tap]);
      expect(room.fit).toBe('over');
      expect(room.over).toBeGreaterThan(0);
    });
  });

  describe('the todos that did not fit', () => {
    async function unfit() {
      const h = await picking(865);
      await act(async () => {
        await h.hook.result.current.planPicked(PICKS);
      });
      await act(async () => {
        await h.hook.result.current.planSpacing(
          offerOf(h.messages, 'plan_spacing')!.metadata_json as any,
          'spaced',
        );
      });
      // the hook reads the thread as it is now
      h.hook.rerender({});
      const asked = offerOf(h.messages, 'plan_unfit')!.metadata_json as any;
      const planMsg = h.messages.find((m) => (m.metadata_json as any).type === 'brief-plan')!;
      return { ...h, asked, planMsg };
    }

    it('move to the next day through the change model, and come off the plan', async () => {
      const { hook, messages, asked, planMsg } = await unfit();
      await act(async () => {
        await hook.result.current.moveUnfit(asked, 'tomorrow');
      });
      expect(checkChange).toHaveBeenCalledWith(
        { op: 'change', type: 'todo', id: 'oat', fields: { day: '2026-10-01' } },
        expect.anything(),
      );
      expect(applyChanges).toHaveBeenCalledWith(
        [expect.objectContaining({ cid: 'unfit-oat', id: 'oat', fields: { day: '2026-10-01' } })],
        { source: 'thread', threadId: 't1' },
      );
      expect((planMsg.metadata_json as any).unplaced).toEqual([]);
      expect((planMsg.metadata_json as any).order).toEqual(['social']);
      const said = messages.map((m) => m.content);
      expect(said).toContain('Done, Buy Oat Milk is on tomorrow now.');
      // the suggested changes under the plan follow, now it is answered
      const last = messages[messages.length - 1].metadata_json as any;
      expect(last).toMatchObject({ type: 'brief-offer', kind: 'plan_edit' });
      expect(last.buttons.length).toBeGreaterThan(0);
    });

    it('are put off for later, each to its own day back', async () => {
      (laterBackDay as jest.Mock).mockReturnValue('2026-10-05');
      const { hook, messages, asked } = await unfit();
      await act(async () => {
        await hook.result.current.moveUnfit(asked, 'later');
      });
      expect(checkChange).toHaveBeenCalledWith(
        { op: 'later', type: 'todo', id: 'oat', back_on: '2026-10-05' },
        expect.anything(),
      );
      expect(messages.map((m) => m.content)).toContain(
        'Done. Buy Oat Milk comes back on 2026-10-05.',
      );
    });

    it('come out of the plan too when a change since the offer found one a place', async () => {
      const { hook, asked, planMsg } = await unfit();
      // Social posts was taken out, and the fit that followed placed the oat milk
      const meta = planMsg.metadata_json as any;
      meta.items = [{ id: 'oat', kind: 'todo', title: 'Buy Oat Milk', start: 810, end: 825 }];
      meta.unplaced = [];
      meta.order = ['oat'];
      hook.rerender({});
      await act(async () => {
        await hook.result.current.moveUnfit(asked, 'tomorrow');
      });
      expect((planMsg.metadata_json as any).items).toEqual([]);
      expect((planMsg.metadata_json as any).order).toEqual([]);
      // a proposal wrote no time on the todo, so there is none to take back
      expect(mockUpdateTodo).not.toHaveBeenCalled();
    });

    it('take back the time a plan on Today had given one of them', async () => {
      const { hook, asked, planMsg } = await unfit();
      const meta = planMsg.metadata_json as any;
      meta.items = [{ id: 'oat', kind: 'todo', title: 'Buy Oat Milk', start: 810, end: 825 }];
      meta.unplaced = [];
      meta.status = 'locked';
      hook.rerender({});
      await act(async () => {
        await hook.result.current.moveUnfit(asked, 'tomorrow');
      });
      expect((planMsg.metadata_json as any).items).toEqual([]);
      expect(mockUpdateTodo).toHaveBeenCalledWith('oat', {
        daily_block: null,
        scheduled_start_iso: null,
      });
    });

    it('count one already on that day as there, with nothing to write', async () => {
      (checkChange as jest.Mock).mockReturnValue({ ok: false, reason: 'no_change' });
      const { hook, messages, asked, planMsg } = await unfit();
      await act(async () => {
        await hook.result.current.moveUnfit(asked, 'tomorrow');
      });
      expect(applyChanges).not.toHaveBeenCalled();
      expect((planMsg.metadata_json as any).unplaced).toEqual([]);
      expect(messages.map((m) => m.content)).toContain('Done, Buy Oat Milk is on tomorrow now.');
    });

    it('move nothing that was done since, and say which stayed when only some moved', async () => {
      const { hook, messages, asked } = await unfit();
      mockTodos = [
        { id: 'oat', name: 'Buy Oat Milk', completed_at: '2026-09-30T19:00:00Z' },
        { id: 'tap', name: 'Fix the tap' },
        { id: 'call', name: 'Call the bank' },
      ];
      (applyChanges as jest.Mock).mockImplementation(async (changes: any[]) => ({
        outcomes: changes.map((c) => ({ cid: c.cid, ok: c.id !== 'call' })),
        revertAll: jest.fn(),
      }));
      const three = {
        ...asked,
        unfit: [
          ...asked.unfit,
          { id: 'tap', title: 'Fix the tap' },
          { id: 'call', title: 'Call the bank' },
        ],
      };
      await act(async () => {
        await hook.result.current.moveUnfit(three, 'tomorrow');
      });
      // the done one is not sent anywhere
      expect((applyChanges as jest.Mock).mock.calls.map((c) => c[0][0].id)).toEqual([
        'tap',
        'call',
      ]);
      expect(messages.map((m) => m.content)).toContain(
        'Done, Fix the tap is on tomorrow now. Buy Oat Milk and Call the bank stayed where they were.',
      );
    });

    it('stay where they are when left', async () => {
      const { hook, messages, asked, planMsg } = await unfit();
      await act(async () => {
        await hook.result.current.moveUnfit(asked, 'leave');
      });
      expect(applyChanges).not.toHaveBeenCalled();
      expect((planMsg.metadata_json as any).unplaced.map((x: any) => x.id)).toEqual(['oat']);
      expect(messages.map((m) => m.content)).toContain("Sure, I've left it where it is.");
    });

    it('says so when the move did not save, and leaves the plan as it was', async () => {
      (applyChanges as jest.Mock).mockResolvedValue({
        outcomes: [{ cid: 'unfit-oat', ok: false, reason: 'failed', message: 'no' }],
        revertAll: jest.fn(),
      });
      const { hook, messages, asked, planMsg } = await unfit();
      await act(async () => {
        await hook.result.current.moveUnfit(asked, 'tomorrow');
      });
      expect((planMsg.metadata_json as any).unplaced.map((x: any) => x.id)).toEqual(['oat']);
      expect(messages.map((m) => m.content)).toContain(PLAN_COPY.unfitFailed);
    });
  });
});

describe('changing the plan by hand', () => {
  async function planned() {
    const h = harness();
    await act(async () => {
      await h.hook.result.current.start(
        { type: 'brief-offer', kind: 'plan', buttons: [], plan_from: 795 },
        { direct: true },
      );
    });
    const msg = h.messages.find((m) => (m.metadata_json as any).type === 'brief-plan')!;
    return { ...h, msg };
  }

  it('puts an item where they set it, at the length they set, and fits the rest around it', async () => {
    const { hook, msg } = await planned();
    await act(async () => {
      await hook.result.current.retimeItem(msg, 'oat', 1080, 45);
    });
    const plan = msg.metadata_json as any;
    expect(plan.items.find((x: any) => x.id === 'oat')).toMatchObject({
      start: 1080,
      end: 1125,
      pinned: true,
    });
  });

  it('adds busy time to the day in the thread, and fits the plan around it', async () => {
    const { hook, msg, deps } = await planned();
    await act(async () => {
      await hook.result.current.addBusy(msg, { title: 'Client lunch', start: 800, end: 860 });
    });
    expect(patchDailyThreadMeta).toHaveBeenCalledWith(
      deps.threadId,
      expect.objectContaining({
        fixed_blocks: [expect.objectContaining({ title: 'Client lunch', start: 800, end: 860 })],
      }),
    );
  });
});
