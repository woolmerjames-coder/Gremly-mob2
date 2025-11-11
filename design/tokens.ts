/**
 * Design tokens for the Gremly design system - Updated with brand colors
 */

export type Tokens = typeof lightTokens;

export const lightTokens = {
  colors: {
    bg: '#FFFDF8',
    surface: '#FFFFFF',
    text: '#0E1116',
    subtle: '#6A6F76',
    // Primary button / accent color (Moss Green)
    primary: '#2E5540',
    // Text color placed on top of primary
    onPrimary: '#F9F6F1',
    accentMint: '#A5F3C1',
    accentPeri: '#AEB8FF',
    success: '#34C759',
    danger: '#E25555',
    border: '#E7E2D9',
    card: '#FFFFFF',

    // Harmonic Glass chat colors
    linenCream: '#F9F6F1',
    linenCreamLight: '#F3EFE8',
    mossGreen: '#2E5540',
    sageMist: '#BFD8C0',
    sageMistTranslucent: 'rgba(191, 216, 192, 0.85)',
    deepForest: '#1A3328',
    charcoalInk: '#222222',
    periwinkleSmoke: '#9CA6E0',
    // Short-name aliases for theme tokens (used in overlays)
    moss: '#2E5540',
    sage: '#BFD8C0',
    periwinkle: '#9CA6E0',
    linen: '#F9F6F1',
    deep: '#1A3328',
    charcoal: '#222222',
  },
  spacing: [0, 4, 8, 12, 16, 20, 24, 32] as const,
  radius: [0, 6, 12, 16, 20] as const,
  typography: {
    fontFamily: {
      regular: 'Inter-Regular',
      medium: 'Inter-Medium',
      bold: 'PlusJakartaSans-Bold',
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
  elevation: {
    none: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 2,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    // Chat bubble shadows
    chatUser: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 1,
    },
    chatGremly: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1,
    },
  },
  blur: {
    none: 0,
    sm: 10,
    md: 20,
    lg: 40,
  },
} as const;

export const darkTokens = {
  colors: {
    bg: '#0C1110',
    surface: '#121716',
    text: '#F8FAF9',
    subtle: '#9BA4A9',
    // Keep primary consistent across modes (use moss as primary)
    primary: '#2E5540',
    // On-primary color in dark mode (linen/light)
    onPrimary: '#F9F6F1',
    accentMint: '#A5F3C1',
    accentPeri: '#AEB8FF',
    success: '#34C759',
    danger: '#E25555',
    border: '#23302E',
    card: '#161B1A',
    // Provide same short aliases in dark mode where appropriate
    moss: '#2E5540',
    sage: '#BFD8C0',
    periwinkle: '#9CA6E0',
    linen: '#1A3328',
    deep: '#1A3328',
    charcoal: '#F8FAF9',
  },
  spacing: lightTokens.spacing,
  radius: lightTokens.radius,
  typography: lightTokens.typography,
  elevation: lightTokens.elevation,
  blur: lightTokens.blur,
} as const;

// Legacy exports for backward compatibility
export const colors = {
  deepTeal: {
    DEFAULT: '#0A2F2E',
    600: '#0D3B3A',
    700: '#0B3332',
    900: '#072524',
  },
  mint: '#B7F7E1',
  cream: '#FFF9F0',
  periwinkle: '#C9D4FF',
  bg: {
    DEFAULT: '#FFFDF8',
    secondary: '#FFF4E6',
  },
  text: {
    primary: '#1A1A1A',
    secondary: '#4B5563',
    tertiary: '#9CA3AF',
  },
  border: {
    DEFAULT: '#E7E2D9',
    light: '#F3F4F6',
    focus: '#0D3B3A',
  },
  white: '#FFFFFF',
  black: '#000000',
  // Top-level status colors for convenience (mirrors status.* below)
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  gray: '#9CA3AF',
  status: {
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
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
