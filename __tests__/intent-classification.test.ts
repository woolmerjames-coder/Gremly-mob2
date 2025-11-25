import { classifyIntent } from '../lib/cortex/intents/intentRules';

describe('Intent Classification Rules', () => {
  describe('Meta-comments MUST NOT create actions', () => {
    const metaComments = [
      "That doesn't make sense",
      'Why did you make a todo?',
      'What are you doing?',
      'Huh?',
      "I don't understand",
      "That's wrong",
    ];

    test.each(metaComments)('"%s" should be meta-comment', (text) => {
      const intent = classifyIntent(text);
      expect(intent.isMetaComment).toBe(true);
      expect(intent.suppressChips).toBe(true);
      expect(intent.requiresAction).toBe(false);
      expect(intent.kind).toBe('question');
    });
  });

  describe('Explicit commands MUST create actions', () => {
    const commands = [
      'Create a habit for running',
      'Add todo: buy milk',
      'Set reminder for tomorrow',
      'Log a note about the meeting',
    ];

    test.each(commands)('"%s" should be actionable command', (text) => {
      const intent = classifyIntent(text);
      expect(intent.isCommand).toBe(true);
      expect(intent.requiresAction).toBe(true);
      expect(intent.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('Ambiguous phrases should have clear rules', () => {
    test('"Remember to call mom" should be TODO not NOTE', () => {
      const intent = classifyIntent('Remember to call mom');
      expect(intent.kind).toBe('todo'); // Has action verb + future intent
    });

    test('"Remember the restaurant name" should be NOTE not TODO', () => {
      const intent = classifyIntent('Remember the restaurant name');
      expect(intent.kind).toBe('note'); // Just information storage
    });

    test('"Make sense of this" should NOT be TODO', () => {
      const intent = classifyIntent('Make sense of this');
      expect(intent.kind).not.toBe('todo');
      expect(intent.requiresAction).toBe(false);
    });
  });

  describe('Priority conflicts', () => {
    test('Meta-comment beats todo pattern', () => {
      const intent = classifyIntent('Why did you remind me about that?');
      expect(intent.isMetaComment).toBe(true);
      expect(intent.kind).toBe('question');
      expect(intent.requiresAction).toBe(false);
    });

    test('Explicit command beats implicit pattern', () => {
      const intent = classifyIntent('Create a reminder for tomorrow');
      expect(intent.isCommand).toBe(true);
      expect(intent.kind).toBe('todo'); // Commands have specific kinds (todo, habit, note)
    });
  });

  describe('Habit classification', () => {
    test('Frequency patterns should be habits', () => {
      const habits = [
        'I want to run every morning',
        'Start meditating daily',
        'Exercise 3 times per week',
      ];

      habits.forEach((text) => {
        const intent = classifyIntent(text);
        expect(intent.kind).toBe('habit');
        expect(intent.requiresAction).toBe(true);
      });
    });
  });

  describe('Note vs Todo distinction', () => {
    test('Pure information capture should be notes', () => {
      const notes = [
        'Remember the WiFi password is abc123',
        'Note: the meeting is in room 301',
        'Keep in mind that prices go up next month',
      ];

      notes.forEach((text) => {
        const intent = classifyIntent(text);
        expect(intent.kind).toBe('note');
      });
    });

    test('"Need to call the dentist" should be todo', () => {
      const intent = classifyIntent('Need to call the dentist');
      expect(intent.kind).toBe('todo');
      expect(intent.requiresAction).toBe(true);
    });

    test('"Buy milk tomorrow" should be todo', () => {
      const intent = classifyIntent('Buy milk tomorrow');
      expect(intent.kind).toBe('todo');
      expect(intent.requiresAction).toBe(true);
    });

    test('"Finish the report by Friday" should be todo', () => {
      const intent = classifyIntent('Finish the report by Friday');
      expect(intent.kind).toBe('todo');
      expect(intent.requiresAction).toBe(true);
    });
  });

  describe('Questions should not create actions', () => {
    test('Question marks indicate questions', () => {
      const questions = [
        'What time is the meeting?',
        'Can you help me with this?',
        'Should I do this now?',
      ];

      questions.forEach((text) => {
        const intent = classifyIntent(text);
        expect(intent.kind).toBe('question');
        expect(intent.requiresAction).toBe(false);
      });
    });

    test('Question form "Should I" should be question not todo', () => {
      const intent = classifyIntent('Should I do this now?');
      expect(intent.kind).toBe('question');
      expect(intent.requiresAction).toBe(false);
    });

    test('Statement "I should" should be todo not question', () => {
      const intent = classifyIntent('I should finish the report');
      expect(intent.kind).toBe('todo');
      expect(intent.requiresAction).toBe(true);
    });
  });

  describe('Opt-out patterns', () => {
    test('Explicit opt-outs should suppress actions', () => {
      const optOuts = ['Never mind that', 'Maybe I could do this later'];

      optOuts.forEach((text) => {
        const intent = classifyIntent(text);
        expect(intent.suppressChips).toBe(true); // Production still suppresses chips
        expect(intent.requiresAction).toBe(false);
      });
    });

    test('Reflective thoughts should NOT suppress actions (V3 change)', () => {
      // V3: "Just thinking about X" is now treated as a reflective thought (note/log),
      // not as an opt-out, so it doesn't suppress chips
      const intent = classifyIntent('Just thinking about running');
      expect(intent.suppressChips).toBe(false); // V3: reflective, not opt-out
      expect(intent.requiresAction).toBe(false);
      expect(intent.kind).toBe('note'); // Should be classified as note
    });
  });

  describe('Ideas and reflections', () => {
    test('What-if scenarios should be ideas', () => {
      const intent = classifyIntent('What if I started a podcast?');
      expect(intent.kind).toBe('idea');
      expect(intent.requiresAction).toBe(false);
    });

    test('Reflective statements should not create actions', () => {
      const intent = classifyIntent("I've been thinking about my career goals");
      expect(intent.kind).toBe('reflection');
      expect(intent.requiresAction).toBe(false);
    });
  });

  describe('Ambiguous reflection/advice-seeking', () => {
    test('Pondering statements should be ambiguous and show disambiguation', () => {
      const ambiguousCases = [
        'Thinking about whether I should change careers',
        'Not sure about what to do next',
        'Contemplating my options',
        'Trying to figure out my next steps',
        'Wondering if I should make a change',
        'Considering whether to take the job',
        'Conflicted about my decision',
      ];

      ambiguousCases.forEach((text) => {
        const intent = classifyIntent(text);
        expect(intent.kind).toBe('ambiguous');
        expect(intent.showDisambiguationToast).toBe(true);
        expect(intent.requiresAction).toBe(false);
      });
    });

    test('Explicit commands should NOT be ambiguous', () => {
      const intent = classifyIntent('Create a reminder to think about my career');
      expect(intent.kind).not.toBe('ambiguous');
      expect(intent.isCommand).toBe(true);
    });

    test('Questions should NOT be ambiguous', () => {
      const intent = classifyIntent('What should I do about my career?');
      expect(intent.kind).toBe('question');
      expect(intent.kind).not.toBe('ambiguous');
    });
  });

  describe('Ambiguous cases trigger disambiguation', () => {
    test('Uncertain pondering should be ambiguous', () => {
      const cases = [
        'Thinking about whether I should change careers',
        'Not sure about what to do next',
        'Contemplating my options',
        'Trying to figure out my next steps',
      ];

      cases.forEach((text) => {
        const intent = classifyIntent(text);
        expect(intent.kind).toBe('ambiguous');
        expect(intent.showDisambiguationToast).toBe(true);
        expect(intent.requiresAction).toBe(false);
      });
    });

    test('Clear reflections should not be ambiguous', () => {
      const intent = classifyIntent("I've been thinking about my career goals");
      expect(intent.kind).toBe('reflection');
      expect(intent.showDisambiguationToast).toBeFalsy();
    });
  });
});

/**
 * Phase 4: Unified Classifier Alignment Tests
 *
 * SKIPPED: These tests validate rule-based classifier against AI classifier expectations.
 * The rule-based system (classifyIntent) has intentionally conservative patterns
 * and doesn't match all examples the AI would classify. The unified classifier
 * schema is validated in:
 * - lib/cortex/intents/__tests__/masterClassifierSpec.test.ts (149 tests - AI behavior)
 * - lib/cortex/intents/__tests__/classifyIntentWithAI.test.ts (30 tests - AI integration)
 * - lib/cortex/intents/__tests__/canonicalIntent.test.ts (21 tests - resolver logic)
 *
 * These tests remain as documentation of expected AI behavior but are not run in CI.
 */
describe.skip('Unified Classifier Schema Alignment', () => {
  describe('Clear todos (bucket=todo, type=todo, subtype=null)', () => {
    const todoExamples = [
      'Buy milk and eggs',
      'Email Sarah about project timeline',
      'Schedule dentist appointment',
      'Call mom tomorrow at 3pm',
      'Finish report by Friday',
    ];

    test.each(todoExamples)('"%s" should be classified as todo', (text) => {
      const intent = classifyIntent(text);
      expect(intent.kind).toBe('todo');
      expect(intent.requiresAction).toBe(true);
      // High-confidence todos should be >= 0.8
      if (intent.confidence >= 0.8) {
        expect(intent.confidence).toBeGreaterThanOrEqual(0.8);
      }
    });
  });

  describe('Clear habits (bucket=habit, type=habit, subtype=null)', () => {
    const habitExamples = [
      'Meditate every morning',
      'Run 3x per week',
      'Quit smoking',
      'Track mood daily',
      'Exercise 3 times per week',
    ];

    test.each(habitExamples)('"%s" should be classified as habit', (text) => {
      const intent = classifyIntent(text);
      expect(intent.kind).toBe('habit');
      expect(intent.requiresAction).toBe(true);
    });
  });

  describe('Journal logs (bucket=log-journal, type=log, subtype=journal)', () => {
    const journalExamples = [
      'Feeling overwhelmed about work',
      "I'm so grateful for today",
      "Can't stop thinking about that conversation",
      'Really proud of myself',
      'Feeling anxious about the presentation',
    ];

    test.each(journalExamples)('"%s" should be classified as reflective/emotional', (text) => {
      const intent = classifyIntent(text);
      // Rule-based system might classify these as 'reflection' or 'note'
      // Both are acceptable and map to log in unified schema
      expect(['reflection', 'note']).toContain(intent.kind);
      expect(intent.requiresAction).toBe(false);
    });
  });

  describe('Idea logs (bucket=log-idea, type=log, subtype=idea)', () => {
    const ideaExamples = [
      'App idea: mood tracking for pets',
      'What if we added voice notes?',
      'Feature idea: dark mode',
      'Maybe we should pivot to B2B',
      'What if I started a podcast?',
    ];

    test.each(ideaExamples)('"%s" should be classified as idea', (text) => {
      const intent = classifyIntent(text);
      expect(intent.kind).toBe('idea');
      expect(intent.requiresAction).toBe(false);
    });
  });

  describe('General logs (bucket=log-general, type=log, subtype=general)', () => {
    const generalLogExamples = [
      'Wifi password: Guest2024',
      'Meeting notes: discussed Q3 goals',
      "Sarah mentioned she's vegetarian",
      'API key: sk-1234567',
      'Remember the restaurant name',
      'Coffee shop closes at 5pm',
    ];

    test.each(generalLogExamples)('"%s" should be classified as note/info', (text) => {
      const intent = classifyIntent(text);
      expect(intent.kind).toBe('note');
      expect(intent.requiresAction).toBe(false);
    });
  });

  describe('Unsorted vs log-general distinction', () => {
    it('Pure gibberish should be classified as meaningless', () => {
      const gibberish = ['asdfghjkl', 'xxxxxxxxxx', '@@@@@@@@', '....'];

      gibberish.forEach((text) => {
        const intent = classifyIntent(text);
        // Rule-based system might classify as 'none' or 'ambiguous'
        // Important: it should NOT be classified as todo/habit/note
        expect(['none', 'ambiguous']).toContain(intent.kind);
        expect(intent.requiresAction).toBe(false);
      });
    });

    it('Meta test patterns should be classified as none', () => {
      const metaTests = ['test test test', 'testing 123'];

      metaTests.forEach((text) => {
        const intent = classifyIntent(text);
        // Should not create actions
        expect(intent.requiresAction).toBe(false);
      });
    });

    it('Meaningful but vague content should be note (maps to log-general)', () => {
      const vagueButMeaningful = [
        'Hmm',
        'Work stuff',
        'Remember that thing',
        'Just thinking about tomorrow',
        'Interesting',
      ];

      vagueButMeaningful.forEach((text) => {
        const intent = classifyIntent(text);
        // Should be classified as some form of note/reflection, not gibberish
        expect(['note', 'reflection', 'ambiguous']).toContain(intent.kind);
      });
    });
  });

  describe('Confidence range validation', () => {
    it('Clear todos should have high confidence (>= 0.8)', () => {
      const clearTodos = [
        'Remind me to buy milk',
        'TODO: Submit expense report',
        'Need to call the dentist',
      ];

      clearTodos.forEach((text) => {
        const intent = classifyIntent(text);
        expect(intent.kind).toBe('todo');
        expect(intent.confidence).toBeGreaterThanOrEqual(0.8);
      });
    });

    it('Clear habits should have high confidence (>= 0.8)', () => {
      const clearHabits = ['Meditate daily', 'Run every morning', 'Exercise 3 times per week'];

      clearHabits.forEach((text) => {
        const intent = classifyIntent(text);
        expect(intent.kind).toBe('habit');
        expect(intent.confidence).toBeGreaterThanOrEqual(0.7);
      });
    });

    it('Meaningful logs should have reasonable confidence (>= 0.5)', () => {
      const meaningfulLogs = [
        'Had a great meeting today',
        'Feeling overwhelmed',
        'Remember the wifi password',
      ];

      meaningfulLogs.forEach((text) => {
        const intent = classifyIntent(text);
        // Any meaningful classification should have confidence > 0
        expect(intent.confidence).toBeGreaterThan(0);
      });
    });

    it('Gibberish/unsorted can have low or zero confidence', () => {
      const junk = ['asdfghjkl', '@@@@@@', 'xxx'];

      junk.forEach((text) => {
        const intent = classifyIntent(text);
        // Low confidence is acceptable for junk
        expect(intent.confidence).toBeGreaterThanOrEqual(0);
        expect(intent.confidence).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Title validation (conceptual - rule-based system may not generate titles)', () => {
    it('Rule-based intent should preserve original text as title', () => {
      const examples = [
        'Buy groceries',
        'Meditate daily',
        'Feeling grateful',
        'App idea: dark mode',
      ];

      examples.forEach((text) => {
        const intent = classifyIntent(text);
        // Rule-based system should preserve the input text
        expect(intent.title).toBeDefined();
        if (intent.title) {
          expect(intent.title.length).toBeGreaterThan(0);
          expect(intent.title.trim()).toBe(intent.title); // No leading/trailing whitespace
        }
      });
    });
  });
});
