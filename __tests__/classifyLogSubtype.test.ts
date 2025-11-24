/**
 * Tests for Log Subtype Classifier
 *
 * Verifies pure, deterministic classification of Mind Drop logs into:
 * - journal
 * - idea
 * - general
 */

import { classifyLogSubtype, LogSubtype, LogSubtypeSignal } from '../lib/cortex/classifyLogSubtype';

describe('classifyLogSubtype', () => {
  // Helper to verify signal structure
  function assertValidSignal(signal: LogSubtypeSignal) {
    expect(signal.journalConfidence).toBeGreaterThanOrEqual(0);
    expect(signal.journalConfidence).toBeLessThanOrEqual(100);
    expect(signal.ideaConfidence).toBeGreaterThanOrEqual(0);
    expect(signal.ideaConfidence).toBeLessThanOrEqual(100);
    expect(['journal', 'idea', 'general']).toContain(signal.subtype);
    expect(Array.isArray(signal.debug.journalReasons)).toBe(true);
    expect(Array.isArray(signal.debug.ideaReasons)).toBe(true);
    expect(typeof signal.debug.textLength).toBe('number');
  }

  describe('Journal classification', () => {
    test('classifies strong first-person emotion as journal', () => {
      const signal = classifyLogSubtype("I'm feeling overwhelmed about work today");

      assertValidSignal(signal);
      expect(signal.subtype).toBe('journal');
      expect(signal.journalConfidence).toBeGreaterThanOrEqual(80);
      expect(signal.debug.journalReasons).toContain('strong_first_person_emotion');
    });

    test('classifies personal reflection with time marker as journal', () => {
      const signal = classifyLogSubtype('Today was exhausting');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('journal');
      expect(signal.journalConfidence).toBeGreaterThanOrEqual(70);
      expect(signal.journalConfidence).toBeLessThanOrEqual(100);
      expect(signal.debug.journalReasons).toContain('personal_reflection');
    });

    test('classifies short emotional statement as journal', () => {
      const signal = classifyLogSubtype('Exhausted.');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('journal');
      expect(signal.journalConfidence).toBeGreaterThanOrEqual(60);
      expect(signal.debug.journalReasons).toContain('short_emotional_statement');
      expect(signal.debug.textLength).toBeLessThan(50);
    });

    test('classifies "I am stressed" as journal', () => {
      const signal = classifyLogSubtype('I am stressed');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('journal');
      expect(signal.journalConfidence).toBeGreaterThanOrEqual(80);
    });

    test('classifies "I feel anxious" as journal', () => {
      const signal = classifyLogSubtype('I feel anxious');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('journal');
      expect(signal.journalConfidence).toBeGreaterThanOrEqual(80);
    });

    test('classifies "Today I realized something important" as journal', () => {
      const signal = classifyLogSubtype('Today I realized something important');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('journal');
      expect(signal.journalConfidence).toBeGreaterThanOrEqual(70);
    });
  });

  describe('Idea classification', () => {
    test('classifies explicit idea marker as idea', () => {
      const signal = classifyLogSubtype('App idea: a calmer to-do list');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('idea');
      expect(signal.ideaConfidence).toBeGreaterThanOrEqual(85);
      expect(signal.debug.ideaReasons).toContain('explicit_idea_marker');
    });

    test('classifies "what if" speculation as idea', () => {
      const signal = classifyLogSubtype('What if we added voice notes?');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('idea');
      expect(signal.ideaConfidence).toBeGreaterThanOrEqual(80);
    });

    test('classifies creative future language as idea', () => {
      const signal = classifyLogSubtype('We could build a better tag system');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('idea');
      expect(signal.ideaConfidence).toBeGreaterThanOrEqual(75);
      expect(signal.debug.ideaReasons).toContain('creative_future_language');
    });

    test('classifies "maybe we should try" as idea', () => {
      const signal = classifyLogSubtype('Maybe we should try a different approach');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('idea');
      expect(signal.ideaConfidence).toBeGreaterThanOrEqual(65);
    });

    test('classifies "would be cool if" as idea', () => {
      const signal = classifyLogSubtype('It would be cool if we could export notes');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('idea');
      expect(signal.ideaConfidence).toBeGreaterThanOrEqual(85);
    });

    test('classifies "business idea:" as idea', () => {
      const signal = classifyLogSubtype('Business idea: subscription boxes for books');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('idea');
      expect(signal.ideaConfidence).toBeGreaterThanOrEqual(85);
    });
  });

  describe('General classification', () => {
    test('classifies third-person reference as general', () => {
      const signal = classifyLogSubtype("Sarah's coffee order: oat latte, extra hot, no foam.");

      assertValidSignal(signal);
      expect(signal.subtype).toBe('general');
      expect(signal.journalConfidence).toBeLessThan(60);
      expect(signal.ideaConfidence).toBeLessThan(60);
    });

    test('classifies third-person event as general', () => {
      const signal = classifyLogSubtype('The meeting was stressful');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('general');
      expect(signal.journalConfidence).toBeLessThan(60);
      expect(signal.debug.journalReasons).toContain('third_person_only');
    });

    test('classifies imperative command as general', () => {
      const signal = classifyLogSubtype('Should fix the bug');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('general');
      expect(signal.ideaConfidence).toBeLessThan(60);
    });

    test('classifies plain command as general', () => {
      const signal = classifyLogSubtype('Fix the header styling');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('general');
      expect(signal.ideaConfidence).toBeLessThanOrEqual(40);
    });

    test('classifies factual statement as general', () => {
      const signal = classifyLogSubtype('The project deadline is Friday');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('general');
    });

    test('classifies plain task as general', () => {
      const signal = classifyLogSubtype('Email the client about the proposal');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('general');
    });
  });

  describe('Conflict cases', () => {
    test('classifies mixed journal+idea signals as general', () => {
      const signal = classifyLogSubtype("I'm stressed but maybe we could redesign the schedule");

      assertValidSignal(signal);
      expect(signal.subtype).toBe('general');
      expect(signal.journalConfidence).toBeGreaterThanOrEqual(60);
      expect(signal.ideaConfidence).toBeGreaterThanOrEqual(60);
    });

    test('classifies high-conflict emotional idea as general', () => {
      const signal = classifyLogSubtype("I'm feeling excited about this app idea: a mood tracker");

      assertValidSignal(signal);
      // Both confidences should be reasonably high
      expect(signal.journalConfidence).toBeGreaterThanOrEqual(60);
      expect(signal.ideaConfidence).toBeGreaterThanOrEqual(60);
      expect(signal.subtype).toBe('general');
    });
  });

  describe('Edge cases', () => {
    test('handles empty string', () => {
      const signal = classifyLogSubtype('');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('general');
      expect(signal.journalConfidence).toBe(0);
      expect(signal.ideaConfidence).toBe(0);
      expect(signal.debug.textLength).toBe(0);
      expect(signal.debug.journalReasons).toEqual([]);
      expect(signal.debug.ideaReasons).toEqual([]);
    });

    test('handles whitespace-only string', () => {
      const signal = classifyLogSubtype('   \n\t  ');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('general');
      expect(signal.journalConfidence).toBe(0);
      expect(signal.ideaConfidence).toBe(0);
    });

    test('handles single word', () => {
      const signal = classifyLogSubtype('Hello');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('general');
    });

    test('handles very short emotional word', () => {
      const signal = classifyLogSubtype('Sad');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('journal');
      expect(signal.journalConfidence).toBeGreaterThanOrEqual(65);
    });

    test('handles case insensitivity', () => {
      const signal1 = classifyLogSubtype('I FEEL OVERWHELMED');
      const signal2 = classifyLogSubtype('i feel overwhelmed');

      assertValidSignal(signal1);
      assertValidSignal(signal2);
      expect(signal1.subtype).toBe(signal2.subtype);
      expect(signal1.journalConfidence).toBe(signal2.journalConfidence);
    });
  });

  describe('Determinism', () => {
    test('produces identical results for identical input', () => {
      const text = "I'm feeling overwhelmed about work today";

      const signal1 = classifyLogSubtype(text);
      const signal2 = classifyLogSubtype(text);
      const signal3 = classifyLogSubtype(text);

      expect(signal1).toEqual(signal2);
      expect(signal2).toEqual(signal3);
    });

    test('is deterministic across multiple test cases', () => {
      const testCases = [
        'App idea: calmer notifications',
        'I feel anxious',
        'The meeting was productive',
        'What if we tried a new design?',
        'Exhausted',
        '',
      ];

      testCases.forEach((testCase) => {
        const signal1 = classifyLogSubtype(testCase);
        const signal2 = classifyLogSubtype(testCase);
        expect(signal1).toEqual(signal2);
      });
    });
  });

  describe('Debug information', () => {
    test('includes textLength in debug', () => {
      const signal = classifyLogSubtype('Test');

      expect(signal.debug.textLength).toBe(4);
    });

    test('includes reasons arrays in debug', () => {
      const signal = classifyLogSubtype("I'm feeling stressed today");

      expect(Array.isArray(signal.debug.journalReasons)).toBe(true);
      expect(Array.isArray(signal.debug.ideaReasons)).toBe(true);
      expect(signal.debug.journalReasons.length).toBeGreaterThan(0);
    });

    test('can have empty reasons for pure general', () => {
      const signal = classifyLogSubtype('Random text without triggers');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('general');
      // It's okay if reasons are empty for pure general cases
    });
  });

  describe('Confidence boundaries', () => {
    test('never exceeds 100 for journal confidence', () => {
      const texts = [
        'I feel overwhelmed, anxious, stressed, and exhausted today',
        "I'm feeling so sad and worried tonight",
        'Today was terrible and I am frustrated',
      ];

      texts.forEach((text) => {
        const signal = classifyLogSubtype(text);
        expect(signal.journalConfidence).toBeLessThanOrEqual(100);
      });
    });

    test('never exceeds 100 for idea confidence', () => {
      const texts = [
        'App idea: what if we could build and create a design tool',
        'Business idea: maybe we could try to experiment with this',
        'Startup idea: would be cool if we made something',
      ];

      texts.forEach((text) => {
        const signal = classifyLogSubtype(text);
        expect(signal.ideaConfidence).toBeLessThanOrEqual(100);
      });
    });

    test('never goes below 0 for any confidence', () => {
      const texts = ['', 'Random neutral text', 'The sky is blue'];

      texts.forEach((text) => {
        const signal = classifyLogSubtype(text);
        expect(signal.journalConfidence).toBeGreaterThanOrEqual(0);
        expect(signal.ideaConfidence).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Real-world examples', () => {
    test('classifies personal journal entry', () => {
      const signal = classifyLogSubtype(
        'This morning I woke up feeling really anxious about the presentation. ' +
          "I can't stop thinking about all the things that could go wrong.",
      );

      assertValidSignal(signal);
      expect(signal.subtype).toBe('journal');
      expect(signal.journalConfidence).toBeGreaterThanOrEqual(80);
    });

    test('classifies brainstorm note', () => {
      const signal = classifyLogSubtype(
        'What if we created a feature that would let users customize their dashboard? ' +
          'We could add drag-and-drop widgets and maybe some preset themes.',
      );

      assertValidSignal(signal);
      expect(signal.subtype).toBe('idea');
      expect(signal.ideaConfidence).toBeGreaterThanOrEqual(75);
    });

    test('classifies reference information', () => {
      const signal = classifyLogSubtype(
        'Meeting notes: Sarah mentioned the Q4 budget needs review. ' +
          'John will send the updated deck by Friday.',
      );

      assertValidSignal(signal);
      expect(signal.subtype).toBe('general');
    });

    test('classifies short to-do item', () => {
      const signal = classifyLogSubtype('Call dentist');

      assertValidSignal(signal);
      expect(signal.subtype).toBe('general');
    });
  });
});
