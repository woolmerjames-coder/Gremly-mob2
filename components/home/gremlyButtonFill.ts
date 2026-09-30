/**
 * How far the Gremly tab button's green layer rises over its grey one.
 *
 * buttonforHP.png is drawn at GREMLY_BUTTON_IMAGE_SIZE; its circle runs from
 * 71 to 429 of the file's 500px, so the colour fills only across the circle.
 * The fill follows the same curve as the mascot (gaugeToFill), and is full
 * once Gremly has been fed today.
 */

import { gaugeToFill } from '../../app/components/MascotLottie';

export const GREMLY_BUTTON_IMAGE_SIZE = 81;
const CIRCLE_BOTTOM_PAD = ((500 - 429) / 500) * GREMLY_BUTTON_IMAGE_SIZE;
const CIRCLE_HEIGHT = ((429 - 71) / 500) * GREMLY_BUTTON_IMAGE_SIZE;

/** Height of the green layer, measured up from the bottom of the image. */
export function gremlyButtonFillHeight(gaugeValue: number, isFedToday: boolean): number {
  if (isFedToday) return GREMLY_BUTTON_IMAGE_SIZE;
  return CIRCLE_BOTTOM_PAD + gaugeToFill(gaugeValue) * CIRCLE_HEIGHT;
}
