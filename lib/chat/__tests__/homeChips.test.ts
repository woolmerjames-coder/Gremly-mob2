/**
 * The chat home's chips follow the part of the day, and the hours before the
 * day boundary still count as last night.
 */
import { chipPrompt, homeChipsFor, homePhase } from '../homeChips';

const at = (h: number, m = 0) => h * 60 + m;

describe('homePhase', () => {
  it('morning until noon, the day until five, then the evening', () => {
    expect(homePhase(at(7), 3)).toBe('morning');
    expect(homePhase(at(11, 59), 3)).toBe('morning');
    expect(homePhase(at(12), 3)).toBe('day');
    expect(homePhase(at(16, 59), 3)).toBe('day');
    expect(homePhase(at(17), 3)).toBe('evening');
    expect(homePhase(at(23, 30), 3)).toBe('evening');
  });

  it('is still last night before the day boundary', () => {
    expect(homePhase(at(1), 3)).toBe('evening');
    expect(homePhase(at(2, 59), 3)).toBe('evening');
    expect(homePhase(at(3), 3)).toBe('morning');
    expect(homePhase(at(1), 0)).toBe('morning');
  });
});

describe('homeChipsFor', () => {
  const keys = (
    phase: 'morning' | 'day' | 'evening',
    day: { wrap?: boolean; planned?: boolean } = {},
  ) =>
    homeChipsFor(phase, { wrap: day.wrap ?? true, planned: day.planned ?? false }).map(
      (c) => c.key,
    );

  it('the first chip is the ritual: plan the day, wrap it up, then tomorrow', () => {
    // the morning, before today has a plan
    expect(keys('morning')).toEqual(['plan_day', 'this_week', 'think']);
    // once it has one, the wrap up is there, whatever the hour
    expect(keys('morning', { planned: true })).toEqual(['wrap_up', 'this_week', 'think']);
    // from midday it is there with or without a plan
    expect(keys('day')).toEqual(['wrap_up', 'think', 'this_week']);
    expect(keys('evening')).toEqual(['wrap_up', 'tomorrow', 'think']);
  });

  it('moves on to tomorrow once the day is wrapped up', () => {
    expect(keys('morning', { planned: true, wrap: false })).toEqual([
      'tomorrow',
      'this_week',
      'think',
    ]);
    expect(keys('day', { wrap: false })).toEqual(['tomorrow', 'think', 'this_week']);
    expect(keys('evening', { wrap: false })).toEqual(['tomorrow', 'think', 'habits']);
  });

  it('still plans the day first in the morning, even when the wrap up could start', () => {
    expect(keys('morning', { wrap: true, planned: false })[0]).toBe('plan_day');
  });

  it('marks the wrap up in the evening colour', () => {
    expect(homeChipsFor('evening', { wrap: true, planned: false })[0]).toMatchObject({
      label: 'Wrap up today',
      evening: true,
    });
  });
});

describe('chipPrompt', () => {
  it('sends a question for the asking chips and nothing for the ones that open something', () => {
    expect(chipPrompt('this_week')).toBe("What's coming up this week?");
    expect(chipPrompt('tomorrow')).toBe("What's on tomorrow?");
    expect(chipPrompt('plan_day')).toBeNull();
    expect(chipPrompt('wrap_up')).toBeNull();
  });
});
