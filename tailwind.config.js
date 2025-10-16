/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('nativewind/preset')],
  content: [
    './App.{js,jsx,ts,tsx}',
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
  ],
  safelist: [
    'opacity-40',
    'h-14',
    'h-12',
    'h-10',
    'w-9',
    'h-9',
    'min-h-[120px]',
    'bg-deepTeal',
    'bg-cream',
    'bg-mint',
    'bg-periwinkle',
    'text-deepTeal-900',
    // ensure commonly used tokens are kept even if dynamically composed
    'bg-bg',
    'bg-bg-100',
    'text-text-primary',
    'border-border',
  ],
  theme: {
    extend: {
      colors: {
        deepTeal: { DEFAULT: '#0D3B3A', 600: '#0F4C4B', 700: '#0B3332', 900: '#072524' },
        mint: '#B7F7E1',
        cream: '#FFF7EA',
        periwinkle: '#C9D4FF',
        // App design tokens
        bg: { DEFAULT: '#FFF7EA', 100: '#FFF1E5' },
        text: { primary: '#1A1A1A' },
        border: '#E5E5E5',
      },
      borderRadius: { '2xl': 24 },
    },
  },
  plugins: [],
};
