/**
 * Test contextual summary generation for chat confirmations
 */

import {
  extractActivity,
  extractActivityFromContext,
  extractFrequency,
  createToastSummary,
} from '../../lib/chat/contextualSummary';

describe('Contextual Summary', () => {
  describe('extractActivity', () => {
    it('should extract activity from "I want to run"', () => {
      const result = extractActivity('I want to run');
      expect(result).toBe('Run');
    });

    it('should extract activity from "I want to exercise"', () => {
      const result = extractActivity('I want to exercise');
      expect(result).toBe('Exercise');
    });

    it('should extract activity from "I\'d like to meditate"', () => {
      const result = extractActivity("I'd like to meditate");
      expect(result).toBe('Meditate');
    });

    it('should extract activity from "I wanna start running"', () => {
      const result = extractActivity('I wanna start running');
      expect(result).toBe('Run');
    });

    it('should extract activity from "Let\'s workout"', () => {
      const result = extractActivity("Let's workout");
      expect(result).toBe('Workout');
    });

    it('should handle gerunds correctly', () => {
      const result = extractActivity('I want to start running');
      expect(result).toBe('Run');
    });

    it('should handle double consonants in gerunds', () => {
      const result = extractActivity('I want to start jogging');
      expect(result).toBe('Jog');
    });
  });

  describe('extractActivityFromContext', () => {
    it('should find activity in recent messages', () => {
      const messages = ['Hi Gremly', 'I want to run', 'Maybe 3 times a week'];
      const result = extractActivityFromContext('3 times a week', messages);
      expect(result).toBe('Run');
    });

    it('should handle running/run variations', () => {
      const messages = ['I want to start running regularly'];
      const result = extractActivityFromContext('every day', messages);
      expect(result).toBe('Run');
    });

    it('should return "New habit" if no activity found', () => {
      const messages = ['Hi there', 'How are you?'];
      const result = extractActivityFromContext('daily', messages);
      expect(result).toBe('New habit');
    });
  });

  describe('extractFrequency', () => {
    it('should extract "3x/week" from "3 times a week"', () => {
      const result = extractFrequency('3 times a week');
      expect(result).toBe('3x/week');
    });

    it('should extract "5x/week" from "5 times per week"', () => {
      const result = extractFrequency('5 times per week');
      expect(result).toBe('5x/week');
    });

    it('should recognize "Daily" from "every day"', () => {
      const result = extractFrequency('every day');
      expect(result).toBe('Daily');
    });

    it('should default to "Daily" if no frequency found', () => {
      const result = extractFrequency('I want to run');
      expect(result).toBe('Daily');
    });
  });

  describe('createToastSummary', () => {
    it('should create summary "Run - 3x/week" from context', () => {
      const messages = ['I want to run', 'Maybe 3 times a week'];
      const result = createToastSummary('3 times a week', 'habit', messages);
      expect(result).toBe('Run - 3x/week');
    });

    it('should create summary "Exercise - Daily" from simple text', () => {
      const result = createToastSummary('I want to exercise', 'habit');
      expect(result).toBe('Exercise - Daily');
    });

    it('should handle "I want to run" directly', () => {
      const result = createToastSummary('I want to run', 'habit');
      expect(result).toBe('Run - Daily');
    });

    it('should handle "I want to do it 3 times a week" with context', () => {
      const messages = ['I want to start running'];
      const result = createToastSummary('I want to do it 3 times a week', 'habit', messages);
      expect(result).toBe('Run - 3x/week');
    });

    it('should handle todo type', () => {
      const result = createToastSummary('Buy groceries tomorrow', 'todo');
      expect(result).toBe('Buy groceries tomorrow');
    });

    it('should handle note type', () => {
      const result = createToastSummary('Remember to check the documentation', 'note');
      expect(result).toBe('Remember to check the documentation');
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle the "I want to run" conversation flow', () => {
      // User: "I want to run"
      const summary1 = createToastSummary('I want to run', 'habit');
      expect(summary1).toBe('Run - Daily');

      // User follows up with: "3 times a week"
      const messages = ['I want to run'];
      const summary2 = createToastSummary('3 times a week', 'habit', messages);
      expect(summary2).toBe('Run - 3x/week');
    });

    it('should NOT show "I - 3x/week"', () => {
      const messages = ['I want to run'];
      const result = createToastSummary('I want to do it 3 times a week', 'habit', messages);
      // Should extract "run" from context, not "I"
      expect(result).not.toContain('I -');
      expect(result).toBe('Run - 3x/week');
    });
  });
});
