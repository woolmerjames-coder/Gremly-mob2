import { classifyV2, _testExports } from '../classifyV2';

describe('classifyV2 - 8-Layer Cascade', () => {
  describe('Layer 0: Gibberish Gate', () => {
    it('rejects empty string', () => {
      const result = classifyV2('');
      expect(result.layer).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('rejects whitespace only', () => {
      const result = classifyV2('   \n\t  ');
      expect(result.layer).toBe(0);
    });

    it('rejects keyboard mash', () => {
      const result = classifyV2('asdfghjkl');
      expect(result.layer).toBe(0);
    });

    it('accepts real text', () => {
      const result = classifyV2('Call mom');
      expect(result.layer).not.toBe(0);
    });
  });

  describe('Layer 1: Explicit Commands', () => {
    it('matches "Todo: call mom"', () => {
      const result = classifyV2('Todo: call mom');
      expect(result.layer).toBe(1);
      expect(result.type).toBe('todo');
      expect(result.mode).toBe('auto');
    });

    it('matches "Remind me to buy groceries"', () => {
      const result = classifyV2('Remind me to buy groceries');
      expect(result.layer).toBe(1);
      expect(result.type).toBe('todo');
    });

    it('matches "Habit: meditate daily"', () => {
      const result = classifyV2('Habit: meditate daily');
      expect(result.layer).toBe(1);
      expect(result.type).toBe('habit');
    });

    it('matches "Idea: add dark mode"', () => {
      const result = classifyV2('Idea: add dark mode');
      expect(result.layer).toBe(1);
      expect(result.type).toBe('log');
      expect(result.subtype).toBe('idea');
    });
  });

  describe('Layer 2: Clear Habits', () => {
    it('matches "Meditate every morning"', () => {
      const result = classifyV2('Meditate every morning');
      expect(result.layer).toBe(2);
      expect(result.type).toBe('habit');
      expect(result.mode).toBe('auto');
    });

    it('matches "Run 3x per week"', () => {
      const result = classifyV2('Run 3x per week');
      expect(result.layer).toBe(2);
      expect(result.type).toBe('habit');
    });

    it('matches "Read daily"', () => {
      const result = classifyV2('Read daily');
      expect(result.layer).toBe(2);
      expect(result.type).toBe('habit');
    });

    it('does NOT match hedged "I should exercise every day"', () => {
      const result = classifyV2('I should exercise every day');
      expect(result.layer).not.toBe(2); // Hedged → not Layer 2
    });

    it('does NOT match "Exercise more" (no frequency)', () => {
      const result = classifyV2('Exercise more');
      expect(result.type).not.toBe('habit');
    });
  });

  describe('Layer 3: Clear Todos', () => {
    it('matches "Call mom"', () => {
      const result = classifyV2('Call mom');
      expect(result.layer).toBe(3);
      expect(result.type).toBe('todo');
      expect(result.mode).toBe('auto');
    });

    it('matches "Buy groceries"', () => {
      const result = classifyV2('Buy groceries');
      expect(result.layer).toBe(3);
      expect(result.type).toBe('todo');
    });

    it('matches "Email Sarah about project"', () => {
      const result = classifyV2('Email Sarah about project');
      expect(result.layer).toBe(3);
      expect(result.type).toBe('todo');
    });

    it('does NOT match hedged "Should probably call mom"', () => {
      const result = classifyV2('Should probably call mom');
      expect(result.layer).not.toBe(3);
      expect(result.mode).toBe('chips'); // Goes to chips
    });

    it('does NOT match hedged "Maybe email Sarah"', () => {
      const result = classifyV2('Maybe email Sarah');
      expect(result.layer).not.toBe(3);
    });
  });

  describe('Layer 4: Clear Journals', () => {
    it('matches "Feeling overwhelmed today"', () => {
      const result = classifyV2('Feeling overwhelmed today');
      expect(result.layer).toBe(4);
      expect(result.type).toBe('log');
      expect(result.subtype).toBe('journal');
    });

    it('matches "I\'m so grateful for my team"', () => {
      const result = classifyV2("I'm so grateful for my team");
      expect(result.layer).toBe(4);
      expect(result.subtype).toBe('journal');
    });

    it('matches "Today was exhausting"', () => {
      const result = classifyV2('Today was exhausting');
      expect(result.layer).toBe(4);
    });
  });

  describe('Layer 5: Clear Ideas', () => {
    it('matches "What if we added voice notes?"', () => {
      const result = classifyV2('What if we added voice notes?');
      expect(result.layer).toBe(5);
      expect(result.type).toBe('log');
      expect(result.subtype).toBe('idea');
    });

    it('matches "Feature idea: dark mode"', () => {
      const result = classifyV2('Feature idea: dark mode');
      expect(result.layer).toBe(5);
      expect(result.subtype).toBe('idea');
    });

    it('matches "We could try a new approach"', () => {
      const result = classifyV2('We could try a new approach');
      expect(result.layer).toBe(5);
    });
  });

  describe('Layer 6: Chips', () => {
    it('shows chips for "Dinner with Sarah Friday"', () => {
      const result = classifyV2('Dinner with Sarah Friday');
      expect(result.layer).toBe(6);
      expect(result.mode).toBe('chips');
      expect(result.chipOptions).toBeDefined();
      expect(result.chipOptions?.length).toBe(2);
    });

    it('shows chips for "Should probably book dentist"', () => {
      const result = classifyV2('Should probably book dentist');
      expect(result.layer).toBe(6);
      expect(result.mode).toBe('chips');
    });

    it('shows habit chips for "I want to run more"', () => {
      const result = classifyV2('I want to run more');
      expect(result.layer).toBe(6);
      expect(result.mode).toBe('chips');
      expect(result.chipOptions?.some((c) => c.kind === 'habit')).toBe(true);
    });
  });

  describe('Layer 7: Log-General Default', () => {
    it('defaults "Interesting article" to log-general', () => {
      const result = classifyV2('Interesting article about productivity');
      expect(result.layer).toBe(7);
      expect(result.type).toBe('log');
      expect(result.subtype).toBe('general');
      expect(result.mode).toBe('default');
    });

    it('defaults reflection to log-general', () => {
      const result = classifyV2('Been thinking about life lately');
      expect(result.layer).toBe(7);
      expect(result.type).toBe('log');
      expect(result.reason).toContain('Reflection');
    });

    it('defaults "Should call mom more" to log-general (reflection)', () => {
      const result = classifyV2('Should call mom more');
      // This is reflection, not hedged action
      expect(result.type).toBe('log');
    });
  });

  describe('Critical test cases from proposal', () => {
    const testCases = [
      { input: 'Add todo: call mom', expected: { type: 'todo', mode: 'auto' } },
      { input: 'Remind me to buy groceries', expected: { type: 'todo', mode: 'auto' } },
      { input: 'Meditate every morning', expected: { type: 'habit', mode: 'auto' } },
      { input: 'Run 3x per week', expected: { type: 'habit', mode: 'auto' } },
      { input: 'Call mom', expected: { type: 'todo', mode: 'auto' } },
      { input: 'Email Sarah about project', expected: { type: 'todo', mode: 'auto' } },
      { input: 'Feeling overwhelmed today', expected: { type: 'log', subtype: 'journal' } },
      { input: "I'm so grateful for my team", expected: { type: 'log', subtype: 'journal' } },
      { input: 'What if we added voice notes?', expected: { type: 'log', subtype: 'idea' } },
      { input: 'Feature idea: dark mode', expected: { type: 'log', subtype: 'idea' } },
      { input: 'Should probably book dentist', expected: { mode: 'chips' } },
      { input: 'Maybe email Sarah this week', expected: { mode: 'chips' } },
      { input: 'Dinner with Sarah Friday', expected: { mode: 'chips' } },
      { input: 'I want to run more', expected: { mode: 'chips' } },
      { input: 'Should call mom more', expected: { type: 'log', subtype: 'general' } },
      { input: 'Been thinking about meditating', expected: { type: 'log', subtype: 'general' } },
    ];

    testCases.forEach(({ input, expected }) => {
      it(`classifies "${input}" correctly`, () => {
        const result = classifyV2(input);
        if (expected.type) expect(result.type).toBe(expected.type);
        if (expected.subtype) expect(result.subtype).toBe(expected.subtype);
        if (expected.mode) expect(result.mode).toBe(expected.mode);
      });
    });
  });
});
