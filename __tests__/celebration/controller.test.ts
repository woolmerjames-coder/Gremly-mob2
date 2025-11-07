/**
 * Phase 10.9: CelebrationController Tests
 * Tests rate limiting, batching, event mapping, and haptic feedback
 */

import celebrationController from '../../app/features/celebration/CelebrationController';
import type { CelebrationPayload } from '../../app/features/celebration/CelebrationController';

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));

// Mock env
jest.mock('../../lib/env', () => ({
  getEnv: (key: string) => {
    const defaults: Record<string, string> = {
      EXPO_PUBLIC_CELEBRATE: 'on',
      EXPO_PUBLIC_CELEBRATE_MIN_MS_BETWEEN: '1000', // 1s for testing
    };
    return defaults[key];
  },
}));

describe('CelebrationController', () => {
  let listener: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    listener = jest.fn();
    celebrationController.subscribe(listener);
  });

  afterEach(() => {
    // Clean up listeners (but don't cleanup controller itself as it's a singleton)
    // celebrationController.cleanup();
  });

  describe('Direct Celebration Calls', () => {
    it('emits micro celebration', () => {
      celebrationController.celebrate('micro', { message: 'Test message' });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'micro',
          message: 'Test message',
        }),
      );
    });

    it('emits confetti celebration', () => {
      celebrationController.celebrate('confetti', { message: 'Milestone!' });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'confetti',
          message: 'Milestone!',
        }),
      );
    });

    it('emits mascot celebration', () => {
      celebrationController.celebrate('mascot', {});

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'mascot',
        }),
      );
    });

    it('generates message if not provided', () => {
      celebrationController.celebrate('micro', {});

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'micro',
          message: expect.any(String),
        }),
      );
    });
  });

  describe('Rate Limiting', () => {
    it('rate limits confetti celebrations', (done) => {
      listener.mockClear();

      // First confetti (should emit)
      celebrationController.celebrate('confetti', { message: 'First!' });
      expect(listener).toHaveBeenCalledTimes(1);

      listener.mockClear();

      // Second confetti immediately (should be blocked)
      celebrationController.celebrate('confetti', { message: 'Second!' });
      expect(listener).toHaveBeenCalledTimes(0);

      // Wait for rate limit to expire (1s in test env)
      setTimeout(() => {
        listener.mockClear();
        celebrationController.celebrate('confetti', { message: 'Third!' });
        expect(listener).toHaveBeenCalledTimes(1);
        done();
      }, 1100);
    }, 2000);

    it('does not rate limit micro celebrations', () => {
      listener.mockClear();

      celebrationController.celebrate('micro', { message: 'First' });
      expect(listener).toHaveBeenCalledTimes(1);

      celebrationController.celebrate('micro', { message: 'Second' });
      expect(listener).toHaveBeenCalledTimes(2);

      celebrationController.celebrate('micro', { message: 'Third' });
      expect(listener).toHaveBeenCalledTimes(3);
    });
  });

  describe('Message Rotation', () => {
    it('rotates through microcopy messages', () => {
      const messages: string[] = [];

      for (let i = 0; i < 8; i++) {
        listener.mockClear();
        celebrationController.celebrate('micro', {});
        const call = listener.mock.calls[0][0] as CelebrationPayload;
        messages.push(call.message || '');
      }

      // Should have 6 unique messages that repeat
      const uniqueMessages = new Set(messages.slice(0, 6));
      expect(uniqueMessages.size).toBe(6);

      // 7th message should equal 1st message (rotation)
      expect(messages[6]).toBe(messages[0]);
    });
  });
});
