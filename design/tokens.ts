/**
 * Design tokens for the Gremly design system.
 * Provides role-based colors, spacing, radius, and typography scales.
 */

export const lightTokens = {
  colors: {
    bg: '#FFFFFF',
    surface: '#F8F9FB',
    text: '#0E1116',
    subtle: '#6A6F76',
    primary: '#0D3B3A',
    success: '#34C759',
    danger: '#E25555',
    border: '#DADDE3',
    card: '#FFFFFF',
  },
  spacing: [0, 4, 8, 12, 16, 20, 24, 32] as const,
  radius: [0, 6, 12, 16, 20] as const,
  typography: {
    fontFamily: {
      regular: 'System',
      medium: 'System',
      bold: 'System',
    },
    size: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 20,
      xl: 24,
      '2xl': 32,
    },
    lineHeight: {
      tight: 1.1,
      snug: 1.25,
      normal: 1.4,
      relaxed: 1.6,
    },
  },
} as const;

export const darkTokens = {
  colors: {
    bg: '#0B0E13',
    surface: '#11151C',
    text: '#EAF0F7',
    subtle: '#6A6F76',
    primary: '#8EE3D2',
    success: '#34C759',
    danger: '#E25555',
    border: '#DADDE3',
    card: '#11151C',
  },
  spacing: [0, 4, 8, 12, 16, 20, 24, 32] as const,
  radius: [0, 6, 12, 16, 20] as const,
  typography: {
    fontFamily: {
      regular: 'System',
      medium: 'System',
      bold: 'System',
    },
    size: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 20,
      xl: 24,
      '2xl': 32,
    },
    lineHeight: {
      tight: 1.1,
      snug: 1.25,
      normal: 1.4,
      relaxed: 1.6,
    },
  },
} as const;

export type Tokens = typeof lightTokens;

// Legacy exports for backward compatibility
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const;

export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
} as const;

export const colors = {
  deepTeal: {
    DEFAULT: '#0D3B3A',
    600: '#0F4C4B',
    700: '#0B3332',
    900: '#072524',
  },
  mint: '#B7F7E1',
  cream: '#FFF7EA',
  periwinkle: '#C9D4FF',
  bg: {
    DEFAULT: '#FFF7EA',
    secondary: '#FFF1E5',
  },
  text: {
    primary: '#1A1A1A',
    secondary: '#4B5563',
    tertiary: '#9CA3AF',
  },
  border: {
    DEFAULT: '#E5E5E5',
    focus: '#0D3B3A',
  },
  white: '#FFFFFF',
  black: '#000000',
  error: '#DC2626',
  success: '#10B981',
  warning: '#F59E0B',
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
} as const;
