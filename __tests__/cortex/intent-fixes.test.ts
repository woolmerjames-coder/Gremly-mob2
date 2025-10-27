/**
 * Test intent detection fixes for "I want to run" and "You're amazing" patterns
 */

import { detectIntent } from '../../lib/cortex/intents/detectIntent';

describe('Intent Detection Fixes', () => {
  describe('Habit "want to" patterns', () => {
    it('should detect "I want to run" as habit intent', () => {
      const result = detectIntent('I want to run');
      expect(result.kind).toBe('habit');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should detect "I want to exercise" as habit intent', () => {
      const result = detectIntent('I want to exercise');
      expect(result.kind).toBe('habit');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should detect "I\'d like to meditate" as habit intent', () => {
      const result = detectIntent("I'd like to meditate");
      expect(result.kind).toBe('habit');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should detect "I wanna start running" as habit intent', () => {
      const result = detectIntent('I wanna start running');
      expect(result.kind).toBe('habit');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should detect "Let\'s exercise more" as habit intent', () => {
      const result = detectIntent("Let's exercise more");
      expect(result.kind).toBe('habit');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('Social/Compliment patterns', () => {
    it('should detect "You\'re amazing!" as social intent', () => {
      const result = detectIntent("You're amazing!");
      expect(result.kind).toBe('social');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.isMetaComment).toBe(true);
      expect(result.requiresAction).toBe(false);
    });

    it('should detect "Thank you" as social intent', () => {
      const result = detectIntent('Thank you');
      expect(result.kind).toBe('social');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect "You\'re awesome" as social intent', () => {
      const result = detectIntent("You're awesome");
      expect(result.kind).toBe('social');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect "Love this!" as social intent', () => {
      const result = detectIntent('Love this!');
      expect(result.kind).toBe('social');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect "You rock" as social intent', () => {
      const result = detectIntent('You rock');
      expect(result.kind).toBe('social');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('Frequency patterns should still work', () => {
    it('should detect "3 times a week" as habit intent', () => {
      const result = detectIntent('3 times a week');
      expect(result.kind).toBe('habit');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should detect "I want to do it 3 times a week" as habit intent', () => {
      const result = detectIntent('I want to do it 3 times a week');
      expect(result.kind).toBe('habit');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('Priority ordering', () => {
    it('should prefer habit_want_to over default_none', () => {
      const result = detectIntent('I want to run');
      // Should NOT be 'none' with confidence 0
      expect(result.kind).not.toBe('none');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should prefer social over default_none', () => {
      const result = detectIntent("You're amazing");
      // Should NOT be 'none' with confidence 0
      expect(result.kind).not.toBe('none');
      expect(result.confidence).toBeGreaterThan(0);
    });
  });
});
