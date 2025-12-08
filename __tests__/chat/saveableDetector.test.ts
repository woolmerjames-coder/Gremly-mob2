/**
 * Unit tests for saveable detection system.
 */

import {
  shouldShowSaveButton,
  mightBeSaveable,
  createEmptySaveableResult,
} from '../../lib/chat/saveableDetector';

import { SaveableResult, SAVEABLE_THRESHOLDS } from '../../lib/chat/saveableTypes';

import { detectFrequency, hasFrequencyIndicator } from '../../lib/chat/frequencyDetector';

describe('saveableDetector', () => {
  describe('shouldShowSaveButton', () => {
    const mockSaveableResult: SaveableResult = {
      isSaveable: true,
      confidence: 0.8,
      suggestedType: 'log-general',
      prefill: { title: 'Test', content: 'Test content', tags: [] },
      detectedAt: new Date().toISOString(),
      messageId: 'msg-1',
    };

    test('returns true when saveable, operational mode, not in cooldown', () => {
      expect(shouldShowSaveButton(mockSaveableResult, 'operational', false)).toBe(true);
    });

    test('returns true when saveable, neutral mode, not in cooldown', () => {
      expect(shouldShowSaveButton(mockSaveableResult, 'neutral', false)).toBe(true);
    });

    test('returns false when in reflective mode', () => {
      expect(shouldShowSaveButton(mockSaveableResult, 'reflective', false)).toBe(false);
    });

    test('returns false when in cooldown', () => {
      expect(shouldShowSaveButton(mockSaveableResult, 'operational', true)).toBe(false);
    });

    test('returns false when not saveable', () => {
      const notSaveable = { ...mockSaveableResult, isSaveable: false };
      expect(shouldShowSaveButton(notSaveable, 'operational', false)).toBe(false);
    });

    test('returns false when all conditions fail', () => {
      const notSaveable = { ...mockSaveableResult, isSaveable: false };
      expect(shouldShowSaveButton(notSaveable, 'reflective', true)).toBe(false);
    });
  });

  describe('createEmptySaveableResult', () => {
    test('returns result with isSaveable false', () => {
      const result = createEmptySaveableResult('msg-123');
      expect(result.isSaveable).toBe(false);
      expect(result.messageId).toBe('msg-123');
      expect(result.suggestedType).toBe('log-general');
    });

    test('returns result with empty prefill', () => {
      const result = createEmptySaveableResult('msg-456');
      expect(result.prefill.title).toBe('');
      expect(result.prefill.content).toBe('');
      expect(result.prefill.tags).toEqual([]);
    });

    test('returns result with confidence 0', () => {
      const result = createEmptySaveableResult('msg-789');
      expect(result.confidence).toBe(0);
    });

    test('includes detectedAt timestamp', () => {
      const before = new Date().toISOString();
      const result = createEmptySaveableResult('msg-test');
      const after = new Date().toISOString();

      expect(result.detectedAt).toBeDefined();
      expect(result.detectedAt >= before).toBe(true);
      expect(result.detectedAt <= after).toBe(true);
    });
  });

  describe('SAVEABLE_THRESHOLDS', () => {
    test('TODO threshold is higher than FLOOR', () => {
      expect(SAVEABLE_THRESHOLDS.TODO).toBeGreaterThan(SAVEABLE_THRESHOLDS.FLOOR);
    });

    test('HABIT threshold is higher than FLOOR', () => {
      expect(SAVEABLE_THRESHOLDS.HABIT).toBeGreaterThan(SAVEABLE_THRESHOLDS.FLOOR);
    });

    test('DEFAULT_TYPE is log-general', () => {
      expect(SAVEABLE_THRESHOLDS.DEFAULT_TYPE).toBe('log-general');
    });

    test('FLOOR is 0.6', () => {
      expect(SAVEABLE_THRESHOLDS.FLOOR).toBe(0.6);
    });

    test('TODO is 0.92', () => {
      expect(SAVEABLE_THRESHOLDS.TODO).toBe(0.92);
    });

    test('HABIT is 0.9', () => {
      expect(SAVEABLE_THRESHOLDS.HABIT).toBe(0.9);
    });
  });

  describe('mightBeSaveable', () => {
    test('returns false for short messages', () => {
      expect(mightBeSaveable('Hi!')).toBe(false);
      expect(mightBeSaveable('Got it.')).toBe(false);
    });

    test('returns false for questions', () => {
      expect(mightBeSaveable('What time works best for you?')).toBe(false);
      expect(mightBeSaveable('How can I help you today?')).toBe(false);
    });

    test('returns false for greetings', () => {
      expect(mightBeSaveable('Hi there! How are you doing today?')).toBe(false);
      expect(mightBeSaveable('Hello! Nice to meet you.')).toBe(false);
    });

    test('returns true for recommendations', () => {
      expect(mightBeSaveable("I'd suggest trying the Pomodoro technique for better focus.")).toBe(
        true,
      );
    });

    test('returns true for lists', () => {
      expect(
        mightBeSaveable('Here are some tips:\n1. Start small\n2. Be consistent\n3. Track progress'),
      ).toBe(true);
    });

    test('returns true for schedules', () => {
      expect(
        mightBeSaveable(
          "Here's a morning routine: wake up at 7am, meditate for 10 minutes, then exercise.",
        ),
      ).toBe(true);
    });

    test('returns false for empty string', () => {
      expect(mightBeSaveable('')).toBe(false);
    });

    test('returns true for content with time indicators', () => {
      expect(mightBeSaveable('You should do this daily for best results.')).toBe(true);
      expect(mightBeSaveable("Let's schedule this for tomorrow morning.")).toBe(true);
    });

    test('returns true for content with action words', () => {
      expect(mightBeSaveable('I recommend starting with a simple exercise routine.')).toBe(true);
      expect(mightBeSaveable('Consider trying meditation before bed.')).toBe(true);
    });
  });
});

describe('frequencyDetector', () => {
  describe('detectFrequency', () => {
    describe('daily frequency', () => {
      test('detects "every day"', () => {
        expect(detectFrequency('every day')?.frequency).toBe('daily');
      });

      test('detects "every morning"', () => {
        expect(detectFrequency('every morning')?.frequency).toBe('daily');
      });

      test('detects "daily meditation"', () => {
        expect(detectFrequency('daily meditation')?.frequency).toBe('daily');
      });

      test('detects "every single day"', () => {
        expect(detectFrequency('every single day')?.frequency).toBe('daily');
      });

      test('detects "each day"', () => {
        expect(detectFrequency('each day')?.frequency).toBe('daily');
      });

      test('detects "every night"', () => {
        expect(detectFrequency('every night')?.frequency).toBe('daily');
      });
    });

    describe('weekly frequency', () => {
      test('detects "every week"', () => {
        expect(detectFrequency('every week')?.frequency).toBe('weekly');
      });

      test('detects "once a week"', () => {
        expect(detectFrequency('once a week')?.frequency).toBe('weekly');
      });

      test('detects "3 times a week"', () => {
        const result = detectFrequency('3 times a week');
        expect(result?.frequency).toBe('weekly');
        expect(result?.details?.count).toBe(3);
      });

      test('detects "twice a week"', () => {
        const result = detectFrequency('twice a week');
        expect(result?.frequency).toBe('weekly');
        expect(result?.details?.count).toBe(2);
      });

      test('detects "weekly"', () => {
        expect(detectFrequency('weekly')?.frequency).toBe('weekly');
      });
    });

    describe('monthly frequency', () => {
      test('detects "every month"', () => {
        expect(detectFrequency('every month')?.frequency).toBe('monthly');
      });

      test('detects "once a month"', () => {
        expect(detectFrequency('once a month')?.frequency).toBe('monthly');
      });

      test('detects "monthly"', () => {
        expect(detectFrequency('monthly')?.frequency).toBe('monthly');
      });
    });

    describe('weekday/weekend frequency', () => {
      test('detects "weekdays"', () => {
        expect(detectFrequency('on weekdays')?.frequency).toBe('weekdays');
      });

      test('detects "weekends"', () => {
        expect(detectFrequency('on weekends')?.frequency).toBe('weekends');
      });

      test('detects "monday through friday"', () => {
        expect(detectFrequency('monday through friday')?.frequency).toBe('weekdays');
      });
    });

    describe('no frequency', () => {
      test('returns null for "I want to exercise"', () => {
        expect(detectFrequency('I want to exercise')).toBeNull();
      });

      test('returns null for "thinking about running"', () => {
        expect(detectFrequency('thinking about running')).toBeNull();
      });

      test('returns null for empty string', () => {
        expect(detectFrequency('')).toBeNull();
      });

      test('returns null for random text', () => {
        expect(detectFrequency('The quick brown fox jumps over the lazy dog')).toBeNull();
      });
    });

    describe('time of day extraction', () => {
      test('extracts "morning" from "every morning"', () => {
        const result = detectFrequency('every morning');
        expect(result?.details?.timeOfDay).toBe('morning');
      });

      test('extracts "evening" from "every evening"', () => {
        const result = detectFrequency('every evening');
        expect(result?.details?.timeOfDay).toBe('evening');
      });

      test('extracts "night" from "every night"', () => {
        const result = detectFrequency('every night');
        expect(result?.details?.timeOfDay).toBe('night');
      });
    });

    describe('confidence scores', () => {
      test('daily patterns have high confidence', () => {
        const result = detectFrequency('every day');
        expect(result?.confidence).toBeGreaterThanOrEqual(0.9);
      });

      test('weekly patterns have high confidence', () => {
        const result = detectFrequency('every week');
        expect(result?.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });
  });

  describe('hasFrequencyIndicator', () => {
    test('returns true for "every day"', () => {
      expect(hasFrequencyIndicator('every day')).toBe(true);
    });

    test('returns true for "weekly routine"', () => {
      expect(hasFrequencyIndicator('weekly routine')).toBe(true);
    });

    test('returns true for "3 times a week"', () => {
      expect(hasFrequencyIndicator('3 times a week')).toBe(true);
    });

    test('returns true for "daily"', () => {
      expect(hasFrequencyIndicator('daily')).toBe(true);
    });

    test('returns true for "monthly"', () => {
      expect(hasFrequencyIndicator('monthly')).toBe(true);
    });

    test('returns true for day names', () => {
      expect(hasFrequencyIndicator('every Monday')).toBe(true);
      expect(hasFrequencyIndicator('on Tuesdays')).toBe(true);
    });

    test('returns false for "I want to run"', () => {
      expect(hasFrequencyIndicator('I want to run')).toBe(false);
    });

    test('returns false for "thinking about it"', () => {
      expect(hasFrequencyIndicator('thinking about it')).toBe(false);
    });

    test('returns false for empty string', () => {
      expect(hasFrequencyIndicator('')).toBe(false);
    });

    test('returns true for "habit" mention', () => {
      expect(hasFrequencyIndicator('building a habit')).toBe(true);
    });

    test('returns true for "routine" mention', () => {
      expect(hasFrequencyIndicator('morning routine')).toBe(true);
    });
  });
});
