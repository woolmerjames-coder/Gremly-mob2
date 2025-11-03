// Brand tokens — Harmonic Cortex v4.2
export const BRAND = {
  colors: {
    // Core palette
    mossGreen: '#2E5540', // Primary
    sageMist: '#BFD8C0', // Secondary
    periwinkleSmoke: '#9CA6E0', // Accent (sparingly)
    goldenPear: '#E0C47A', // Highlight / Success
    linenCream: '#F9F6F1', // Background (Light)
    deepForest: '#1A3328', // Background (Dark)
    charcoalInk: '#222222', // Text (Light)

    // Neutrals / utilities
    inkSubtle: 'rgba(34, 34, 34, 0.7)',
    inkMuted: 'rgba(34, 34, 34, 0.55)',
    surface: '#FFFFFF',
    borderSubtle: 'rgba(0,0,0,0.08)',
  },

  radius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 18,
    '2xl': 24,
    pill: 999,
  },

  elevation: {
    one: {
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    two: {
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
  },

  typography: {
    header: { fontFamily: 'PlusJakartaSans-Bold' },
    subhead: { fontFamily: 'PlusJakartaSans-SemiBold' },
    body: { fontFamily: 'Inter-Regular' },
    bodyMedium: { fontFamily: 'Inter-Medium' },
    italic: { fontFamily: 'Inter-Italic' },
  },
} as const;

export type Brand = typeof BRAND;
