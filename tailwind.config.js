/** @type {import('tailwindcss').Config} */
module.exports = {
  // NativeWind v2 - no preset, uses direct content glob matching
  content: [
    './App.{js,jsx,ts,tsx}',
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './design-system/**/*.{js,jsx,ts,tsx}',
    './providers/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0F4C5C', // Deep Teal
          50: '#E6F2F4',
          100: '#CCE5E9',
          200: '#99CBD3',
          300: '#66B1BD',
          400: '#3397A7',
          500: '#0F4C5C', // Main
          600: '#0C3D4A',
          700: '#092E37',
          800: '#061F25',
          900: '#030F12',
        },
        accent: {
          DEFAULT: '#86E5C2', // Mint
          50: '#F0FBF7',
          100: '#E1F7EF',
          200: '#C3EFDF',
          300: '#A5E7CF',
          400: '#86E5C2', // Main
          500: '#68D4AC',
          600: '#4AAA89',
          700: '#387F67',
          800: '#255544',
          900: '#132A22',
        },
        bg: {
          DEFAULT: '#FFF7EA', // Cream
          50: '#FFFDFB',
          100: '#FFF7EA', // Main
          200: '#FFEFD5',
          300: '#FFE7C0',
          400: '#FFDFAB',
          500: '#FFD796',
        },
        alt: {
          DEFAULT: '#A7B7FF', // Periwinkle
          50: '#F5F7FF',
          100: '#EBEFFF',
          200: '#D7DFFF',
          300: '#C3CFFF',
          400: '#AFBFFF',
          500: '#A7B7FF', // Main
          600: '#7F92FF',
          700: '#576DCC',
          800: '#3F5099',
          900: '#273266',
        },
        text: {
          primary: '#1A1A1A',
          secondary: '#4B5563',
          muted: '#6B7280',
          disabled: '#9CA3AF',
        },
        border: {
          DEFAULT: '#E5E7EB',
          subtle: '#F3F4F6',
          strong: '#D1D5DB',
        },
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '24px',
        full: '9999px',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        '2xl': '48px',
      },
      fontSize: {
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['14px', { lineHeight: '20px' }],
        base: ['16px', { lineHeight: '24px' }],
        lg: ['18px', { lineHeight: '28px' }],
        xl: ['20px', { lineHeight: '30px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '36px' }],
      },
      fontWeight: {
        regular: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.06)',
        md: '0 6px 20px rgba(0,0,0,0.08)',
        lg: '0 10px 40px rgba(0,0,0,0.12)',
      },
      transitionDuration: {
        fast: '150ms',
        normal: '250ms',
        slow: '400ms',
      },
    },
  },
  plugins: [],
  darkMode: 'media',
};
