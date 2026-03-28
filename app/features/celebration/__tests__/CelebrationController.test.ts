/**
 * CelebrationController._pendingAgeUp queue tests
 *
 * Verifies that age-up celebrations are queued when suppressed
 * (e.g., during sweep flow) and fired when suppression is released.
 */

// Mock dependencies
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('../../../../lib/env', () => ({
  getEnv: jest.fn((key: string) => {
    if (key === 'EXPO_PUBLIC_CELEBRATE') return 'on';
    if (key === 'EXPO_PUBLIC_CELEBRATE_MIN_MS_BETWEEN') return '0';
    return '';
  }),
}));

jest.mock('../celebrationBus', () => ({
  subscribeToCelebrationEvents: jest.fn(() => jest.fn()),
}));

jest.mock('../../../../lib/date', () => ({
  getDateService: () => ({
    now: () => new Date('2026-01-10T12:00:00Z'),
  }),
}));

// Import AFTER mocks
import celebrationController from '../CelebrationController';

describe('CelebrationController._pendingAgeUp', () => {
  let listener: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    listener = jest.fn();
    celebrationController.subscribe(listener);
    // Reset suppression state
    celebrationController.suppressAgeUpCelebration(false);
    listener.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('queues age-up when suppressed and fires on release', () => {
    celebrationController.suppressAgeUpCelebration(true);

    celebrationController.showAgeUpCelebration(6, {
      tierName: 'Guide',
      isTierTransition: false,
    });

    // Should NOT have fired yet
    expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'age_up' }));

    // Release suppression
    celebrationController.suppressAgeUpCelebration(false);

    // The queued celebration fires after 400ms setTimeout
    jest.advanceTimersByTime(400);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'age_up',
        age: 6,
        tierName: 'Guide',
      }),
    );
  });

  it('fires immediately when not suppressed', () => {
    celebrationController.showAgeUpCelebration(7, {
      tierName: 'Mentor',
      isTierTransition: true,
      previousTierName: 'Guide',
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'age_up',
        age: 7,
        isTierTransition: true,
        previousTierName: 'Guide',
      }),
    );
  });

  it('does not fire queued celebration if none was queued', () => {
    celebrationController.suppressAgeUpCelebration(true);
    // No showAgeUpCelebration call

    celebrationController.suppressAgeUpCelebration(false);
    jest.advanceTimersByTime(500);

    expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'age_up' }));
  });
});
