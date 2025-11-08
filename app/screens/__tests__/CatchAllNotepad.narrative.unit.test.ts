/**
 * Unit tests for narrative classification heuristic
 */

import { classifyNarrative } from '../CatchAllNotepad';

describe('classifyNarrative', () => {
  describe('should classify as narrative', () => {
    it('multi-sentence reflective text', () => {
      expect(
        classifyNarrative(
          'Had a great day today. Met with friends and discussed interesting ideas.',
        ),
      ).toBe(true);
    });

    it('long single sentence philosophical text', () => {
      expect(
        classifyNarrative(
          'Thinking deeply about how to approach this complex philosophical question regarding consciousness',
        ),
      ).toBe(true);
    });

    it('journal entry without action words', () => {
      expect(
        classifyNarrative(
          'Feeling grateful for the beautiful weather. It really lifted my spirits and gave me energy.',
        ),
      ).toBe(true);
    });

    it('multiple sentences about experiences', () => {
      expect(
        classifyNarrative(
          'The meeting went well. Everyone was engaged and we had productive discussions.',
        ),
      ).toBe(true);
    });
  });

  describe('should NOT classify as narrative (actionable)', () => {
    it('imperative verb start - buy', () => {
      expect(classifyNarrative('Buy groceries tomorrow')).toBe(false);
    });

    it('imperative verb start - call', () => {
      expect(classifyNarrative('Call mom about dinner plans')).toBe(false);
    });

    it('imperative verb start - schedule', () => {
      expect(classifyNarrative('Schedule dentist appointment')).toBe(false);
    });

    it('contains task keyword - todo', () => {
      expect(classifyNarrative('Add this to my todo list for next week')).toBe(false);
    });

    it('contains task keyword - urgent', () => {
      expect(classifyNarrative('This is urgent and needs attention')).toBe(false);
    });

    it('contains task keyword - ASAP', () => {
      expect(classifyNarrative('Need to finish this ASAP')).toBe(false);
    });

    it('contains task keyword - deadline', () => {
      expect(classifyNarrative('The deadline is approaching fast')).toBe(false);
    });

    it('contains date pattern - tomorrow', () => {
      expect(classifyNarrative('Meeting tomorrow at the office')).toBe(false);
    });

    it('contains date pattern - monday', () => {
      expect(classifyNarrative('Need to prepare for Monday presentation')).toBe(false);
    });

    it('contains date pattern - time', () => {
      expect(classifyNarrative('Appointment at 3:30 this afternoon')).toBe(false);
    });

    it('short task-like text', () => {
      expect(classifyNarrative('Fix the bug')).toBe(false);
    });

    it('single short sentence', () => {
      expect(classifyNarrative('Quick note')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('empty string', () => {
      expect(classifyNarrative('')).toBe(false);
    });

    it('only whitespace', () => {
      expect(classifyNarrative('   ')).toBe(false);
    });

    it('single word', () => {
      expect(classifyNarrative('Hello')).toBe(false);
    });

    it('narrative with imperative verb NOT at start', () => {
      expect(
        classifyNarrative(
          'Today was productive. Should buy new office supplies when I get a chance.',
        ),
      ).toBe(true); // "buy" is not the first word
    });

    it('narrative despite containing a month name in context', () => {
      // "May" as modal verb, not month
      expect(
        classifyNarrative(
          'Reflecting on choices. May need to reconsider my approach to work-life balance.',
        ),
      ).toBe(true);
    });
  });

  describe('complex scenarios', () => {
    it('imperative at start overrides multiple sentences', () => {
      expect(
        classifyNarrative(
          'Send the email to the team. Make sure everyone is included and has the latest updates.',
        ),
      ).toBe(false);
    });

    it('narrative style with action verb but not imperative', () => {
      expect(
        classifyNarrative(
          'Thinking about buying a new car. The options are overwhelming and prices keep changing.',
        ),
      ).toBe(true); // "Thinking" is not in imperative list, "buying" is not first word
    });

    it('narrative mentioning a day in past context', () => {
      expect(
        classifyNarrative(
          'Reflecting on last Tuesday when we had that interesting conversation about future plans and career goals.',
        ),
      ).toBe(true); // "Tuesday" without action context is narrative
    });

    it('actionable text with day and time qualifier', () => {
      expect(classifyNarrative('Need to prepare for Monday afternoon presentation')).toBe(false); // "Monday afternoon" is actionable pattern
    });
  });
});
