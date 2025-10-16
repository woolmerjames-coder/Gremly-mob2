/**
 * Design Tokens - Gremly Design System
 * Extracted from tailwind.config.js for StyleSheet usage
 */

export const colors = {
  // Brand Colors
  deepTeal: {
    DEFAULT: '#0D3B3A',
    600: '#0F4C4B',
    700: '#0B3332',
    900: '#072524',
  },
  mint: '#B7F7E1',
  cream: '#FFF7EA',
  periwinkle: '#C9D4FF',

  // Semantic Tokens
  bg: {
    DEFAULT: '#FFF7EA', // cream
    secondary: '#FFF1E5', // lighter cream
  },
  text: {
    primary: '#1A1A1A',
    secondary: '#4B5563', // gray-700
    tertiary: '#9CA3AF', // gray-400
  },
  border: {
    DEFAULT: '#E5E5E5',
    focus: '#0D3B3A', // deepTeal
  },

  // Functional Colors
  white: '#FFFFFF',
  black: '#000000',
  error: '#DC2626', // red-600
  success: '#10B981', // green-500
  warning: '#F59E0B', // amber-500

  // Grays
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

export const lineHeight = {
  tight: 1.25,
  normal: 1.5,
  relaxed: 1.75,
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
} as const;

export const opacity = {
  disabled: 0.5,
  hover: 0.7,
  subtle: 0.1,
} as const;
