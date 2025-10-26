// Brand tokens for Space v3.3 (v33)
// Sage-first palette + motion presets

export const COLORS = {
  Sage: '#BFD8C0',
  Linen: '#F9F6F1',
  Moss: '#2E5540',
  Pear: '#E0C47A',
  Periwinkle: '#9CA6E0',
  Text: '#222222',
  Deep: '#1A3328',
} as const;

export const RADII = {
  card: 10,
  overlay: 6,
  btn: 8,
} as const;

export const ELEV = {
  card: '0 2px 10px rgba(0,0,0,0.06)',
} as const;

export const SPACE = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
} as const;

export const MOTION = {
  fadeUp: '250ms ease-out',
  menu: '200ms ease-out',
  expand: '300ms ease',
} as const;

export type Colors = typeof COLORS;
export type Radii = typeof RADII;
export type Elev = typeof ELEV;
export type Space = typeof SPACE;
export type Motion = typeof MOTION;
