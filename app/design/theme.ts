/**
 * Gremly Brand Theme
 * Global design tokens for colors, typography, spacing, and shadows
 */

export const colors = {
  deepTeal: '#1C3738',
  mint: '#E6FBF4',
  periwinkle: '#CCD9FF',
  cream: '#FAFAF8',
  charcoal: '#1A1A1A',
  grayLine: '#E6E8E6',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;

export const shadow = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

export const textStyles = {
  header: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontWeight: '700' as const,
    fontSize: 20,
    lineHeight: 28,
    color: colors.deepTeal,
  },
  title: {
    fontFamily: 'Inter-Medium',
    fontWeight: '600' as const,
    fontSize: 18,
    lineHeight: 24,
    color: colors.deepTeal,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontWeight: '600' as const,
    fontSize: 14,
    lineHeight: 20,
    color: colors.deepTeal,
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontWeight: '400' as const,
    fontSize: 16,
    lineHeight: 24,
    color: colors.charcoal,
  },
  bodySmall: {
    fontFamily: 'Inter-Regular',
    fontWeight: '400' as const,
    fontSize: 14,
    lineHeight: 20,
    color: colors.charcoal,
  },
  caption: {
    fontFamily: 'Inter-Regular',
    fontWeight: '400' as const,
    fontSize: 12,
    lineHeight: 16,
    color: colors.charcoal,
  },
} as const;

export const theme = {
  colors,
  spacing,
  radii,
  shadow,
  textStyles,
} as const;

export type Theme = typeof theme;
