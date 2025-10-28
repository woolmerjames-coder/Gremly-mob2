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
      const optOuts = [
        'Just thinking about running',
        'Never mind that',
        'Maybe I could do this later',
      ];

      optOuts.forEach((text) => {
        const intent = classifyIntent(text);
        expect(intent.suppressChips).toBe(true);
        expect(intent.requiresAction).toBe(false);
      });
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
