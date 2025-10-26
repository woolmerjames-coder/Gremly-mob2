// Brand tokens for Space v3.3 (v33)
// Sage-first palette + subtle motion timings

export const COLORS = {
  Sage: '#BFD8C0', // primary surface
  Deep: '#153326', // primary text / accents
  Moss: '#2E5540',
  Linen: '#F9F6F1',
  Pear: '#E0C47A',
  Sky: '#CFE7F3',
} as const;

export const RADII = {
  card: 14,
  chip: 999,
  header: 8,
} as const;

export const SPACE = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
} as const;

export const MOTION = {
  enter: 200,
  exit: 160,
  subtle: 120,
} as const;

export type Colors = typeof COLORS;
export type Radii = typeof RADII;
export type Space = typeof SPACE;
export type Motion = typeof MOTION;
