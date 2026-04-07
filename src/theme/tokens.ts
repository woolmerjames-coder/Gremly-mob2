export const colors = {
  light: {
    bg: '#F9F6F1', // Linen Cream
    text: '#222222', // Charcoal Ink
    moss: '#2E5540', // Primary
    sage: '#BFD8C0', // Secondary
    sageTint: '#F0F4F3', // Input background
    pear: '#E0C47A', // Highlight
    periwinkle: '#9CA6E0', // Accent (sparingly)
    mutedText: '#5E706A',
    danger: '#9E3B3B',
    cardShadow: 'rgba(0,0,0,0.05)',
    // Phase 1: Mind Drop refresh tokens
    linenCream: '#F9F6F1',
    mossGreen: '#2E5540',
    sageMist: '#BFD8C0',
    goldenPear: '#E0C47A',
    goldenPearStrong: '#C4A85C', // Darkened ~12% for text contrast
    charcoalInk: '#222222',
    mutedSageText: '#657565',
  },
  dark: {
    bg: '#1A3328', // Deep Forest
    text: '#F9F6F1', // Light text
    moss: '#BFD8C0', // Use Sage for contrast accents
    sage: '#2E5540', // Swap roles a bit
    sageTint: '#223A30', // Dark tinted panel
    pear: '#E0C47A',
    periwinkle: '#9CA6E0',
    mutedText: '#C8D3CE',
    danger: '#E07A7A',
    cardShadow: 'rgba(0,0,0,0.35)',
    // Phase 1: Mind Drop refresh tokens (dark mode)
    linenCream: '#F9F6F1',
    mossGreen: '#BFD8C0', // Lighter in dark mode
    sageMist: '#2E5540',
    goldenPear: '#E0C47A',
    goldenPearStrong: '#C4A85C', // Same strong variant for dark mode
    charcoalInk: '#F9F6F1', // Light text in dark mode
    mutedSageText: '#C8D3CE',
  },
} as const;

// Motion timing tokens
export const motion = {
  fadeMs: 240,
  pulseMs: 2000,
  chipPulseMs: 400,
} as const;
