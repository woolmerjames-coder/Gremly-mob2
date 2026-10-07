/**
 * Today's sections: a time planned for today decides first, then today's
 * saved order, then the item's own block.
 */

import { getDateService } from '../../date/DateService';
import { localMinutesToIso } from '../../brief/time';
import { blockAt, briefFor, plannedMinutesOn, sectionFor, sequencesOf } from '../sectionFor';

const TODAY = '2026-10-07';
const at = (day: string, h: number, m = 0) => localMinutesToIso(day, h * 60 + m);

describe('sectionFor', () => {
  const ds = getDateService();
  const before = ds.getTimezone();
  beforeEach(() => ds.setTimezone('America/New_York'));
  afterEach(() => ds.setTimezone(before));

  it('puts an item with a time planned for today in the section for that time', () => {
    expect(sectionFor({ id: 'a', plannedIso: at(TODAY, 9, 30) }, TODAY, null)).toBe('morning');
    expect(sectionFor({ id: 'a', plannedIso: at(TODAY, 14) }, TODAY, null)).toBe('afternoon');
    expect(sectionFor({ id: 'a', plannedIso: at(TODAY, 19) }, TODAY, null)).toBe('evening');
  });

  it('lets the planned time win over the block and the usual time of day set before it', () => {
    // planned for the morning, then moved to the evening: the block still says morning
    expect(
      sectionFor({ id: 'a', plannedIso: at(TODAY, 18, 15), block: 'morning' }, TODAY, null),
    ).toBe('evening');
    expect(sectionFor({ id: 'a', plannedIso: at(TODAY, 8), block: 'evening' }, TODAY, null)).toBe(
      'morning',
    );
  });

  it('lets the planned time win over where the saved order had the item', () => {
    const sequences = sequencesOf({ date: TODAY, morning_sequence: [{ id: 'a' }] });
    expect(sectionFor({ id: 'a', plannedIso: at(TODAY, 15) }, TODAY, sequences)).toBe('afternoon');
  });

  it('puts a planned time in the part of the day their own settings give it', () => {
    // their afternoon runs to 6pm: 5:30pm is still the afternoon, as the block a plan writes says
    const late = { morning: { endHour: 12 }, day: { endHour: 18 } };
    expect(sectionFor({ id: 'a', plannedIso: at(TODAY, 17, 30) }, TODAY, null, late)).toBe(
      'afternoon',
    );
    expect(sectionFor({ id: 'a', plannedIso: at(TODAY, 18) }, TODAY, null, late)).toBe('evening');
    // with no settings to go by, Today's fixed hours
    expect(sectionFor({ id: 'a', plannedIso: at(TODAY, 17, 30) }, TODAY, null)).toBe('evening');
    expect(blockAt(11 * 60 + 59, late)).toBe('morning');
    expect(blockAt(4 * 60, late)).toBe('morning');
  });

  it('reads the time in their time zone, not the device clock', () => {
    // 8:00 pm in New York is midnight UTC: still this evening
    const iso = at(TODAY, 20);
    expect(iso).toBe('2026-10-08T00:00:00.000Z');
    expect(plannedMinutesOn(iso, TODAY)).toBe(20 * 60);
    expect(sectionFor({ id: 'a', plannedIso: iso, block: 'morning' }, TODAY, null)).toBe('evening');
  });

  it('takes no notice of a time planned for another day', () => {
    expect(plannedMinutesOn(at('2026-10-06', 9), TODAY)).toBeNull();
    expect(plannedMinutesOn(at('2026-10-08', 9), TODAY)).toBeNull();
    expect(
      sectionFor({ id: 'a', plannedIso: at('2026-10-06', 9), block: 'evening' }, TODAY, null),
    ).toBe('evening');
    expect(sectionFor({ id: 'a', plannedIso: at('2026-10-08', 9) }, TODAY, null)).toBe('anytime');
  });

  it('follows the saved order when no time is planned', () => {
    const sequences = sequencesOf({
      date: TODAY,
      morning_sequence: [{ id: 'a' }],
      day_sequence: [{ id: 'b' }],
      evening_sequence: [{ id: 'c' }],
    });
    expect(sectionFor({ id: 'a', block: 'evening' }, TODAY, sequences)).toBe('morning');
    expect(sectionFor({ id: 'b' }, TODAY, sequences)).toBe('afternoon');
    expect(sectionFor({ id: 'c' }, TODAY, sequences)).toBe('evening');
    expect(sectionFor({ id: 'd', block: 'day' }, TODAY, sequences)).toBe('afternoon');
  });

  it('uses the block on the item, then what the list worked out, then any time', () => {
    expect(sectionFor({ id: 'a', block: 'morning', inferred: 'evening' }, TODAY, null)).toBe(
      'morning',
    );
    expect(sectionFor({ id: 'a', block: null, inferred: 'midday' }, TODAY, null)).toBe('afternoon');
    expect(sectionFor({ id: 'a', block: 'any', inferred: 'any' }, TODAY, null)).toBe('anytime');
    expect(sectionFor({ id: 'a' }, TODAY, null)).toBe('anytime');
  });
});

describe('briefFor', () => {
  it("keeps the saved brief only when it is the day's", () => {
    const brief = { date: TODAY, morning_sequence: [{ id: 'a' }] };
    expect(briefFor(brief, TODAY)).toBe(brief);
    expect(briefFor(brief, '2026-10-08')).toBeNull();
    expect(briefFor(null, TODAY)).toBeNull();
    expect(sequencesOf(briefFor(brief, '2026-10-08'))).toBeNull();
  });
});
