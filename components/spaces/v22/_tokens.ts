// Brand tokens for Space v2.2
// Exported as simple constants for reuse across v22 components

export const COLORS = {
  Moss: '#2E5540',
  Sage: '#BFD8C0',
  Linen: '#F9F6F1',
  Pear: '#E0C47A',
  Periwinkle: '#9CA6E0',
  Text: '#222222',
  Deep: '#1A3328',
} as const;

export const RADII = {
  card: 12,
  btn: 10,
  header: 6,
} as const;

export const SHADOW = {
  card: 'rgba(0,0,0,0.06) 0px 2px 10px',
} as const;

export const SPACE = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export type Colors = typeof COLORS;
export type Radii = typeof RADII;
export type Shadow = typeof SHADOW;
export type Space = typeof SPACE;
