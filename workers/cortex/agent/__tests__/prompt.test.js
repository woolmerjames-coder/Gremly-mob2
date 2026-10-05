/**
 * @jest-environment node
 */
// The date and time the agent is told with each message
// (workers/cortex/agent/prompt.js): after midnight and before their day ends,
// the clock's date and their day are told apart.

import { todayLine, messageWithContext } from '../prompt.js';

describe('the date and time with each message', () => {
  it('is their day and the time, in the day', () => {
    expect(todayLine('2026-10-02', 9 * 60 + 5, 3)).toBe(
      'Today is Friday 2 October 2026, and it is 9:05am where they are.',
    );
    expect(todayLine('2026-10-02')).toBe('Today is Friday 2 October 2026 where they are.');
  });

  it('tells the clock and their day apart in the small hours', () => {
    const line = todayLine('2026-10-03', 60 + 46, 3);
    expect(line).toContain('It is 1:46am on Sunday 4 October 2026 by the clock');
    expect(line).toContain('their day ends at 3am');
    expect(line).toContain('for them it is still Saturday 3 October 2026, late at night');
    expect(line).toContain('Their tomorrow is Sunday 4 October 2026');
    expect(line).toContain('any time of day they name for later is on Sunday');
    expect(line).not.toMatch(/[–—]/);
  });

  it('keeps to the clock when their day ends at midnight, or the hour is not known', () => {
    expect(todayLine('2026-10-04', 60 + 46, 0)).toBe(
      'Today is Sunday 4 October 2026, and it is 1:46am where they are.',
    );
    expect(todayLine('2026-10-04', 60 + 46)).toBe(
      'Today is Sunday 4 October 2026, and it is 1:46am where they are.',
    );
  });

  it('rides with the message', () => {
    const text = messageWithContext({
      message: 'hi',
      today: '2026-10-03',
      nowMin: 30,
      dayEndHour: 3,
    });
    expect(text).toContain('It is 12:30am on Sunday 4 October 2026 by the clock');
    expect(text.endsWith('THEIR MESSAGE\nhi')).toBe(true);
  });
});
