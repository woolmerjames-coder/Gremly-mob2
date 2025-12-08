/**
 * Unit tests for saveable detection system.
 */

import {
  shouldShowSaveButton,
  mightBeSaveable,
  createEmptySaveableResult,
  resolveRelativeDate,
  parseDetectionResponse,
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

    // =========================================================================
    // Saveable indicators should win even with "Got it", "Noted", etc. prefix
    // =========================================================================

    describe('saveable indicators win over dismissive prefixes', () => {
      test('"Got it: call the dentist tomorrow" returns true (has "tomorrow", "call")', () => {
        expect(mightBeSaveable('Got it: call the dentist tomorrow')).toBe(true);
      });

      test('"Noted: take out trash today" returns true (has "today")', () => {
        expect(mightBeSaveable('Noted: take out trash today')).toBe(true);
      });

      test('"Sure, meeting on Friday" returns true (has "friday")', () => {
        expect(mightBeSaveable('Sure, meeting on Friday')).toBe(true);
      });

      test('"I want to meditate every morning" returns true (has "every")', () => {
        expect(mightBeSaveable('I want to meditate every morning')).toBe(true);
      });

      test('"Run 3 times a week" returns true (has frequency pattern)', () => {
        expect(mightBeSaveable('Run 3 times a week starting today')).toBe(true);
      });

      test('"Buy groceries" returns true (has "buy")', () => {
        expect(mightBeSaveable('Buy groceries from the store')).toBe(true);
      });

      test('"Call mom" returns true (has "call")', () => {
        expect(mightBeSaveable('Call mom this weekend maybe')).toBe(true);
      });

      test('"Schedule haircut next week" returns true (has "next week", "schedule")', () => {
        expect(mightBeSaveable('Schedule haircut next week')).toBe(true);
      });
    });

    // =========================================================================
    // Should return false - no saveable indicators
    // =========================================================================

    describe('no saveable indicators returns false', () => {
      test('"Hello!" returns false (pure greeting)', () => {
        expect(mightBeSaveable('Hello!')).toBe(false);
      });

      test('"Thanks!" returns false (too short)', () => {
        expect(mightBeSaveable('Thanks!')).toBe(false);
      });

      test('"Sure thing" returns false (too short)', () => {
        expect(mightBeSaveable('Sure thing')).toBe(false);
      });

      test('"Got it" alone returns false (no saveable content)', () => {
        expect(mightBeSaveable('Got it')).toBe(false);
      });

      test('"Okay" returns false (too short)', () => {
        expect(mightBeSaveable('Okay')).toBe(false);
      });

      test('"How are you?" returns false (question)', () => {
        expect(mightBeSaveable('How are you?')).toBe(false);
      });
    });

    // =========================================================================
    // Edge cases
    // =========================================================================

    describe('edge cases', () => {
      test('empty string returns false', () => {
        expect(mightBeSaveable('')).toBe(false);
      });

      test('very long text with saveable indicator buried in middle returns true', () => {
        const longText =
          'This is a very long piece of text that goes on and on with lots of filler content. ' +
          'Eventually somewhere in the middle we mention that you should call your mother tomorrow ' +
          'and then we continue with more filler content to make this really long.';
        expect(mightBeSaveable(longText)).toBe(true);
      });

      test('saveable indicator at the very end returns true', () => {
        expect(mightBeSaveable('Sounds good, let me add that to your list for tomorrow')).toBe(
          true,
        );
      });
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

  describe('resolveRelativeDate', () => {
    // Fixed date: Monday, December 8, 2025
    const FIXED_DATE = new Date('2025-12-08T12:00:00Z');

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(FIXED_DATE);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('"today" returns today\'s date', () => {
      expect(resolveRelativeDate('today')).toBe('2025-12-08');
    });

    test('"tomorrow" returns date for tomorrow', () => {
      expect(resolveRelativeDate('tomorrow')).toBe('2025-12-09');
    });

    test('"+1d" returns same as tomorrow', () => {
      expect(resolveRelativeDate('+1d')).toBe('2025-12-09');
    });

    test('"+3d" returns date 3 days from now', () => {
      expect(resolveRelativeDate('+3d')).toBe('2025-12-11');
    });

    test('"+7d" returns date 7 days from now', () => {
      expect(resolveRelativeDate('+7d')).toBe('2025-12-15');
    });

    test('"next_week" returns date 7 days from now', () => {
      expect(resolveRelativeDate('next_week')).toBe('2025-12-15');
    });

    test('"next week" (with space) returns date 7 days from now', () => {
      expect(resolveRelativeDate('next week')).toBe('2025-12-15');
    });

    // Weekday tests - Dec 8, 2025 is a Monday
    describe('weekday resolution (from Monday Dec 8)', () => {
      test('"monday" returns next Monday (7 days later)', () => {
        // If today is Monday, next Monday is in 7 days
        expect(resolveRelativeDate('monday')).toBe('2025-12-15');
      });

      test('"tuesday" returns next Tuesday (1 day later)', () => {
        expect(resolveRelativeDate('tuesday')).toBe('2025-12-09');
      });

      test('"wednesday" returns next Wednesday (2 days later)', () => {
        expect(resolveRelativeDate('wednesday')).toBe('2025-12-10');
      });

      test('"thursday" returns next Thursday (3 days later)', () => {
        expect(resolveRelativeDate('thursday')).toBe('2025-12-11');
      });

      test('"friday" returns next Friday (4 days later)', () => {
        expect(resolveRelativeDate('friday')).toBe('2025-12-12');
      });

      test('"saturday" returns next Saturday (5 days later)', () => {
        expect(resolveRelativeDate('saturday')).toBe('2025-12-13');
      });

      test('"sunday" returns next Sunday (6 days later)', () => {
        expect(resolveRelativeDate('sunday')).toBe('2025-12-14');
      });
    });

    // Case insensitivity
    test('handles uppercase "TOMORROW"', () => {
      expect(resolveRelativeDate('TOMORROW')).toBe('2025-12-09');
    });

    test('handles mixed case "Friday"', () => {
      expect(resolveRelativeDate('Friday')).toBe('2025-12-12');
    });

    // Edge cases / invalid inputs
    test('null returns undefined', () => {
      expect(resolveRelativeDate(null as any)).toBeUndefined();
    });

    test('undefined returns undefined', () => {
      expect(resolveRelativeDate(undefined)).toBeUndefined();
    });

    test('empty string returns undefined', () => {
      expect(resolveRelativeDate('')).toBeUndefined();
    });

    test('"invalid_string" returns undefined', () => {
      expect(resolveRelativeDate('invalid_string')).toBeUndefined();
    });

    test('raw date "2025-01-15" passes through', () => {
      // Per the implementation, valid YYYY-MM-DD dates are passed through
      expect(resolveRelativeDate('2025-01-15')).toBe('2025-01-15');
    });

    test('whitespace is trimmed', () => {
      expect(resolveRelativeDate('  tomorrow  ')).toBe('2025-12-09');
    });
  });

  describe('parseDetectionResponse', () => {
    // Fixed date: Monday, December 8, 2025 for deterministic dueDate resolution
    const FIXED_DATE = new Date('2025-12-08T12:00:00Z');

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(FIXED_DATE);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    // =========================================================================
    // Valid JSON responses
    // =========================================================================

    describe('valid JSON responses', () => {
      test('complete valid response with all fields populated', () => {
        const response = JSON.stringify({
          isSaveable: true,
          confidence: 0.9,
          suggestedType: 'todo',
          prefill: {
            title: 'Call the dentist',
            content: 'Call the dentist tomorrow',
            tags: ['health', 'appointments'],
            dueDate: 'tomorrow',
          },
          reasoning: 'User wants to call the dentist',
        });

        const result = parseDetectionResponse(response, 'msg-123');

        expect(result).not.toBeNull();
        expect(result!.isSaveable).toBe(true);
        expect(result!.confidence).toBe(0.9);
        expect(result!.suggestedType).toBe('todo');
        expect(result!.prefill.title).toBe('Call the dentist');
        expect(result!.prefill.content).toBe('Call the dentist tomorrow');
        expect(result!.prefill.tags).toEqual(['health', 'appointments']);
        expect(result!.prefill.dueDate).toBe('2025-12-09'); // tomorrow resolved
        expect(result!.reasoning).toBe('User wants to call the dentist');
        expect(result!.messageId).toBe('msg-123');
      });

      test('response with isSaveable: false returns result with isSaveable false', () => {
        const response = JSON.stringify({
          isSaveable: false,
          confidence: 0.3,
          suggestedType: 'log-general',
          prefill: {
            title: '',
            content: '',
            tags: [],
          },
          reasoning: 'Just a greeting',
        });

        const result = parseDetectionResponse(response, 'msg-456');

        expect(result).not.toBeNull();
        expect(result!.isSaveable).toBe(false);
        expect(result!.confidence).toBe(0.3);
      });

      test('response with missing optional fields returns result with undefined for those fields', () => {
        const response = JSON.stringify({
          isSaveable: true,
          confidence: 0.8,
          suggestedType: 'log-general',
          prefill: {
            title: 'Some note',
            content: 'Note content',
            // tags missing
            // dueDate missing
          },
        });

        const result = parseDetectionResponse(response, 'msg-789');

        expect(result).not.toBeNull();
        expect(result!.prefill.tags).toEqual([]); // defaults to empty array
        expect(result!.prefill.dueDate).toBeUndefined();
        expect(result!.reasoning).toBeUndefined();
      });

      test('handles markdown code block wrapped JSON', () => {
        const response =
          '```json\n{"isSaveable": true, "confidence": 0.85, "suggestedType": "todo", "prefill": {"title": "Test", "content": "Test content", "tags": []}}\n```';

        const result = parseDetectionResponse(response, 'msg-md');

        expect(result).not.toBeNull();
        expect(result!.isSaveable).toBe(true);
        expect(result!.confidence).toBe(0.85);
      });
    });

    // =========================================================================
    // Malformed responses
    // =========================================================================

    describe('malformed responses', () => {
      test('empty string returns null', () => {
        const result = parseDetectionResponse('', 'msg-empty');
        expect(result).toBeNull();
      });

      test('invalid JSON returns null', () => {
        const result = parseDetectionResponse('not valid json at all', 'msg-invalid');
        expect(result).toBeNull();
      });

      test('JSON missing required isSaveable field returns null', () => {
        const response = JSON.stringify({
          confidence: 0.8,
          suggestedType: 'todo',
          prefill: { title: 'Test', content: 'Test', tags: [] },
        });

        const result = parseDetectionResponse(response, 'msg-missing');
        expect(result).toBeNull();
      });

      test('JSON missing required confidence field returns null', () => {
        const response = JSON.stringify({
          isSaveable: true,
          suggestedType: 'todo',
          prefill: { title: 'Test', content: 'Test', tags: [] },
        });

        const result = parseDetectionResponse(response, 'msg-missing-conf');
        expect(result).toBeNull();
      });

      test('isSaveable as string "true" returns null (wrong type)', () => {
        const response = JSON.stringify({
          isSaveable: 'true', // wrong type
          confidence: 0.8,
          suggestedType: 'todo',
          prefill: { title: 'Test', content: 'Test', tags: [] },
        });

        const result = parseDetectionResponse(response, 'msg-wrong-type');
        expect(result).toBeNull();
      });

      test('confidence as string returns null (wrong type)', () => {
        const response = JSON.stringify({
          isSaveable: true,
          confidence: '0.8', // wrong type
          suggestedType: 'todo',
          prefill: { title: 'Test', content: 'Test', tags: [] },
        });

        const result = parseDetectionResponse(response, 'msg-wrong-conf');
        expect(result).toBeNull();
      });

      test('unknown suggestedType falls back to default', () => {
        const response = JSON.stringify({
          isSaveable: true,
          confidence: 0.8,
          suggestedType: 'unknown-type',
          prefill: { title: 'Test', content: 'Test', tags: [] },
        });

        const result = parseDetectionResponse(response, 'msg-unknown');
        expect(result).not.toBeNull();
        expect(result!.suggestedType).toBe('log-general'); // default
      });
    });

    // =========================================================================
    // dueDate handling
    // =========================================================================

    describe('dueDate handling', () => {
      test('dueDate: "tomorrow" resolved to actual date string', () => {
        const response = JSON.stringify({
          isSaveable: true,
          confidence: 0.9,
          suggestedType: 'todo',
          prefill: { title: 'Test', content: 'Test', tags: [], dueDate: 'tomorrow' },
        });

        const result = parseDetectionResponse(response, 'msg-due');
        expect(result!.prefill.dueDate).toBe('2025-12-09');
      });

      test('dueDate: "friday" resolved to actual date string', () => {
        const response = JSON.stringify({
          isSaveable: true,
          confidence: 0.9,
          suggestedType: 'todo',
          prefill: { title: 'Test', content: 'Test', tags: [], dueDate: 'friday' },
        });

        const result = parseDetectionResponse(response, 'msg-due-fri');
        expect(result!.prefill.dueDate).toBe('2025-12-12'); // Friday from Monday Dec 8
      });

      test('dueDate: "today" resolved to actual date string', () => {
        const response = JSON.stringify({
          isSaveable: true,
          confidence: 0.9,
          suggestedType: 'todo',
          prefill: { title: 'Test', content: 'Test', tags: [], dueDate: 'today' },
        });

        const result = parseDetectionResponse(response, 'msg-due-today');
        expect(result!.prefill.dueDate).toBe('2025-12-08');
      });

      test('dueDate: "+3d" resolved to 3 days from now', () => {
        const response = JSON.stringify({
          isSaveable: true,
          confidence: 0.9,
          suggestedType: 'todo',
          prefill: { title: 'Test', content: 'Test', tags: [], dueDate: '+3d' },
        });

        const result = parseDetectionResponse(response, 'msg-due-3d');
        expect(result!.prefill.dueDate).toBe('2025-12-11');
      });

      test('dueDate: null results in undefined', () => {
        const response = JSON.stringify({
          isSaveable: true,
          confidence: 0.9,
          suggestedType: 'todo',
          prefill: { title: 'Test', content: 'Test', tags: [], dueDate: null },
        });

        const result = parseDetectionResponse(response, 'msg-due-null');
        expect(result!.prefill.dueDate).toBeUndefined();
      });

      test('dueDate: invalid string results in undefined', () => {
        const response = JSON.stringify({
          isSaveable: true,
          confidence: 0.9,
          suggestedType: 'todo',
          prefill: { title: 'Test', content: 'Test', tags: [], dueDate: 'invalid_date' },
        });

        const result = parseDetectionResponse(response, 'msg-due-invalid');
        expect(result!.prefill.dueDate).toBeUndefined();
      });
    });

    // =========================================================================
    // Confidence clamping
    // =========================================================================

    describe('confidence clamping', () => {
      test('confidence > 1 is clamped to 1', () => {
        const response = JSON.stringify({
          isSaveable: true,
          confidence: 1.5,
          suggestedType: 'todo',
          prefill: { title: 'Test', content: 'Test', tags: [] },
        });

        const result = parseDetectionResponse(response, 'msg-high');
        expect(result!.confidence).toBe(1);
      });

      test('confidence < 0 is clamped to 0', () => {
        const response = JSON.stringify({
          isSaveable: true,
          confidence: -0.5,
          suggestedType: 'todo',
          prefill: { title: 'Test', content: 'Test', tags: [] },
        });

        const result = parseDetectionResponse(response, 'msg-low');
        expect(result!.confidence).toBe(0);
      });
    });
  });
});
