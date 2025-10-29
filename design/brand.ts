export const BRAND = {
  colors: {
    linenCream: '#F9F6F1', // Background
    charcoalInk: '#222222', // Primary text
    mossGreen: '#2E5540', // Accent / action
    goldenPear: '#E0C47A', // Highlight / sweep banner
  },
  radius: {
    xl: 24, // radius-xl
  },
  elevation: {
    one: {
      // subtle elevation ~1dp
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 1,
    },
  },
} as const;

export type Brand = typeof BRAND;
