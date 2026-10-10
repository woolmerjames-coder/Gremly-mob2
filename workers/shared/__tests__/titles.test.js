/**
 * titles.js: Mind Drop's titles in the Worker and the two logged backstops on
 * Gremly's reaction. Formatting only: none of them reads what the words say.
 */
import {
  dashBackstop,
  fallbackTitle,
  lengthBackstop,
  sentenceCase,
  wordsAsTitle,
} from '../titles.js';

let warn;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('sentenceCase', () => {
  it('capitalises the first character and changes nothing else', () => {
    expect(sentenceCase('email the HOA about the permit')).toBe('Email the HOA about the permit');
    expect(sentenceCase('send Sage FY26 wrap up to leadership')).toBe(
      'Send Sage FY26 wrap up to leadership',
    );
    expect(sentenceCase('LLMO and SFDC sync with the UK team')).toBe(
      'LLMO and SFDC sync with the UK team',
    );
    expect(sentenceCase('book flights for lisbon')).toBe('Book flights for lisbon');
  });

  it('trims, and gives an empty string for nothing', () => {
    expect(sentenceCase('  dentist ')).toBe('Dentist');
    expect(sentenceCase('')).toBe('');
    expect(sentenceCase(null)).toBe('');
  });
});

describe('fallbackTitle (only for a title call that failed or returned nothing)', () => {
  it('uses the drop as it is when it fits', () => {
    expect(fallbackTitle('call the vet about the booster jab', 'enrich-phase1-5a')).toBe(
      'Call the vet about the booster jab',
    );
  });

  it('cuts a long drop at a whole word near 60 characters, never mid word', () => {
    const text =
      'book flights for lisbon, ask jo if she can dog sit, and i want to start stretching every morning';
    const t = fallbackTitle(text, 'enrich-phase1-5a');
    expect(t.length).toBeLessThanOrEqual(60);
    expect(text.toLowerCase().startsWith(t.toLowerCase())).toBe(true);
    expect(text[t.length]).toBe(' ');
  });

  it('keeps a single word longer than 60 characters whole rather than cut it', () => {
    const word = 'x'.repeat(70);
    expect(fallbackTitle(word, 'enrich-phase1-5a')).toBe('X' + 'x'.repeat(69));
  });

  it('keeps the capitals they typed', () => {
    expect(fallbackTitle('Send Sage FY26 wrap up', 'r')).toBe('Send Sage FY26 wrap up');
  });

  it('logs every time it is used', () => {
    fallbackTitle('dentist', 'enrich-phase1-5a');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toMatchObject({ route: 'enrich-phase1-5a' });
  });
});

describe('the reaction backstops', () => {
  it('swaps a dash for a comma and logs it', () => {
    expect(dashBackstop('Garage day — brave choice', 'enrich-phase1-5a')).toBe(
      'Garage day, brave choice',
    );
    expect(dashBackstop('Garage day–brave', 'r')).toBe('Garage day, brave');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('leaves a reaction without dashes alone and logs nothing', () => {
    expect(dashBackstop('The HOA will not know what hit them.', 'r')).toBe(
      'The HOA will not know what hit them.',
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('cuts an over long reaction with an ellipsis and logs it', () => {
    const long = 'a'.repeat(80);
    expect(lengthBackstop(long, 70, 'enrich-phase1-5a')).toBe('a'.repeat(67) + '...');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(lengthBackstop('short', 70, 'r')).toBe('short');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('wordsAsTitle (the app, stage 4)', () => {
  it('cuts at a whole word near 60 characters, in sentence case, without a log', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const long =
      'call the bank about the mortgage renewal and ask whether the rate can be fixed for five years';
    const t = wordsAsTitle(long);
    expect(t.length).toBeLessThanOrEqual(60);
    expect(long.startsWith(t.toLowerCase())).toBe(true);
    expect(t[0]).toBe('C');
    expect(wordsAsTitle('  buy   milk ')).toBe('Buy milk');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
