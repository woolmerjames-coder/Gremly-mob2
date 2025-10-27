export const colors = {
  light: {
    bg: '#F9F6F1', // Linen Cream
    text: '#222222', // Charcoal Ink
    moss: '#2E5540', // Primary
    sage: '#BFD8C0', // Secondary
    sageTint: '#F0F4F3', // Input background
    pear: '#E0C47A', // Highlight
    periwinkle: '#9CA6E0', // Accent (sparingly)
    mutedText: '#6A7D76',
    danger: '#9E3B3B',
    cardShadow: 'rgba(0,0,0,0.05)',
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
  },
} as const;
