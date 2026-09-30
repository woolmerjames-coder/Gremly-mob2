import { GREMLY_BUTTON_IMAGE_SIZE, gremlyButtonFillHeight } from '../gremlyButtonFill';

const BOTTOM_PAD = ((500 - 429) / 500) * GREMLY_BUTTON_IMAGE_SIZE;
const TOP_OF_CIRCLE = ((500 - 71) / 500) * GREMLY_BUTTON_IMAGE_SIZE;

describe('gremlyButtonFillHeight', () => {
  it('shows no colour on the circle when the gauge is empty', () => {
    expect(gremlyButtonFillHeight(0, false)).toBeCloseTo(BOTTOM_PAD);
  });

  it('fills to the top of the circle when the gauge is full', () => {
    expect(gremlyButtonFillHeight(1, false)).toBeCloseTo(TOP_OF_CIRCLE);
  });

  it('rises as the gauge rises', () => {
    const quarter = gremlyButtonFillHeight(0.25, false);
    const half = gremlyButtonFillHeight(0.5, false);
    expect(quarter).toBeGreaterThan(BOTTOM_PAD);
    expect(half).toBeGreaterThan(quarter);
    expect(half).toBeLessThan(TOP_OF_CIRCLE);
  });

  it('keeps values outside 0 to 1 inside the circle', () => {
    expect(gremlyButtonFillHeight(-1, false)).toBeCloseTo(BOTTOM_PAD);
    expect(gremlyButtonFillHeight(3, false)).toBeCloseTo(TOP_OF_CIRCLE);
  });

  it('is fully green once Gremly has been fed today', () => {
    expect(gremlyButtonFillHeight(0.2, true)).toBe(GREMLY_BUTTON_IMAGE_SIZE);
  });
});
