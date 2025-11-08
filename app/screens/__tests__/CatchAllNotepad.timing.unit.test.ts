/**
 * Test suite for timing chips on high-confidence todo classification
 */

import { getTimingChips, timingOptionToDate, isUrgent } from '../CatchAllNotepad';

describe('Timing Chips Logic', () => {
  describe('getTimingChips', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('shows Today/Tomorrow/Someday in morning (6-10)', () => {
      jest.setSystemTime(new Date('2025-11-08T08:00:00'));
      const chips = getTimingChips();
      expect(chips).toEqual([
        { option: 'today', label: 'Today' },
        { option: 'tomorrow', label: 'Tomorrow' },
        { option: 'someday', label: 'Someday' },
      ]);
    });

    it('shows Tomorrow/Today actually/Someday in evening (18-23)', () => {
      jest.setSystemTime(new Date('2025-11-08T20:00:00'));
      const chips = getTimingChips();
      expect(chips).toEqual([
        { option: 'tomorrow', label: 'Tomorrow' },
        { option: 'today-actually', label: 'Today actually' },
        { option: 'someday', label: 'Someday' },
      ]);
    });

    it('shows Tomorrow/Later this week/Someday in late night (23-5)', () => {
      jest.setSystemTime(new Date('2025-11-08T23:30:00'));
      const chips = getTimingChips();
      expect(chips).toEqual([
        { option: 'tomorrow', label: 'Tomorrow' },
        { option: 'later-this-week', label: 'Later this week' },
        { option: 'someday', label: 'Someday' },
      ]);
    });

    it('shows Monday/This weekend/Someday on Friday after 15:00', () => {
      // Set to Friday Nov 7, 2025 at 16:00
      jest.setSystemTime(new Date('2025-11-07T16:00:00')); // This is a Friday
      const chips = getTimingChips();
      expect(chips).toEqual([
        { option: 'monday', label: 'Monday' },
        { option: 'this-weekend', label: 'This weekend' },
        { option: 'someday', label: 'Someday' },
      ]);
    });

    it('shows Today/Tomorrow/Someday for default times', () => {
      jest.setSystemTime(new Date('2025-11-08T14:00:00')); // Saturday afternoon
      const chips = getTimingChips();
      expect(chips).toEqual([
        { option: 'today', label: 'Today' },
        { option: 'tomorrow', label: 'Tomorrow' },
        { option: 'someday', label: 'Someday' },
      ]);
    });
  });

  describe('timingOptionToDate', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      // Set to Nov 7, 2025, 10:00 AM (Friday)
      jest.setSystemTime(new Date('2025-11-07T10:00:00'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('today sets to 17:00 same day', () => {
      const date = timingOptionToDate('today');
      expect(date).toBeTruthy();
      const parsed = new Date(date!);
      expect(parsed.getHours()).toBe(17);
      expect(parsed.getDate()).toBe(7);
    });

    it('today-actually sets to 17:00 same day', () => {
      const date = timingOptionToDate('today-actually');
      expect(date).toBeTruthy();
      const parsed = new Date(date!);
      expect(parsed.getHours()).toBe(17);
      expect(parsed.getDate()).toBe(7);
    });

    it('tomorrow sets to 09:00 next day', () => {
      const date = timingOptionToDate('tomorrow');
      expect(date).toBeTruthy();
      const parsed = new Date(date!);
      expect(parsed.getHours()).toBe(9);
      expect(parsed.getDate()).toBe(8);
    });

    it('later-this-week sets to +3 days at 09:00', () => {
      const date = timingOptionToDate('later-this-week');
      expect(date).toBeTruthy();
      const parsed = new Date(date!);
      expect(parsed.getHours()).toBe(9);
      expect(parsed.getDate()).toBe(10); // Nov 7 + 3 = Nov 10
    });

    it('this-weekend sets to upcoming Saturday at 10:00', () => {
      const date = timingOptionToDate('this-weekend');
      expect(date).toBeTruthy();
      const parsed = new Date(date!);
      expect(parsed.getHours()).toBe(10);
      expect(parsed.getDay()).toBe(6); // Saturday
      expect(parsed.getDate()).toBe(8); // Next Saturday from Friday Nov 7
    });

    it('monday sets to next Monday at 09:00', () => {
      const date = timingOptionToDate('monday');
      expect(date).toBeTruthy();
      const parsed = new Date(date!);
      expect(parsed.getHours()).toBe(9);
      expect(parsed.getDay()).toBe(1); // Monday
      expect(parsed.getDate()).toBe(10); // Next Monday from Friday Nov 7
    });

    it('someday returns null', () => {
      const date = timingOptionToDate('someday');
      expect(date).toBeNull();
    });
  });

  describe('isUrgent', () => {
    it('returns true for text with "asap"', () => {
      expect(isUrgent('Fix this bug asap')).toBe(true);
      expect(isUrgent('ASAP please help')).toBe(true);
    });

    it('returns true for text with "urgent"', () => {
      expect(isUrgent('Urgent: call the doctor')).toBe(true);
      expect(isUrgent('This is urgent')).toBe(true);
    });

    it('returns true for text with "now"', () => {
      expect(isUrgent('Do this now')).toBe(true);
      expect(isUrgent('NOW is the time')).toBe(true);
    });

    it('returns true for text with "immediately"', () => {
      expect(isUrgent('Need this immediately')).toBe(true);
      expect(isUrgent('Respond immediately')).toBe(true);
    });

    it('returns true for text with "today"', () => {
      expect(isUrgent('Must finish today')).toBe(true);
      expect(isUrgent('Today is the deadline')).toBe(true);
    });

    it('returns false for text without urgent keywords', () => {
      expect(isUrgent('Buy groceries tomorrow')).toBe(false);
      expect(isUrgent('Call dentist next week')).toBe(false);
      expect(isUrgent('Review the document')).toBe(false);
    });

    it('detects urgent keywords in any case', () => {
      expect(isUrgent('FIX URGENT BUG')).toBe(true);
      expect(isUrgent('need this Now')).toBe(true);
      expect(isUrgent('asAP')).toBe(true);
    });

    it('detects urgent keywords as substrings', () => {
      expect(isUrgent('Complete this immediately!')).toBe(true);
      expect(isUrgent('asap123')).toBe(true);
    });
  });
});
