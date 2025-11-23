/**
 * Regression tests for reflective thought classification
 *
 * Ensures that reflective thoughts like "just thinking about X" are classified
 * as 'note' (log), NOT 'ignore' or 'none'.
 */

import { classifyIntent } from '../lib/cortex/intents/intentRules';

describe('Reflective Thought Classification', () => {
  describe('should classify as note/log (NOT ignore)', () => {
    const reflectiveExamples = [
      'Just thinking about maybe starting a side hustle someday',
      'Just thinking about messaging Alex',
      "I've been wondering if I should change careers",
      'Thinking about messaging Alex',
      'Might want to redo the balcony someday',
      'Maybe planning a long trip next year',
      'Considering a job change',
      'Just thought I might want to learn piano',
      'Someday I want to travel to Japan',
      'Could be interesting to start a podcast',
    ];

    reflectiveExamples.forEach((text) => {
      it(`should classify "${text}" as note`, () => {
        const result = classifyIntent(text);
        expect(result.kind).toBe('note');
        expect(result.confidence).toBeGreaterThan(0);
      });
    });
  });

  describe('should still classify meta-comments as none/question', () => {
    const metaComments = [
      'What does this app do?',
      "This doesn't make sense",
      'Why did you do that?',
      "That's wrong",
      'How does this work?',
    ];

    metaComments.forEach((text) => {
      it(`should NOT classify "${text}" as note`, () => {
        const result = classifyIntent(text);
        expect(result.kind).not.toBe('note');
        expect(['none', 'question']).toContain(result.kind);
      });
    });
  });

  describe('should still classify explicit opt-outs as none', () => {
    const optOuts = ['Never mind', 'Forget it', "Don't save this", 'Cancel that', "I'm good"];

    optOuts.forEach((text) => {
      it(`should classify "${text}" as none`, () => {
        const result = classifyIntent(text);
        expect(result.kind).toBe('none');
      });
    });
  });
});
