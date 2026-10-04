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
  const keys = (phase: 'morning' | 'day' | 'evening', wrapOffered = false) =>
    homeChipsFor(phase, wrapOffered).map((c) => c.key);

  it('plans in the morning, thinks in the day, wraps up in the evening', () => {
    expect(keys('morning')).toEqual(['plan_day', 'this_week', 'think']);
    expect(keys('day')).toEqual(['think', 'this_week', 'habits']);
    expect(keys('evening', true)).toEqual(['wrap_up', 'tomorrow', 'think']);
  });

  it('offers no wrap up once it is finished', () => {
    expect(keys('evening', false)).toEqual(['tomorrow', 'think', 'habits']);
  });

  it('marks the wrap up in the evening colour', () => {
    expect(homeChipsFor('evening', true)[0]).toMatchObject({
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
