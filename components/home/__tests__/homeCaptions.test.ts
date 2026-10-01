import { inFirstWeek, FIRST_WEEK_MS, DROP_CAPTION, CHAT_CAPTION } from '../homeCaptions';

describe('the first week line under the switch', () => {
  const made = '2026-09-30T12:00:00Z';
  const at = Date.parse(made);

  it('shows in the week after the account was made, then goes', () => {
    expect(inFirstWeek(made, at)).toBe(true);
    expect(inFirstWeek(made, at + FIRST_WEEK_MS - 1)).toBe(true);
    expect(inFirstWeek(made, at + FIRST_WEEK_MS)).toBe(false);
  });

  it('does not show when the account date is not known', () => {
    expect(inFirstWeek(null, at)).toBe(false);
    expect(inFirstWeek(undefined, at)).toBe(false);
    expect(inFirstWeek('not a date', at)).toBe(false);
  });

  it('is plain words, with no dash used as punctuation', () => {
    for (const line of [DROP_CAPTION, CHAT_CAPTION]) expect(line).not.toMatch(/[\u2013\u2014]| - /);
  });
});
