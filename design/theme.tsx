/**
 * Theme Context - Gremly Design System
 * Provides light/dark theme support via React Context
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { colors as lightColors } from './tokens';

export type ThemeMode = 'light' | 'dark';

// Dark theme colors (can be expanded)
const darkColors = {
  deepTeal: lightColors.deepTeal,
  mint: lightColors.mint,
  cream: lightColors.cream,
  periwinkle: lightColors.periwinkle,
  bg: {
    DEFAULT: '#1A1A1A',
    secondary: '#2A2A2A',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#D1D5DB',
    tertiary: '#9CA3AF',
  },
  border: {
    DEFAULT: '#374151',
    focus: '#B7F7E1', // mint for dark mode
  },
  white: lightColors.white,
  black: lightColors.black,
  // Map to existing keys on tokens (keep shape identical to lightColors)
  error: lightColors.status.error,
  success: lightColors.status.success,
  warning: lightColors.status.warning,
  gray: lightColors.text.tertiary,
  status: lightColors.status,
} as const;

export type ThemeColors = typeof lightColors | typeof darkColors;

export interface Theme {
  mode: ThemeMode;
  colors: typeof lightColors | typeof darkColors;
}

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  initialMode?: ThemeMode;
}

export function ThemeProvider({ children, initialMode = 'light' }: ThemeProviderProps) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  const theme: Theme = {
    mode,
    colors: mode === 'light' ? lightColors : darkColors,
  };

  const toggleTheme = () => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const setTheme = (newMode: ThemeMode) => {
    setMode(newMode);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
