/**
 * Tests for gremlyAge.js - Gremly voice mode based on relationship age + data maturity
 */

import { getAgeGuidance } from '../gremlyAge.js';

describe('gremlyAge', () => {
  describe('getAgeGuidance', () => {
    it('returns NEW stage with all expected properties', () => {
      const result = getAgeGuidance(null, null);

      expect(result).toHaveProperty('stage');
      expect(result).toHaveProperty('days');
      expect(result).toHaveProperty('promptGuidance');
      expect(result).toHaveProperty('logSummary');
    });

    it('returns NEW for null relationshipStartedAt', () => {
      const result = getAgeGuidance(null, null);

      expect(result.stage).toBe('NEW');
      expect(result.days).toBe(0);
    });

    it('returns NEW for undefined relationshipStartedAt', () => {
      const result = getAgeGuidance(undefined, null);

      expect(result.stage).toBe('NEW');
      expect(result.days).toBe(0);
    });

    it('returns NEW for invalid date string', () => {
      const result = getAgeGuidance('not-a-date', null);

      expect(result.stage).toBe('NEW');
      expect(result.days).toBe(0);
    });
  });

  describe('stage determination - time-based thresholds', () => {
    const createDateDaysAgo = (daysAgo) => {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString();
    };

    it('returns NEW for 0 days regardless of data', () => {
      const signals = { message_count: 100, patterns: { todoCount: 200 } };
      const result = getAgeGuidance(new Date().toISOString(), signals);

      expect(result.stage).toBe('NEW');
      expect(result.days).toBe(0);
    });

    it('returns NEW for 7 days regardless of data', () => {
      const signals = { message_count: 100, patterns: { todoCount: 200 } };
      const result = getAgeGuidance(createDateDaysAgo(7), signals);

      expect(result.stage).toBe('NEW');
      expect(result.days).toBe(7);
    });

    it('returns NEW for 14 days regardless of data', () => {
      const signals = { message_count: 100, patterns: { todoCount: 200 } };
      const result = getAgeGuidance(createDateDaysAgo(14), signals);

      expect(result.stage).toBe('NEW');
      expect(result.days).toBe(14);
    });

    it('returns NEW for 30 days with sparse data', () => {
      const signals = { message_count: 5, patterns: { todoCount: 10 } };
      const result = getAgeGuidance(createDateDaysAgo(30), signals);

      expect(result.stage).toBe('NEW');
      expect(result.days).toBe(30);
    });

    it('returns BUILDING for 30 days with minimal data (10+ messages)', () => {
      const signals = { message_count: 10, patterns: { todoCount: 5 } };
      const result = getAgeGuidance(createDateDaysAgo(30), signals);

      expect(result.stage).toBe('BUILDING');
      expect(result.days).toBe(30);
    });

    it('returns BUILDING for 30 days with minimal data (20+ todos)', () => {
      const signals = { message_count: 5, patterns: { todoCount: 20 } };
      const result = getAgeGuidance(createDateDaysAgo(30), signals);

      expect(result.stage).toBe('BUILDING');
      expect(result.days).toBe(30);
    });

    it('returns NEW for 90 days with sparse data (old but inactive account)', () => {
      const signals = { message_count: 5, patterns: { todoCount: 10 } };
      const result = getAgeGuidance(createDateDaysAgo(90), signals);

      expect(result.stage).toBe('NEW');
      expect(result.days).toBe(90);
    });

    it('returns BUILDING for 90 days with minimal data', () => {
      const signals = { message_count: 15, patterns: { todoCount: 15 } };
      const result = getAgeGuidance(createDateDaysAgo(90), signals);

      expect(result.stage).toBe('BUILDING');
      expect(result.days).toBe(90);
    });

    it('returns TRUSTED for 90 days with substantial data (30+ messages)', () => {
      const signals = { message_count: 30, patterns: { todoCount: 20 } };
      const result = getAgeGuidance(createDateDaysAgo(90), signals);

      expect(result.stage).toBe('TRUSTED');
      expect(result.days).toBe(90);
    });

    it('returns TRUSTED for 90 days with substantial data (50+ todos)', () => {
      const signals = { message_count: 10, patterns: { todoCount: 50 } };
      const result = getAgeGuidance(createDateDaysAgo(90), signals);

      expect(result.stage).toBe('TRUSTED');
      expect(result.days).toBe(90);
    });
  });

  describe('normalizeSignals edge cases', () => {
    const createDateDaysAgo = (daysAgo) => {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString();
    };

    it('handles null signals', () => {
      const result = getAgeGuidance(createDateDaysAgo(30), null);

      expect(result.stage).toBe('NEW'); // No data = NEW
    });

    it('handles undefined signals', () => {
      const result = getAgeGuidance(createDateDaysAgo(30), undefined);

      expect(result.stage).toBe('NEW');
    });

    it('handles empty object signals', () => {
      const result = getAgeGuidance(createDateDaysAgo(30), {});

      expect(result.stage).toBe('NEW');
    });

    it('handles signals as JSON string (Supabase edge case)', () => {
      const signalsJson = JSON.stringify({
        message_count: 30,
        patterns: { todoCount: 50 },
      });
      const result = getAgeGuidance(createDateDaysAgo(90), signalsJson);

      expect(result.stage).toBe('TRUSTED');
    });

    it('handles malformed JSON string gracefully', () => {
      const result = getAgeGuidance(createDateDaysAgo(90), 'not valid json');

      expect(result.stage).toBe('NEW'); // Falls back to no data
    });

    it('handles signals with missing patterns object', () => {
      const signals = { message_count: 30 };
      const result = getAgeGuidance(createDateDaysAgo(90), signals);

      expect(result.stage).toBe('TRUSTED'); // 30 messages is substantial
    });

    it('handles signals with missing message_count', () => {
      const signals = { patterns: { todoCount: 50 } };
      const result = getAgeGuidance(createDateDaysAgo(90), signals);

      expect(result.stage).toBe('TRUSTED'); // 50 todos is substantial
    });
  });

  describe('promptGuidance content', () => {
    const createDateDaysAgo = (daysAgo) => {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString();
    };

    it('NEW stage guidance mentions asking questions', () => {
      const result = getAgeGuidance(null, null);

      expect(result.promptGuidance).toContain('VOICE MODE: NEW');
      expect(result.promptGuidance).toContain('Ask questions');
    });

    it('BUILDING stage guidance mentions hedging', () => {
      const signals = { message_count: 15, patterns: { todoCount: 25 } };
      const result = getAgeGuidance(createDateDaysAgo(30), signals);

      expect(result.promptGuidance).toContain('VOICE MODE: BUILDING');
      expect(result.promptGuidance).toContain('Hedge');
    });

    it('TRUSTED stage guidance mentions warm familiar relationship', () => {
      const signals = { message_count: 50, patterns: { todoCount: 100 } };
      const result = getAgeGuidance(createDateDaysAgo(90), signals);

      expect(result.promptGuidance).toContain('VOICE MODE: TRUSTED');
      expect(result.promptGuidance).toContain('warm');
    });
  });

  describe('logSummary format', () => {
    it('formats logSummary correctly', () => {
      const result = getAgeGuidance(null, null);

      expect(result.logSummary).toBe('Voice: NEW (0 days)');
    });

    it('includes correct day count in logSummary', () => {
      const d = new Date();
      d.setDate(d.getDate() - 45);
      const signals = { message_count: 15, patterns: { todoCount: 25 } };
      const result = getAgeGuidance(d.toISOString(), signals);

      expect(result.logSummary).toBe('Voice: BUILDING (45 days)');
    });
  });
});
