/**
 * Phase 10.10: Overlay Prefill Utilities Tests
 * Test smart title extraction and structured data parsing
 */

import { smartTitle, extractTodoTitle, parseHabit } from '../../../app/spaces/chat/prefillUtils';

describe('Overlay Prefill Utilities', () => {
  describe('smartTitle', () => {
    it('strips "Remember:" prefix', () => {
      expect(smartTitle('Remember: cancel gym')).toBe('cancel gym');
    });

    it('strips "Note:" prefix', () => {
      expect(smartTitle('Note: call mom tomorrow')).toBe('call mom tomorrow');
    });

    it('strips "Don\'t forget" prefix', () => {
      expect(smartTitle("Don't forget to pack lunch")).toBe('to pack lunch');
    });

    it('strips "Remind me" prefix', () => {
      expect(smartTitle('Remind me to buy milk')).toBe('to buy milk');
    });

    it('handles text without prefix', () => {
      expect(smartTitle('Buy groceries')).toBe('Buy groceries');
    });

    it('handles empty text', () => {
      expect(smartTitle('')).toBe('');
    });

    it('preserves text when no match', () => {
      expect(smartTitle('Some random text')).toBe('Some random text');
    });

    it('strips "write down:" with colon and space', () => {
      expect(smartTitle('write down: important meeting notes')).toBe('important meeting notes');
    });
  });

  describe('extractTodoTitle', () => {
    it('removes command verb "Add"', () => {
      expect(extractTodoTitle('Add buy milk')).toMatchObject({
        title: 'buy milk',
        dueDate: undefined,
      });
    });

    it('removes command verb "Create" with "a todo"', () => {
      expect(extractTodoTitle('Create a todo to call John')).toMatchObject({ title: 'call John' });
    });

    it('converts "I need to" to imperative', () => {
      expect(extractTodoTitle('I need to finish the report')).toMatchObject({
        title: 'finish the report',
      });
    });

    it('converts "I have to" to imperative', () => {
      expect(extractTodoTitle('I have to buy shoes')).toMatchObject({ title: 'buy shoes' });
    });

    it('converts "I should" to imperative', () => {
      expect(extractTodoTitle('I should clean the garage')).toMatchObject({
        title: 'clean the garage',
      });
    });

    it('handles direct imperative form', () => {
      expect(extractTodoTitle('Buy flowers tomorrow')).toMatchObject({
        title: 'Buy flowers tomorrow',
      });
    });

    it('removes "Send a todo:" prefix', () => {
      expect(extractTodoTitle('Send a todo: review document')).toMatchObject({
        title: 'review document',
      });
    });

    it('handles empty text', () => {
      expect(extractTodoTitle('')).toMatchObject({ title: '' });
    });

    it('detects high-confidence due dates', () => {
      const result = extractTodoTitle('Submit report by 2025-11-03');
      expect(result.title).toBe('Submit report by 2025-11-03');
      expect(result.dueDate?.startsWith('2025-11-03')).toBe(true);
    });
  });

  describe('parseHabit', () => {
    it('extracts habit name with "every day" cadence', () => {
      const result = parseHabit('Meditate every day');
      expect(result.name).toBe('Meditate');
      expect(result.cadence).toBe('every day');
    });

    it('extracts habit name with "every morning" cadence', () => {
      const result = parseHabit('Exercise every morning');
      expect(result.name).toBe('Exercise');
      expect(result.cadence).toBe('every morning');
    });

    it('extracts habit with "daily" cadence', () => {
      const result = parseHabit('Read daily');
      expect(result.name).toBe('Read');
      expect(result.cadence).toBe('daily');
    });

    it('removes "Add a habit" prefix', () => {
      const result = parseHabit('Add a habit to run every day');
      expect(result.name).toBe('run');
      expect(result.cadence).toBe('every day');
    });

    it('removes "start" prefix', () => {
      const result = parseHabit('Start meditating daily');
      expect(result.name).toBe('meditating');
      expect(result.cadence).toBe('daily');
    });

    it('removes "want to" prefix', () => {
      const result = parseHabit('Want to exercise every morning');
      expect(result.name).toBe('exercise');
      expect(result.cadence).toBe('every morning');
    });

    it('handles habit without cadence', () => {
      const result = parseHabit('Meditate');
      expect(result.name).toBe('Meditate');
      expect(result.cadence).toBeUndefined();
    });

    it('handles specific day cadence', () => {
      const result = parseHabit('Go to gym every Monday');
      expect(result.name).toBe('Go to gym');
      expect(result.cadence).toBe('every Monday');
    });

    it('handles empty text', () => {
      const result = parseHabit('');
      expect(result.name).toBe('');
      expect(result.cadence).toBeUndefined();
    });
  });

  describe('Integration: Note prefill', () => {
    it('creates correct prefill for "Remember: cancel gym"', () => {
      const userText = 'Remember: cancel gym';
      const prefill = {
        title: smartTitle(userText),
        note: userText,
      };

      expect(prefill.title).toBe('cancel gym');
      expect(prefill.note).toBe('Remember: cancel gym');
    });

    it('preserves full text in note field', () => {
      const userText = 'Note: Meeting at 3pm with John about project X';
      const prefill = {
        title: smartTitle(userText),
        note: userText,
      };

      expect(prefill.title).toBe('Meeting at 3pm with John about project X');
      expect(prefill.note).toBe(userText);
    });
  });

  describe('Integration: Todo prefill', () => {
    it('creates imperative title', () => {
      const userText = 'I need to buy milk and eggs';
      const prefill = extractTodoTitle(userText);

      expect(prefill.title).toBe('buy milk and eggs');
      expect(prefill.dueDate).toBeUndefined();
    });
  });

  describe('Integration: Habit prefill', () => {
    it('extracts name and cadence', () => {
      const userText = 'Add a habit to meditate every morning';
      const habitData = parseHabit(userText);

      expect(habitData.name).toBe('meditate');
      expect(habitData.cadence).toBe('every morning');
    });
  });
});
