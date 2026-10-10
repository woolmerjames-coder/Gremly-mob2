/**
 * Things saved from a chat feed Gremly the way drops do: one tap takes the
 * next place on the day's drop ladder, which drops and chat saves climb
 * together (16% for the first five, then 8%, then 4%), and is credited under
 * its own source, chat_save.
 */

jest.mock('../../date/ritualDay', () => ({
  getRitualDay: jest.fn(() => '2026-01-10'),
  getDayBoundaryLabel: jest.fn((hour: number) => `${hour}:00 AM`),
  isInLateNightPeriod: jest.fn(() => false),
  getHoursUntilDayBoundary: jest.fn(() => 4),
  DAY_BOUNDARY_OPTIONS: [{ value: 4, label: '4:00 AM' }],
}));

jest.mock('../../supabase/client', () => ({
  supabase: {
    from: jest.fn(),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn().mockResolvedValue({ error: null }),
    })),
    auth: {
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc: jest.fn(),
  },
}));

import { act } from '@testing-library/react-native';
import { useGremlyStore } from '../useGremlyStore';
import { supabase } from '../../supabase/client';

const mockRpc = supabase.rpc as jest.Mock;
const mockFrom = supabase.from as jest.Mock;
const { getRitualDay } = require('../../date/ritualDay');

// the day's row as an increment hands it back
let row: { drops_count: number; chat_saves_count: number } | null;
let rowError: { message: string } | null;

function gaugeCalls() {
  return mockRpc.mock.calls
    .filter(([name]) => name === 'update_gauge_atomic')
    .map(([, args]) => ({ source: args.p_source, value: Number(args.p_value.toFixed(4)) }));
}

async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-10T10:00:00Z'));
  (getRitualDay as jest.Mock).mockReturnValue('2026-01-10');
  row = null;
  rowError = null;
  mockRpc.mockImplementation((name: string) => {
    if (name === 'increment_chat_save_count' || name === 'increment_drop_count') {
      return Promise.resolve({ data: rowError ? null : row, error: rowError });
    }
    if (name === 'update_gauge_atomic') {
      return Promise.resolve({
        data: [
          {
            new_gauge_value: 0.5,
            is_fed: false,
            just_fed: false,
            new_fed_days_count: 0,
            did_age_up: false,
            new_age: 5,
            new_tier: 'Sprout',
          },
        ],
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });
  mockFrom.mockImplementation(() => ({
    update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
    upsert: jest.fn().mockResolvedValue({ error: null }),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  }));
  useGremlyStore.setState({
    userId: 'user-123',
    gremlyAge: 5,
    dayBoundaryHour: 4,
    userTimezone: 'UTC',
    // past training, so no training boost unless a test asks for it
    graduatedAt: '2026-01-01T00:00:00Z',
    todayRitualDay: '2026-01-10',
    todayDropsCount: 0,
    todayChatSavesCount: 0,
    pendingGaugePreviews: 0,
    feedingGaugeValue: 0,
    isFedToday: false,
    feedingContributions: [],
    todayFedCelebrationShownAt: null,
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('a chat save', () => {
  it('counts the tap on the server and is worth a drop at its place on the ladder', async () => {
    row = { drops_count: 4, chat_saves_count: 1 };
    await act(async () => {
      await useGremlyStore.getState().creditChatSave();
    });
    expect(mockRpc).toHaveBeenCalledWith('increment_chat_save_count', {
      p_owner_id: 'user-123',
      p_ritual_day: '2026-01-10',
    });
    // fifth of the day: 16%, under its own source
    expect(gaugeCalls()).toEqual([{ source: 'chat_save', value: 0.16 }]);
    expect(useGremlyStore.getState().todayChatSavesCount).toBe(1);
  });

  it('after five drops and saves it is worth 8%, and after ten 4%', async () => {
    row = { drops_count: 4, chat_saves_count: 2 };
    await act(async () => {
      await useGremlyStore.getState().creditChatSave();
    });
    row = { drops_count: 8, chat_saves_count: 3 };
    await act(async () => {
      await useGremlyStore.getState().creditChatSave();
    });
    expect(gaugeCalls()).toEqual([
      { source: 'chat_save', value: 0.08 },
      { source: 'chat_save', value: 0.04 },
    ]);
  });

  it('gets the training boost, like a drop', async () => {
    useGremlyStore.setState({ graduatedAt: null });
    row = { drops_count: 0, chat_saves_count: 1 };
    await act(async () => {
      await useGremlyStore.getState().creditChatSave();
    });
    expect(gaugeCalls()).toEqual([{ source: 'chat_save', value: 0.2 }]);
  });

  it('feeds nothing when the tap could not be counted', async () => {
    rowError = { message: 'function does not exist' };
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      await useGremlyStore.getState().creditChatSave();
    });
    expect(gaugeCalls()).toEqual([]);
    expect(useGremlyStore.getState().todayChatSavesCount).toBe(0);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('a drop, with chat saves earlier in the day', () => {
  it('takes its place on the same ladder', async () => {
    // fifth drop, after three chat saves: eighth of the day, 8%
    row = { drops_count: 5, chat_saves_count: 3 };
    await act(async () => {
      await useGremlyStore.getState().incrementDropCount();
      await settle();
    });
    expect(gaugeCalls()).toEqual([{ source: 'drop', value: 0.08 }]);
    expect(useGremlyStore.getState().todayDropsCount).toBe(5);
    expect(useGremlyStore.getState().todayChatSavesCount).toBe(3);
  });

  it('previews on the same ladder before the server answers', () => {
    useGremlyStore.setState({ todayDropsCount: 3, todayChatSavesCount: 2 });
    act(() => {
      useGremlyStore.getState().previewGaugeDrop();
    });
    // sixth of the day: 8%
    expect(useGremlyStore.getState().feedingGaugeValue).toBeCloseTo(0.08);
  });

  it('a build before the column existed still climbs the drops alone', async () => {
    row = { drops_count: 2 } as any;
    await act(async () => {
      await useGremlyStore.getState().incrementDropCount();
      await settle();
    });
    expect(gaugeCalls()).toEqual([{ source: 'drop', value: 0.16 }]);
  });
});

describe('a new day', () => {
  it('starts the chat saves from nothing', () => {
    useGremlyStore.setState({ todayRitualDay: '2026-01-09', todayChatSavesCount: 4 });
    act(() => {
      useGremlyStore.getState().ensureCurrentRitualDay();
    });
    expect(useGremlyStore.getState().todayChatSavesCount).toBe(0);
  });
});
