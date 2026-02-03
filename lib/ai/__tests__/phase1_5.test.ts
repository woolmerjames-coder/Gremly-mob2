/**
 * Phase 1.5 Ambiguity Detection Tests
 *
 * Tests the trigger logic for determining when to run ambiguity detection,
 * and the API call behavior for getting clarification questions.
 */

import { shouldRunPhase1_5, runPhase1_5, checkAmbiguity } from '../phase1_5';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock env
jest.mock('../../env', () => ({
  env: {
    cortexUrl: 'https://test-cortex.example.com',
  },
}));

// Mock dateService
jest.mock('../../date/DateService', () => ({
  dateService: {
    today: () => '2025-12-05',
  },
}));

describe('shouldRunPhase1_5', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('returns { shouldRun: true }', () => {
    it('for short log classification with temporal info: "dentist Tuesday"', () => {
      const result = shouldRunPhase1_5('dentist Tuesday', 'log', 'general', 0.7);
      expect(result.shouldRun).toBe(true);
      expect(result.detectedTemporal).toBe('Tuesday');
    });

    it('for noun + date pattern: "mom birthday March 5"', () => {
      const result = shouldRunPhase1_5('mom birthday March 5', 'log', 'general', 0.6);
      expect(result.shouldRun).toBe(true);
      expect(result.detectedTemporal).toBe('March');
    });

    it('for very short inputs: "standing desk"', () => {
      const result = shouldRunPhase1_5('standing desk', 'log', 'idea', 0.5);
      expect(result.shouldRun).toBe(true);
    });

    it('for event with date: "gym Monday"', () => {
      const result = shouldRunPhase1_5('gym Monday', 'log', 'general', 0.7);
      expect(result.shouldRun).toBe(true);
      expect(result.detectedTemporal).toBe('Monday');
    });

    it('for short date input without verb: "dinner tomorrow"', () => {
      const result = shouldRunPhase1_5('dinner tomorrow', 'log', 'general', 0.65);
      expect(result.shouldRun).toBe(true);
      expect(result.detectedTemporal).toBe('tomorrow');
    });
  });

  describe('returns { shouldRun: false }', () => {
    it('for explicit frequency patterns: "run every morning"', () => {
      const result = shouldRunPhase1_5('run every morning', 'habit', null, 0.9);
      expect(result.shouldRun).toBe(false);
    });

    it('for weekly frequency: "meditate daily"', () => {
      const result = shouldRunPhase1_5('meditate daily', 'habit', null, 0.85);
      expect(result.shouldRun).toBe(false);
    });

    it('for emotional content: "feeling grateful today"', () => {
      const result = shouldRunPhase1_5('feeling grateful today', 'log', 'journal', 0.8);
      expect(result.shouldRun).toBe(false);
    });

    it('for stressed/overwhelmed content: "overwhelmed with work"', () => {
      const result = shouldRunPhase1_5('overwhelmed with work', 'log', 'journal', 0.75);
      expect(result.shouldRun).toBe(false);
    });

    it('for clear action verbs with high confidence: "call doctor tomorrow"', () => {
      const result = shouldRunPhase1_5('call doctor tomorrow', 'todo', null, 0.85);
      expect(result.shouldRun).toBe(false);
    });

    it('for action verb with high confidence: "book flight for vacation"', () => {
      const result = shouldRunPhase1_5('book flight for vacation', 'todo', null, 0.8);
      expect(result.shouldRun).toBe(false);
    });

    it('for classified as todo with action: "schedule dentist appointment"', () => {
      const result = shouldRunPhase1_5('schedule dentist appointment', 'todo', null, 0.9);
      expect(result.shouldRun).toBe(false);
    });
  });

  describe('temporal pattern detection', () => {
    it('detects day names: Monday, Tuesday, etc.', () => {
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      for (const day of days) {
        const result = shouldRunPhase1_5(`event ${day}`, 'log', 'general', 0.6);
        expect(result.detectedTemporal?.toLowerCase()).toBe(day.toLowerCase());
      }
    });

    it('detects abbreviated day names: Mon, Tue, etc.', () => {
      const result = shouldRunPhase1_5('meeting Tue', 'log', 'general', 0.6);
      expect(result.detectedTemporal).toBe('Tue');
    });

    it('detects relative dates: tomorrow, today, tonight', () => {
      expect(shouldRunPhase1_5('party tomorrow', 'log', 'general', 0.6).detectedTemporal).toBe(
        'tomorrow',
      );
      expect(shouldRunPhase1_5('lunch today', 'log', 'general', 0.6).detectedTemporal).toBe(
        'today',
      );
      expect(shouldRunPhase1_5('dinner tonight', 'log', 'general', 0.6).detectedTemporal).toBe(
        'tonight',
      );
    });

    it('detects month names', () => {
      const result = shouldRunPhase1_5('birthday January', 'log', 'general', 0.6);
      expect(result.detectedTemporal).toBe('January');
    });

    it('detects ordinal dates: 5th, 1st, 23rd', () => {
      const result = shouldRunPhase1_5('meeting on the 5th', 'log', 'general', 0.6);
      expect(result.detectedTemporal).toBe('5th');
    });
  });
});

describe('runPhase1_5', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls cortex API with correct payload', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        is_ambiguous: true,
        question: 'Is this an event or a task?',
        options: [
          { id: 'event', label: 'Event on that date' },
          { id: 'task', label: 'Task to do by then' },
        ],
      }),
    });

    await runPhase1_5('dentist Tuesday', 'log', 'general', 'Tuesday');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test-cortex.example.com',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"type":"clarify-ambiguity"'),
      }),
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody).toEqual({
      type: 'clarify-ambiguity',
      text: 'dentist Tuesday',
      bucket: 'log',
      subtype: 'general',
      detectedTemporal: 'Tuesday',
      currentDate: '2025-12-05',
      ambiguityReason: 'unclear intent',
      userSpaces: [],
    });
  });

  it('returns question and options on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        is_ambiguous: true,
        question: 'What would you like to do?',
        options: [
          { id: 'opt1', label: 'Option 1', action: { bucket: 'todo' } },
          { id: 'opt2', label: 'Option 2', action: { bucket: 'log' } },
        ],
      }),
    });

    const result = await runPhase1_5('test input', 'log', null, null);

    expect(result.is_ambiguous).toBe(true);
    expect(result.question).toBe('What would you like to do?');
    expect(result.options).toHaveLength(2);
    expect(result.options?.[0].id).toBe('opt1');
    expect(result.latency_ms).toBeDefined();
  });

  it('handles HTTP error gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await runPhase1_5('test input', 'log', null, null);

    expect(result.is_ambiguous).toBe(false);
    expect(result.reason).toBe('http_error');
    expect(result.latency_ms).toBeDefined();
  });

  it('handles network error gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await runPhase1_5('test input', 'log', null, null);

    expect(result.is_ambiguous).toBe(false);
    expect(result.reason).toBe('request_error');
    expect(result.latency_ms).toBeDefined();
  });

  it('handles timeout gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Request timeout'));

    const result = await runPhase1_5('test input', 'log', null, null);

    expect(result.is_ambiguous).toBe(false);
    expect(result.reason).toBe('request_error');
  });

  it('handles malformed JSON response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });

    const result = await runPhase1_5('test input', 'log', null, null);

    expect(result.is_ambiguous).toBe(false);
    expect(result.reason).toBe('request_error');
  });
});

describe('checkAmbiguity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when trigger conditions are not met', async () => {
    // Clear action verb with high confidence - should not trigger
    const result = await checkAmbiguity('call doctor tomorrow', 'todo', null, 0.9);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null when frequency pattern detected', async () => {
    const result = await checkAmbiguity('run every morning', 'habit', null, 0.8);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls API and returns result when trigger conditions are met', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        is_ambiguous: true,
        question: 'Is this a reminder or an event?',
        options: [{ id: 'reminder', label: 'Reminder' }],
      }),
    });

    const result = await checkAmbiguity('dentist Tuesday', 'log', 'general', 0.6);

    expect(mockFetch).toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result?.is_ambiguous).toBe(true);
    expect(result?.question).toBe('Is this a reminder or an event?');
  });

  it('returns null when API says not ambiguous', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        is_ambiguous: false,
        reason: 'clear_intent',
      }),
    });

    const result = await checkAmbiguity('gym Monday', 'log', 'general', 0.5);

    expect(mockFetch).toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
