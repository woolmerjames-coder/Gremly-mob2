import { BRAND } from './brand';

// Gradient stops for linear backgrounds
export const GRADIENTS = {
  // Vertical soft blend Moss -> Sage for Focus hero
  focusHero: [BRAND.colors.mossGreen, BRAND.colors.sageMist],

  // Optional future ribbons
  sweepRibbon: [BRAND.colors.goldenPear, '#E9D699'],
} as const;
