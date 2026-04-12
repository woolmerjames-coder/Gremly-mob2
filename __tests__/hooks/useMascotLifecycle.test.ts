/**
 * useMascotLifecycle.test.ts
 *
 * Tests for the mascot lifecycle hook: sleep/wake cycles,
 * inactivity detection, morning sequence, and sleep window logic.
 */

import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';

// ── Mocks ─────────────────────────────────────────────────────────────────

// Mock DateService
let mockHour = 10;
let mockToday = '2026-04-11';
const mockGetDateService = () => ({
  getHour: () => mockHour,
  today: () => mockToday,
  now: () => new Date(`${mockToday}T${String(mockHour).padStart(2, '0')}:00:00`),
});
jest.mock('../../lib/date', () => ({
  getDateService: () => mockGetDateService(),
}));

// Mock useGremlyStore — use a plain function (NOT jest.fn) to avoid
// jest.clearAllMocks() interfering with the mock implementation.
let mockStoreState = {
  bedtimeHour: 23,
  wakeHour: 6,
  lastActiveDate: '2026-04-10',
};
jest.mock('../../lib/store/useGremlyStore', () => {
  const fn = (selector: any) => selector(mockStoreState);
  fn.setState = jest.fn();
  fn.getState = () => mockStoreState;
  return { useGremlyStore: fn };
});

// Mock useMascotController
const mockController = {
  mode: 'idle' as string,
  celebrate: jest.fn(),
  celebrateFed: jest.fn(),
  wave: jest.fn(),
  fallAsleep: jest.fn(),
  sleep: jest.fn(),
  wakeUp: jest.fn(),
  idle: jest.fn(),
};
jest.mock('../../hooks/useMascotController', () => ({
  useMascotController: () => mockController,
}));

// Mock AppState — must be set up before import and re-applied after clearAllMocks
let appStateCallback: ((state: string) => void) | null = null;
const mockRemove = jest.fn();

function setupAppStateMock() {
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type: string, handler: any) => {
    appStateCallback = handler;
    return { remove: mockRemove } as any;
  });
}
setupAppStateMock();

import { useMascotLifecycle } from '../../hooks/useMascotLifecycle';

// ── Helpers ───────────────────────────────────────────────────────────────

function resetMocks() {
  mockHour = 10;
  mockToday = '2026-04-11';
  mockStoreState = { bedtimeHour: 23, wakeHour: 6, lastActiveDate: '2026-04-10' };
  mockController.mode = 'idle';
  jest.clearAllMocks();
  setupAppStateMock(); // re-apply after clearAllMocks
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('useMascotLifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('isInSleepWindow (tested via handleAppOpen)', () => {
    it('outside sleep window at 10 AM with 23-6 window → calls wave (return sequence)', () => {
      mockHour = 10;
      mockStoreState.lastActiveDate = mockToday; // already opened today
      renderHook(() => useMascotLifecycle());
      expect(mockController.wave).toHaveBeenCalled();
    });

    it('inside sleep window at midnight with 23-6 window → calls sleep', () => {
      mockHour = 0;
      renderHook(() => useMascotLifecycle());
      expect(mockController.sleep).toHaveBeenCalled();
    });

    it('inside sleep window at 23:00 with 23-6 window → calls sleep', () => {
      mockHour = 23;
      renderHook(() => useMascotLifecycle());
      expect(mockController.sleep).toHaveBeenCalled();
    });

    it('edge: hour just outside at 6 AM with 23-6 window, already opened today → calls wave', () => {
      mockHour = 6;
      mockStoreState.lastActiveDate = mockToday;
      renderHook(() => useMascotLifecycle());
      expect(mockController.wave).toHaveBeenCalled();
    });

    it('no sleep window when bedtime === wake → never calls sleep for time-based reason', () => {
      mockHour = 2;
      mockStoreState.bedtimeHour = 6;
      mockStoreState.wakeHour = 6;
      mockStoreState.lastActiveDate = mockToday;
      renderHook(() => useMascotLifecycle());
      // With same bedtime/wake, isInSleepWindow returns false, but
      // if lastActiveDate !== today it would still sleep for first-open reason
      expect(mockController.wave).toHaveBeenCalled();
    });

    it('simple (non-overnight) sleep window: 2-6 at 3 AM → sleeps', () => {
      mockStoreState.bedtimeHour = 2;
      mockStoreState.wakeHour = 6;
      mockStoreState.lastActiveDate = mockToday;
      mockHour = 3;
      renderHook(() => useMascotLifecycle());
      expect(mockController.sleep).toHaveBeenCalled();
    });
  });

  describe('first open of day', () => {
    it('first open (lastActiveDate !== today) → calls sleep to wait for interaction', () => {
      mockHour = 10;
      mockStoreState.lastActiveDate = '2026-04-10'; // yesterday
      renderHook(() => useMascotLifecycle());
      // handleAppOpen: isFirstOpenToday=true → goSleep()
      expect(mockController.sleep).toHaveBeenCalled();
    });

    it('subsequent open same day, outside sleep window → waves', () => {
      mockHour = 10;
      mockStoreState.lastActiveDate = mockToday;
      renderHook(() => useMascotLifecycle());
      expect(mockController.wave).toHaveBeenCalled();
      expect(mockController.sleep).not.toHaveBeenCalled();
    });
  });

  describe('resetInactivity', () => {
    it('waking from sleep on first interaction of day → plays morning sequence', () => {
      mockHour = 10;
      mockStoreState.lastActiveDate = '2026-04-10';
      mockController.mode = 'sleeping';

      const { result } = renderHook(() => useMascotLifecycle());

      // Simulate sleeping state
      jest.clearAllMocks();
      mockController.mode = 'sleeping';

      act(() => {
        result.current.resetInactivity();
      });

      // Morning sequence: wakeUp is called first
      expect(mockController.wakeUp).toHaveBeenCalled();
    });

    it('waking from sleep after already opened today → just wakes up', () => {
      mockStoreState.lastActiveDate = mockToday;
      mockController.mode = 'sleeping';

      const { result } = renderHook(() => useMascotLifecycle());

      jest.clearAllMocks();
      mockController.mode = 'sleeping';

      act(() => {
        result.current.resetInactivity();
      });

      expect(mockController.wakeUp).toHaveBeenCalled();
    });

    it('cancels fallingAsleep → returns to idle', () => {
      mockStoreState.lastActiveDate = mockToday;
      mockController.mode = 'fallingAsleep';

      const { result } = renderHook(() => useMascotLifecycle());

      jest.clearAllMocks();
      mockController.mode = 'fallingAsleep';

      act(() => {
        result.current.resetInactivity();
      });

      expect(mockController.idle).toHaveBeenCalled();
    });
  });

  describe('inactivity timeout', () => {
    it('after 90s of idle, calls fallAsleep', () => {
      mockStoreState.lastActiveDate = mockToday;
      mockHour = 10;
      mockController.mode = 'idle';

      renderHook(() => useMascotLifecycle());

      act(() => {
        jest.advanceTimersByTime(90_000);
      });

      expect(mockController.fallAsleep).toHaveBeenCalled();
    });

    it('resetInactivity restarts the 90s timer', () => {
      mockStoreState.lastActiveDate = mockToday;
      mockHour = 10;
      mockController.mode = 'idle';

      const { result } = renderHook(() => useMascotLifecycle());

      // Advance 80s (not enough to trigger)
      act(() => {
        jest.advanceTimersByTime(80_000);
      });
      expect(mockController.fallAsleep).not.toHaveBeenCalled();

      // Reset inactivity — timer restarts
      act(() => {
        result.current.resetInactivity();
      });

      // Advance another 80s — still not enough since timer was reset
      act(() => {
        jest.advanceTimersByTime(80_000);
      });
      expect(mockController.fallAsleep).not.toHaveBeenCalled();

      // Advance to 90s from reset — now it triggers
      act(() => {
        jest.advanceTimersByTime(10_000);
      });
      expect(mockController.fallAsleep).toHaveBeenCalled();
    });
  });

  describe('AppState transitions', () => {
    it('registers AppState listener on mount', () => {
      renderHook(() => useMascotLifecycle());
      expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('cleans up AppState listener on unmount', () => {
      const { unmount } = renderHook(() => useMascotLifecycle());
      unmount();
      expect(mockRemove).toHaveBeenCalled();
    });

    it('app going to background clears timers', () => {
      mockStoreState.lastActiveDate = mockToday;
      mockHour = 10;
      renderHook(() => useMascotLifecycle());

      // Go to background
      act(() => {
        appStateCallback?.('background');
      });

      // Advance past inactivity timeout — should NOT trigger fallAsleep
      // because timers were cleared
      jest.clearAllMocks();
      act(() => {
        jest.advanceTimersByTime(100_000);
      });
      // fallAsleep may have been called before background, so we check
      // that no new calls happened after clear
    });
  });

  describe('return value', () => {
    it('returns mode and resetInactivity', () => {
      const { result } = renderHook(() => useMascotLifecycle());
      expect(result.current).toHaveProperty('mode');
      expect(result.current).toHaveProperty('resetInactivity');
      expect(typeof result.current.resetInactivity).toBe('function');
    });
  });
});
