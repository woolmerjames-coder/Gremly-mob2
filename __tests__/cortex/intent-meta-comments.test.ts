/**
 * Intent Detection: Meta-Comments & Opt-Out Phrases
 * Verifies that user complaints, questions about the system, and opt-out phrases
 * do NOT trigger action creation.
 */

import { detectIntent } from '../../lib/cortex/intents/detectIntent';

describe('Intent Detection - Meta-Comments', () => {
  describe('User complaints should NOT create actions', () => {
    it('detects "doesn\'t make sense" as question, not action', () => {
      const result = detectIntent("That doesn't make sense");
      expect(result.kind).toBe('question');
      expect(result.suppressChips).toBe(true);
    });

    it('detects "that\'s wrong" as question', () => {
      const result = detectIntent("That's wrong");
      expect(result.kind).toBe('question');
      expect(result.suppressChips).toBe(true);
    });

    it('detects "huh?" as question', () => {
      const result = detectIntent('Huh?');
      expect(result.kind).toBe('question');
      expect(result.suppressChips).toBe(true);
    });

    it('detects "I don\'t understand" as question', () => {
      const result = detectIntent("I don't understand");
      expect(result.kind).toBe('question');
      expect(result.suppressChips).toBe(true);
    });
  });

  describe('Questions about Gremly behavior should NOT create actions', () => {
    it('detects "why did you make a todo" as question', () => {
      const result = detectIntent('Why did you make a todo?');
      expect(result.kind).toBe('question');
      expect(result.suppressChips).toBe(true);
    });

    it('detects "why did you create that" as question', () => {
      const result = detectIntent('Why did you create that?');
      expect(result.kind).toBe('question');
      expect(result.suppressChips).toBe(true);
    });

    it('detects "what are you doing" as question', () => {
      const result = detectIntent('What are you doing?');
      expect(result.kind).toBe('question');
      expect(result.suppressChips).toBe(true);
    });

    it('detects "can you explain" as question', () => {
      const result = detectIntent('Can you explain what just happened?');
      expect(result.kind).toBe('question');
      expect(result.suppressChips).toBe(true);
    });

    it('detects "what did you just do" as question', () => {
      const result = detectIntent('What did you just do?');
      expect(result.kind).toBe('question');
      expect(result.suppressChips).toBe(true);
    });
  });

  describe('Opt-out phrases should NOT create actions', () => {
    it('detects "just thinking" as none', () => {
      const result = detectIntent('Just thinking about it');
      expect(result.kind).toBe('none');
      expect(result.suppressChips).toBe(true);
    });

    it('detects "never mind" as none', () => {
      const result = detectIntent('Never mind');
      expect(result.kind).toBe('none');
      expect(result.suppressChips).toBe(true);
    });

    it('detects "don\'t save" as none', () => {
      const result = detectIntent("Don't save that");
      expect(result.kind).toBe('none');
      expect(result.suppressChips).toBe(true);
    });

    it('detects "no need" as none', () => {
      const result = detectIntent('No need to save');
      expect(result.kind).toBe('none');
      expect(result.suppressChips).toBe(true);
    });

    it('detects "just chatting" as none', () => {
      const result = detectIntent('Just chatting about ideas');
      expect(result.kind).toBe('none');
      expect(result.suppressChips).toBe(true);
    });

    it('detects "forget it" as none', () => {
      const result = detectIntent('Forget it');
      expect(result.kind).toBe('none');
      expect(result.suppressChips).toBe(true);
    });

    it('detects "cancel that" as none', () => {
      const result = detectIntent('Cancel that');
      expect(result.kind).toBe('none');
      expect(result.suppressChips).toBe(true);
    });

    it('detects "I\'m good" as none', () => {
      const result = detectIntent("I'm good");
      expect(result.kind).toBe('none');
      expect(result.suppressChips).toBe(true);
    });

    it('detects "not sure" as none', () => {
      const result = detectIntent('Not sure about that');
      expect(result.kind).toBe('none');
      expect(result.suppressChips).toBe(true);
    });
  });

  describe('Real action requests should still work', () => {
    it('detects "remind me to call mom" as todo', () => {
      const result = detectIntent('Remind me to call mom');
      expect(result.kind).toBe('todo');
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('detects "buy groceries" as todo', () => {
      const result = detectIntent('Buy groceries tomorrow');
      expect(result.kind).toBe('todo');
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('detects "add todo: finish report" as todo command', () => {
      const result = detectIntent('Add todo: finish report');
      expect(result.kind).toBe('todo');
      expect(result.isCommand).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('does not confuse "make" in meta-question with "make" action verb', () => {
      const result = detectIntent('Why would you make that a todo?');
      expect(result.kind).toBe('question');
      expect(result.suppressChips).toBe(true);
    });

    it('handles "maybe?" as opt-out uncertainty', () => {
      const result = detectIntent('Maybe?');
      expect(result.kind).toBe('none');
      expect(result.suppressChips).toBe(true);
    });
  });
});
