/**
 * Tests for useMascotLifecycle hook.
 *
 * Covers: sleep window boundary detection, initial mode, inactivity reset.
 * Since isInSleepWindow is private, we test it indirectly through the hook.
 */
import { renderHook, act } from '@testing-library/react-native';

// ─── Mock configuration ────────────────────────────────────────────────────

let mockHour = 12;
let mockToday = '2025-06-15';
const mockLastActiveDate: string | null = '2025-06-15';

jest.mock('../../lib/date', () => ({
  getDateService: () => ({
    now: () => new Date('2025-06-15T12:00:00'),
    today: () => mockToday,
    getHour: () => mockHour,
  }),
}));

jest.mock('../../lib/date/DateService', () => ({
  getDateService: () => ({
    now: () => new Date('2025-06-15T12:00:00'),
    today: () => mockToday,
    getHour: () => mockHour,
  }),
  dateService: {
    now: () => new Date('2025-06-15T12:00:00'),
    today: () => mockToday,
    getHour: () => mockHour,
  },
  nowTimestamp: () => '2025-06-15T12:00:00Z',
}));

// Mock useGremlyStore with a simple selector-based implementation
let mockStoreState: Record<string, any> = {
  dayBoundaryHour: 4,
  lastActiveDate: '2025-06-15',
};

jest.mock('../../lib/store/useGremlyStore', () => {
  const fn = (selector: (s: any) => any) => selector(mockStoreState);
  fn.getState = () => mockStoreState;
  fn.setState = (partial: Record<string, any>) => {
    Object.assign(mockStoreState, partial);
  };
  return {
    useGremlyStore: fn,
  };
});

// Mock useMascotController with jest.fn wrappers
const mockWave = jest.fn();
const mockFallAsleep = jest.fn();
const mockSleep = jest.fn();
const mockWakeUp = jest.fn();
const mockIdle = jest.fn();
let mockMode: string = 'idle';

jest.mock('../useMascotController', () => ({
  useMascotController: () => ({
    mode: mockMode,
    wave: mockWave,
    fallAsleep: mockFallAsleep,
    sleep: mockSleep,
    wakeUp: mockWakeUp,
    idle: mockIdle,
  }),
}));

// Mock AppState
const appStateListeners: Array<(state: string) => void> = [];
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: (_event: string, handler: (state: string) => void) => {
      appStateListeners.push(handler);
      return { remove: () => {} };
    },
  },
}));

import { useMascotLifecycle } from '../useMascotLifecycle';

beforeEach(() => {
  jest.useFakeTimers();
  mockHour = 12;
  mockToday = '2025-06-15';
  mockMode = 'idle';
  mockStoreState = { dayBoundaryHour: 4, lastActiveDate: '2025-06-15' };
  appStateListeners.length = 0;
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useMascotLifecycle', () => {
  it('returns mode and resetInactivity', () => {
    const { result } = renderHook(() => useMascotLifecycle());
    expect(result.current).toHaveProperty('mode');
    expect(result.current).toHaveProperty('resetInactivity');
    expect(typeof result.current.resetInactivity).toBe('function');
  });

  it('starts with idle mode outside sleep window', () => {
    mockHour = 12; // far from 4am sleep window
    const { result } = renderHook(() => useMascotLifecycle());
    expect(result.current.mode).toBe('idle');
  });

  it('plays return sequence when app opens outside sleep window and already opened today', () => {
    mockHour = 12;
    mockStoreState.lastActiveDate = '2025-06-15'; // same day
    mockToday = '2025-06-15';
    renderHook(() => useMascotLifecycle());
    // Should trigger wave (return sequence)
    expect(mockWave).toHaveBeenCalled();
  });

  it('goes to sleep when app opens during sleep window', () => {
    mockHour = 5; // within [4, 10) sleep window
    mockStoreState.dayBoundaryHour = 4;
    renderHook(() => useMascotLifecycle());
    expect(mockSleep).toHaveBeenCalled();
  });

  it('goes to sleep on first open of the day', () => {
    mockHour = 12;
    mockStoreState.lastActiveDate = '2025-06-14'; // different day
    mockToday = '2025-06-15';
    renderHook(() => useMascotLifecycle());
    expect(mockSleep).toHaveBeenCalled();
  });

  it('resetInactivity wakes up a sleeping mascot', () => {
    mockMode = 'sleeping';
    mockStoreState.lastActiveDate = '2025-06-15';
    mockToday = '2025-06-15';
    const { result } = renderHook(() => useMascotLifecycle());
    act(() => {
      result.current.resetInactivity();
    });
    expect(mockWakeUp).toHaveBeenCalled();
  });
});
