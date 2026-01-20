/**
 * haptics.test.ts
 *
 * Tests for haptic feedback utilities including the celebration pattern.
 */

import * as Haptics from 'expo-haptics';
import {
  triggerLight,
  triggerMedium,
  triggerHeavy,
  triggerSuccess,
  triggerWarning,
  triggerError,
  triggerSelection,
  triggerCelebration,
  triggerHaptic,
} from '../haptics';

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: {
    Light: 'Light',
    Medium: 'Medium',
    Heavy: 'Heavy',
  },
  NotificationFeedbackType: {
    Success: 'Success',
    Warning: 'Warning',
    Error: 'Error',
  },
}));

describe('haptics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Individual Haptic Functions
  // ─────────────────────────────────────────────────────────────────────────

  describe('triggerLight', () => {
    it('triggers light impact feedback', async () => {
      await triggerLight();
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    });
  });

  describe('triggerMedium', () => {
    it('triggers medium impact feedback', async () => {
      await triggerMedium();
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
    });
  });

  describe('triggerHeavy', () => {
    it('triggers heavy impact feedback', async () => {
      await triggerHeavy();
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy);
    });
  });

  describe('triggerSuccess', () => {
    it('triggers success notification feedback', async () => {
      await triggerSuccess();
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success,
      );
    });
  });

  describe('triggerWarning', () => {
    it('triggers warning notification feedback', async () => {
      await triggerWarning();
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Warning,
      );
    });
  });

  describe('triggerError', () => {
    it('triggers error notification feedback', async () => {
      await triggerError();
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Error,
      );
    });
  });

  describe('triggerSelection', () => {
    it('triggers selection feedback', async () => {
      await triggerSelection();
      expect(Haptics.selectionAsync).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Celebration Pattern (Duolingo-style)
  // ─────────────────────────────────────────────────────────────────────────

  describe('triggerCelebration', () => {
    it('triggers heavy-pause-heavy-pause-success pattern', async () => {
      const celebrationPromise = triggerCelebration();

      // First heavy impact should be called immediately
      expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy);

      // Advance past first pause (100ms)
      await jest.advanceTimersByTimeAsync(100);

      // Second heavy impact
      expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);

      // Advance past second pause (150ms)
      await jest.advanceTimersByTimeAsync(150);

      // Final success notification
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success,
      );

      await celebrationPromise;
    });

    it('calls heavy impact twice', async () => {
      const celebrationPromise = triggerCelebration();

      // Advance through all timers
      await jest.runAllTimersAsync();
      await celebrationPromise;

      expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
      expect(Haptics.impactAsync).toHaveBeenNthCalledWith(1, Haptics.ImpactFeedbackStyle.Heavy);
      expect(Haptics.impactAsync).toHaveBeenNthCalledWith(2, Haptics.ImpactFeedbackStyle.Heavy);
    });

    it('ends with success notification', async () => {
      const celebrationPromise = triggerCelebration();

      await jest.runAllTimersAsync();
      await celebrationPromise;

      expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success,
      );
    });

    it('handles errors gracefully', async () => {
      (Haptics.impactAsync as jest.Mock).mockRejectedValueOnce(new Error('Device error'));

      // Should not throw
      await expect(triggerCelebration()).resolves.not.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Semantic Trigger
  // ─────────────────────────────────────────────────────────────────────────

  describe('triggerHaptic', () => {
    it('triggers light haptic for "light" type', async () => {
      await triggerHaptic('light');
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    });

    it('triggers medium haptic for "medium" type', async () => {
      await triggerHaptic('medium');
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
    });

    it('triggers heavy haptic for "heavy" type', async () => {
      await triggerHaptic('heavy');
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy);
    });

    it('triggers success haptic for "success" type', async () => {
      await triggerHaptic('success');
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success,
      );
    });

    it('triggers warning haptic for "warning" type', async () => {
      await triggerHaptic('warning');
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Warning,
      );
    });

    it('triggers error haptic for "error" type', async () => {
      await triggerHaptic('error');
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Error,
      );
    });

    it('triggers selection haptic for "selection" type', async () => {
      await triggerHaptic('selection');
      expect(Haptics.selectionAsync).toHaveBeenCalled();
    });

    it('triggers celebration pattern for "celebration" type', async () => {
      const hapticPromise = triggerHaptic('celebration');
      await jest.runAllTimersAsync();
      await hapticPromise;

      // Should have heavy impacts and success notification
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy);
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Error Handling
  // ─────────────────────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('does not throw when haptics fail', async () => {
      (Haptics.impactAsync as jest.Mock).mockRejectedValueOnce(new Error('Device not supported'));

      await expect(triggerLight()).resolves.not.toThrow();
    });

    it('does not throw when notification feedback fails', async () => {
      (Haptics.notificationAsync as jest.Mock).mockRejectedValueOnce(new Error('Device error'));

      await expect(triggerSuccess()).resolves.not.toThrow();
    });

    it('does not throw when selection feedback fails', async () => {
      (Haptics.selectionAsync as jest.Mock).mockRejectedValueOnce(new Error('Device error'));

      await expect(triggerSelection()).resolves.not.toThrow();
    });
  });
});
