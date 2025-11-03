import { BRAND } from './brand';

// Gradient stops for linear backgrounds
export const GRADIENTS = {
  // Vertical soft blend Moss -> Sage for Focus hero
  focusHero: [BRAND.colors.mossGreen, BRAND.colors.sageMist],

  // v4.2 Focus hero per 10.9B: Sage Mist -> Linen Cream (top -> bottom)
  focusHeroV2: [BRAND.colors.sageMist, BRAND.colors.linenCream],

  // Optional future ribbons
  sweepRibbon: [BRAND.colors.goldenPear, '#E9D699'],
} as const;
