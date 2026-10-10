/**
 * isUrgent. The timing chips this file also tested went in stage 11 of the Mind
 * Drop rethink: they could never show (nothing ever set them).
 */

import { isUrgent } from '../CatchAllNotepad';

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
