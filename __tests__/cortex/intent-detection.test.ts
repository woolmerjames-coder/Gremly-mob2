/**
 * Phase 10.7: Intent Detection Tests
 * Test the detectIntent helper with various phrases
 */

import { detectIntent } from '../../lib/cortex/intents/detectIntent';
import type { IntentKind } from '../../lib/cortex/intents/types';

describe('Intent Detection', () => {
  describe('Habit Detection', () => {
    it('detects habit with frequency words', () => {
      const result = detectIntent('Start running every morning');
      expect(result.kind).toBe('habit');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.title).toBe('Start running every morning');
    });

    it('detects habit with routine keyword', () => {
      const result = detectIntent('Create a daily routine for stretching');
      expect(result.kind).toBe('habit');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('detects habit with weekly frequency', () => {
      const result = detectIntent('Go to the gym every week');
      expect(result.kind).toBe('habit');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('To-Do Detection', () => {
    it('detects todo with action verb "buy"', () => {
      const result = detectIntent('Buy flowers tomorrow');
      expect(result.kind).toBe('todo');
      expect(result.confidence).toBeGreaterThanOrEqual(0.92);
    });

    it('detects todo with action verb "finish"', () => {
      const result = detectIntent('Finish the report by Friday');
      expect(result.kind).toBe('todo');
      expect(result.confidence).toBeGreaterThanOrEqual(0.92);
    });

    it('detects todo with action verb "email"', () => {
      const result = detectIntent('Email the client about the proposal');
      expect(result.kind).toBe('todo');
      expect(result.confidence).toBeGreaterThanOrEqual(0.92);
    });

    it('detects todo with explicit "todo" keyword', () => {
      const result = detectIntent('Todo: Schedule dentist appointment');
      expect(result.kind).toBe('todo');
      expect(result.confidence).toBeGreaterThanOrEqual(0.92);
    });
  });

  describe('Reflection Detection', () => {
    it('detects reflection with journal keyword', () => {
      const result = detectIntent('I had a great day today');
      expect(result.kind).toBe('reflection');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('detects reflection with grateful keyword', () => {
      const result = detectIntent('Grateful for my supportive team');
      expect(result.kind).toBe('reflection');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('detects reflection with learned keyword', () => {
      const result = detectIntent('Learned a lot about patience today');
      expect(result.kind).toBe('reflection');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('Idea Detection', () => {
    it('detects idea with "idea" keyword', () => {
      const result = detectIntent('Idea for a new feature');
      expect(result.kind).toBe('idea');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('detects idea with "what if" phrase', () => {
      const result = detectIntent('What if we tried a different approach?');
      expect(result.kind).toBe('idea');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('detects idea with "maybe we could" phrase', () => {
      const result = detectIntent('Maybe we could add gamification');
      expect(result.kind).toBe('idea');
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });
  });

  describe('Note Detection', () => {
    // TODO: Re-implement these tests after chat system/rules update
    it.skip('detects note with "remember" keyword', () => {
      const result = detectIntent('Remember the documentation URL');
      expect(result.kind).toBe('note');
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('detects note with "note" keyword', () => {
      const result = detectIntent('Note: Important meeting details');
      expect(result.kind).toBe('note');
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });
  });

  describe('Question Detection', () => {
    it('detects question with question mark', () => {
      const result = detectIntent('What are good books on focus?');
      expect(result.kind).toBe('question');
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('detects question starting with "how"', () => {
      const result = detectIntent('How do I improve my productivity?');
      expect(result.kind).toBe('question');
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('detects question starting with "why"', () => {
      const result = detectIntent('Why is consistency important?');
      expect(result.kind).toBe('question');
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    });
  });

  describe('None Detection', () => {
    it('returns none for ambiguous input', () => {
      const result = detectIntent('Hello there');
      expect(result.kind).toBe('none');
      expect(result.confidence).toBe(0);
    });

    it('returns none for empty string', () => {
      const result = detectIntent('');
      expect(result.kind).toBe('none');
      expect(result.confidence).toBe(0);
    });
  });

  describe('Priority Ordering', () => {
    it('prioritizes habit over todo for frequency words', () => {
      // "every day" should trigger habit before todo
      const result = detectIntent('Check email every day');
      expect(result.kind).toBe('habit');
    });

    it('prioritizes todo for explicit action verbs', () => {
      // Strong action verbs should trigger todo
      const result = detectIntent('Buy milk');
      expect(result.kind).toBe('todo');
    });
  });
});
