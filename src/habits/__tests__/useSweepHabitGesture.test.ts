/**
 * useSweepHabitGesture.test.ts
 *
 * Tests for the shared habit gesture hook.
 * Validates message arrays and hook initialization.
 */

import { renderHook, act } from '@testing-library/react-native';
import { useSweepHabitGesture } from '../useSweepHabitGesture';

// Mock reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

describe('useSweepHabitGesture', () => {
  const defaultParams = {
    id: 'test-habit-1',
    isCompleted: false,
    onToggle: jest.fn(),
    isAheadOfTarget: false,
    isBreakHabit: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('returns expected interface', () => {
      const { result } = renderHook(() => useSweepHabitGesture(defaultParams));

      expect(result.current).toHaveProperty('progress');
      expect(result.current).toHaveProperty('confirmMessage');
      expect(result.current).toHaveProperty('isCompletedState');
      expect(result.current).toHaveProperty('triggerHaptic');
      expect(result.current).toHaveProperty('handleComplete');
      expect(result.current).toHaveProperty('handleUncomplete');
      expect(result.current).toHaveProperty('resetProgress');
      expect(result.current).toHaveProperty('confirmTextAnimatedStyle');
      expect(result.current).toHaveProperty('checkAnimatedStyle');
    });

    it('initializes progress based on isCompleted prop', () => {
      const { result: incompleteResult } = renderHook(() =>
        useSweepHabitGesture({ ...defaultParams, isCompleted: false }),
      );
      expect(incompleteResult.current.progress.value).toBe(0);

      const { result: completeResult } = renderHook(() =>
        useSweepHabitGesture({ ...defaultParams, isCompleted: true }),
      );
      expect(completeResult.current.progress.value).toBe(1);
    });

    it('initializes isCompletedState based on isCompleted prop', () => {
      const { result: incompleteResult } = renderHook(() =>
        useSweepHabitGesture({ ...defaultParams, isCompleted: false }),
      );
      expect(incompleteResult.current.isCompletedState.value).toBe(false);

      const { result: completeResult } = renderHook(() =>
        useSweepHabitGesture({ ...defaultParams, isCompleted: true }),
      );
      expect(completeResult.current.isCompletedState.value).toBe(true);
    });

    it('initializes confirmMessage as empty string', () => {
      const { result } = renderHook(() => useSweepHabitGesture(defaultParams));
      expect(result.current.confirmMessage).toBe('');
    });
  });

  describe('haptic feedback', () => {
    it('triggerHaptic is a callable function', () => {
      const { result } = renderHook(() => useSweepHabitGesture(defaultParams));
      expect(typeof result.current.triggerHaptic).toBe('function');
    });

    it('triggerHaptic accepts expected parameters', () => {
      const { result } = renderHook(() => useSweepHabitGesture(defaultParams));
      // Should not throw
      expect(() => result.current.triggerHaptic('light')).not.toThrow();
      expect(() => result.current.triggerHaptic('medium')).not.toThrow();
      expect(() => result.current.triggerHaptic('success')).not.toThrow();
    });
  });

  describe('handleComplete', () => {
    it('is a callable function', () => {
      const { result } = renderHook(() => useSweepHabitGesture(defaultParams));
      expect(typeof result.current.handleComplete).toBe('function');
    });

    it('calls onToggle with id and true', () => {
      const onToggle = jest.fn();
      const { result } = renderHook(() => useSweepHabitGesture({ ...defaultParams, onToggle }));

      act(() => {
        result.current.handleComplete();
      });

      expect(onToggle).toHaveBeenCalledWith('test-habit-1', true);
    });

    it('sets confirmMessage after completion', () => {
      const { result } = renderHook(() => useSweepHabitGesture(defaultParams));

      act(() => {
        result.current.handleComplete();
      });

      // Should have a non-empty confirmation message
      expect(result.current.confirmMessage).toBeTruthy();
    });
  });

  describe('handleUncomplete', () => {
    it('is a callable function', () => {
      const { result } = renderHook(() => useSweepHabitGesture(defaultParams));
      expect(typeof result.current.handleUncomplete).toBe('function');
    });

    it('calls onToggle with id and false', () => {
      const onToggle = jest.fn();
      const { result } = renderHook(() =>
        useSweepHabitGesture({ ...defaultParams, isCompleted: true, onToggle }),
      );

      act(() => {
        result.current.handleUncomplete();
      });

      expect(onToggle).toHaveBeenCalledWith('test-habit-1', false);
    });
  });

  describe('resetProgress', () => {
    it('is a callable function', () => {
      const { result } = renderHook(() => useSweepHabitGesture(defaultParams));
      expect(typeof result.current.resetProgress).toBe('function');
    });

    it('can be called without throwing', () => {
      const { result } = renderHook(() => useSweepHabitGesture(defaultParams));
      expect(() => result.current.resetProgress()).not.toThrow();
    });
  });

  describe('message selection', () => {
    describe('build habit messages', () => {
      it('selects from BUILD_CONFIRM_MESSAGES for regular build habit', () => {
        const buildMessages = [
          'BOOM',
          'Smashed it',
          'Another one',
          'Done',
          'Nailed it',
          'Got it',
          'Crushed it',
        ];

        const { result } = renderHook(() =>
          useSweepHabitGesture({
            ...defaultParams,
            isBreakHabit: false,
            isAheadOfTarget: false,
          }),
        );

        act(() => {
          result.current.handleComplete();
        });

        expect(buildMessages).toContain(result.current.confirmMessage);
      });
    });

    describe('bonus messages', () => {
      it('selects from BONUS_MESSAGES when ahead of target', () => {
        const bonusMessages = [
          'BONUS!',
          'Extra credit',
          'Overachiever',
          'Going hard',
          'Legend',
          'Above & beyond',
          'On fire 🔥',
        ];

        const { result } = renderHook(() =>
          useSweepHabitGesture({
            ...defaultParams,
            isBreakHabit: false,
            isAheadOfTarget: true,
          }),
        );

        act(() => {
          result.current.handleComplete();
        });

        expect(bonusMessages).toContain(result.current.confirmMessage);
      });
    });

    describe('break habit messages', () => {
      it('selects from BREAK_CONFIRM_MESSAGES for break habit', () => {
        const breakMessages = [
          'Stayed strong',
          'Another day',
          'Still going',
          'Held steady',
          'Resisted',
          'On track',
          'Going strong',
        ];

        const { result } = renderHook(() =>
          useSweepHabitGesture({
            ...defaultParams,
            isBreakHabit: true,
            isAheadOfTarget: false,
          }),
        );

        act(() => {
          result.current.handleComplete();
        });

        expect(breakMessages).toContain(result.current.confirmMessage);
      });

      it('prioritizes break habit messages over bonus messages', () => {
        const breakMessages = [
          'Stayed strong',
          'Another day',
          'Still going',
          'Held steady',
          'Resisted',
          'On track',
          'Going strong',
        ];

        const { result } = renderHook(() =>
          useSweepHabitGesture({
            ...defaultParams,
            isBreakHabit: true,
            isAheadOfTarget: true, // Even when ahead of target
          }),
        );

        act(() => {
          result.current.handleComplete();
        });

        // Should use break messages, not bonus messages
        expect(breakMessages).toContain(result.current.confirmMessage);
      });
    });
  });

  describe('animated styles', () => {
    it('confirmTextAnimatedStyle is an object', () => {
      const { result } = renderHook(() => useSweepHabitGesture(defaultParams));
      expect(typeof result.current.confirmTextAnimatedStyle).toBe('object');
    });

    it('checkAnimatedStyle is an object', () => {
      const { result } = renderHook(() => useSweepHabitGesture(defaultParams));
      expect(typeof result.current.checkAnimatedStyle).toBe('object');
    });
  });
});
