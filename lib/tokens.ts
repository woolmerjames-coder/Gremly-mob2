/**
 * Design Tokens - Gremly Brand System
 *
 * Centralized design tokens for consistent styling across the app.
 * Use these instead of hardcoded values in StyleSheet.create().
 */

export const colors = {
  deepTeal: '#0D3B3A',
  mint: '#B7F7E1',
  cream: '#FFF7EA',
  periwinkle: '#C9D4FF',
  ink: '#0D3B3A',
  inkMuted: '#6B8A89',
  border: '#98C1BF',
  white: '#FFFFFF',
  error: '#EF4444',
} as const;

export const radius = {
  xl: 24,
  lg: 16,
  md: 12,
  sm: 8,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  button: {
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
} as const;

export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: '700' as const,
    lineHeight: 40,
  },
  h2: {
    fontSize: 24,
    fontWeight: '600' as const,
    lineHeight: 32,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 28,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
  },
} as const;

// Type exports for strong typing
export type Color = keyof typeof colors;
export type Radius = keyof typeof radius;
export type Spacing = keyof typeof spacing;
export type Shadow = keyof typeof shadow;
export type Typography = keyof typeof typography;
