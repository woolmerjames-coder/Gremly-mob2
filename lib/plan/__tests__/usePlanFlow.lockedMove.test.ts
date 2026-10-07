/**
 * A plan that is on Today (said yes to) follows its items: when one is given a
 * new time on the item itself, its planned time moves with it, and so does
 * the block that time falls in, so Today files it under the right part of the
 * day (lib/now/sectionFor.ts).
 */
import { renderHook, act } from '@testing-library/react-native';
import { usePlanFlow } from '../usePlanFlow';
import { callPlanPick } from '../../cortex/CortexClient';
import { dayRecordFromStore, plannedTimePatch, poolForDay, meetingsFromStore } from '../storePlan';
import type { SpaceChatMessage } from '../../types';

jest.mock('../../cortex/CortexClient', () => ({ callPlanPick: jest.fn() }));
jest.mock('../../date/DateService', () => ({
  getDateService: () => ({
    today: () => '2026-09-30',
    ritualDay: () => '2026-09-30',
    isInLateNightPeriod: () => false,
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
  plannedTimePatch: jest.fn(),
}));
jest.mock('../../repo/dailyThreadRepo', () => ({
  patchDailyThreadMeta: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('../../brief/time', () => ({
  minutesOfDay: () => 760,
  minutesOfTheirDay: () => 760,
  localMinutesToIso: (d: string, m: number) => `${d}T${m}`,
  hhmmToMinutes: (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)),
  localDateOf: (iso: string) => iso.slice(0, 10),
}));
jest.mock('../../brief/todayThread', () => ({
  useTodayThread: { getState: () => ({ patchMeta: jest.fn() }) },
}));
let mockTodos: any[] = [];
const mockUpdateTodo = jest.fn();
jest.mock('../../store/useGremlyStore', () => {
  // read when asked for: the list is made after this module is mocked
  const state = {
    get todos() {
      return mockTodos;
    },
    habits: [],
    weeklyDay: 0,
    updateTodo: (...args: unknown[]) => mockUpdateTodo(...args),
  };
  const useGremlyStore: any = (sel: (s: any) => unknown) => sel(state);
  useGremlyStore.getState = () => state;
  return { useGremlyStore };
});
jest.mock('../../store/selectors', () => ({ selectOverdueTodos: () => [] }));
// what the planner reaches for elsewhere, none of it part of this
jest.mock('../../changes/apply', () => ({ applyChanges: jest.fn() }));
jest.mock('../../changes/model', () => ({ checkChange: jest.fn() }));
jest.mock('../../changes/snapshot', () => ({ contextFor: jest.fn() }));
jest.mock('../../sweep/cardDays', () => ({
  laterOffered: jest.fn(),
  laterBackDay: jest.fn(),
  backDayName: jest.fn(),
}));

const POOL = [
  {
    id: 'oat',
    kind: 'todo',
    title: 'Buy Oat Milk',
    minutes: 15,
    why: 'Due today',
    window: null,
    source: 'due',
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
  mockTodos = [];
  (dayRecordFromStore as jest.Mock).mockImplementation((d: string) => ({
    date: d,
    travel: null,
    away: null,
    blocks: [],
    busy: [],
    planEnd: 1320,
    duringTravel: [],
    chip: null,
  }));
  (poolForDay as jest.Mock).mockReturnValue(POOL);
  (meetingsFromStore as jest.Mock).mockReturnValue([]);
  (callPlanPick as jest.Mock).mockResolvedValue({
    ok: true,
    data: {
      intro: 'One small thing for the afternoon.',
      picks: [
        { id: 'oat', window: [765, 1320], minutes: 15, estimated: false, reason: 'Due today' },
      ],
    },
  });
  (plannedTimePatch as jest.Mock).mockImplementation((date: string, start: number) => ({
    daily_block: 'day',
    scheduled_start_iso: `${date}T${start}`,
  }));
});

describe('a plan on Today, when one of its items is given a new time', () => {
  it('moves the planned time, and the block it falls in, with the item', async () => {
    const { hook, messages, deps } = harness();
    await act(async () => {
      await hook.result.current.start(null, { direct: true });
    });
    const planMsg = messages.find((m) => (m.metadata_json as any).type === 'brief-plan')!;
    (planMsg.metadata_json as any).status = 'locked';
    // the plan sees the todo as it is in the store
    mockTodos = [{ id: 'oat', name: 'Buy Oat Milk', due_day: '2026-09-30', due_time: null }];
    const live = renderHook(() => usePlanFlow({ ...deps, messages: [...messages] }));
    await act(async () => {});
    expect(mockUpdateTodo).not.toHaveBeenCalled();

    // they give it a time on the item: 4pm
    mockTodos = [{ ...mockTodos[0], due_time: '16:00' }];
    live.rerender({});
    await act(async () => {});
    expect(plannedTimePatch).toHaveBeenCalledWith('2026-09-30', 960);
    expect(mockUpdateTodo).toHaveBeenCalledWith('oat', {
      daily_block: 'day',
      scheduled_start_iso: '2026-09-30T960',
    });
    // and the card shows it there
    expect((planMsg.metadata_json as any).items.find((x: any) => x.id === 'oat').start).toBe(960);
  });
});
