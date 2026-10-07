/**
 * @jest-environment node
 *
 * A field the check failed is cleared. A failed headline stays blank: no
 * other line of the day stands in for it.
 */
import { clearFailed } from '../daily';

jest.mock('../db', () => ({ ...jest.requireActual('../db'), db: jest.fn() }));
jest.mock('../llm', () => ({ jsonCall: jest.fn(), modelFor: jest.fn() }));

const draft = () => ({
  headline: 'A made up headline the check turned down',
  day_shape: 'Three meetings in the morning, then a clear afternoon.',
  lead_what: 'The talk with Sam about the move',
  today_focus: ['one', 'two'],
  also_matters: ['three'],
  claims: [{ ref: 't1' }, { ref: 't2' }],
  reach_ref: 'f1',
  reach_why: 'a reason',
});

describe('clearFailed', () => {
  it('leaves a failed headline blank and keeps the lines that passed', () => {
    const out = clearFailed(draft(), [
      { field: 'headline', problem: 'names a day it does not hold' },
    ]);
    expect(out.headline).toBeNull();
    expect(out.day_shape).toBe('Three meetings in the morning, then a clear afternoon.');
    expect(out.lead_what).toBe('The talk with Sam about the move');
  });

  it('never takes the shape of the day or the lead as the headline when both fail', () => {
    const out = clearFailed(draft(), [{ field: 'headline' }, { field: 'lead_what' }]);
    expect(out.headline).toBeNull();
    expect(out.lead_what).toBeNull();
    expect(out.day_shape).toBe('Three meetings in the morning, then a clear afternoon.');
  });

  it('clears one item of a list and the reach with its reason', () => {
    const out = clearFailed(draft(), [
      { field: 'today_focus_1' },
      { field: 'claims_0' },
      { field: 'reach_why' },
    ]);
    expect(out.today_focus).toEqual(['one', null]);
    expect(out.claims[0]).toBeNull();
    expect(out.reach_why).toBeNull();
    expect(out.reach_ref).toBeNull();
    expect(out.headline).toBe('A made up headline the check turned down');
  });

  it('changes nothing when nothing failed', () => {
    expect(clearFailed(draft(), [])).toEqual(draft());
    expect(clearFailed(draft(), undefined)).toEqual(draft());
  });
});
