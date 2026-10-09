/**
 * The dot on the Worlds tab: on when something new lands in Worlds from
 * somewhere else, off once Worlds is opened.
 */
import { clearWorldsNew, firstWorldsArrived, markWorldsNew, useWorldsDot } from '../dot';

it('goes on when something new lands, and off when Worlds is opened', () => {
  expect(useWorldsDot.getState().on).toBe(false);
  markWorldsNew();
  expect(useWorldsDot.getState().on).toBe(true);
  clearWorldsNew();
  expect(useWorldsDot.getState().on).toBe(false);
});

it('their first Worlds arriving is something new; more Worlds later are not', () => {
  expect(firstWorldsArrived(0, 3)).toBe(true);
  expect(firstWorldsArrived(2, 3)).toBe(false);
  expect(firstWorldsArrived(0, 0)).toBe(false);
});
