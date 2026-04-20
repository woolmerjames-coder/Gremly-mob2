/**
 * SettingsScreen.test.tsx
 *
 * Tests for the Settings V2 menu-list screen.
 * Validates 4-row layout and navigation to sub-screens.
 *
 * Settings V2 (Feb 2026) - Rewritten to match menu-list refactor.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Mock navigation
const mockGoBack = jest.fn();
const mockSetOptions = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    setOptions: mockSetOptions,
    navigate: mockNavigate,
    addListener: jest.fn(() => jest.fn()),
  }),
}));

// Mock safe area context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock lucide icons
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return {
    ChevronLeft: (props: any) => <View testID="icon-chevron-left" {...props} />,
    ChevronRight: (props: any) => <View testID="icon-chevron-right" {...props} />,
    Bell: (props: any) => <View testID="icon-bell" {...props} />,
    Clock: (props: any) => <View testID="icon-clock" {...props} />,
    CalendarDays: (props: any) => <View testID="icon-calendar" {...props} />,
    Brain: (props: any) => <View testID="icon-brain" {...props} />,
    Palette: (props: any) => <View testID="icon-palette" {...props} />,
    Crown: (props: any) => <View testID="icon-crown" {...props} />,
  };
});

// Mock gremlyPalettes
jest.mock('../../../lib/constants/gremlyPalettes', () => ({
  GREMLY_PALETTES: [
    { id: 'forest', name: 'Forest', hex: { dark: '#285441', mid: '#5f966e', cream: '#f0e9bd' } },
  ],
  getPaletteById: jest.fn(() => ({ id: 'forest', name: 'Forest' })),
}));

// Mock useGremlyStore
jest.mock('../../../lib/store/useGremlyStore', () => {
  const mockStore = (selector: (state: any) => any) => {
    const state = {
      gremlyColor: 'forest',
      setGremlyColor: jest.fn(),
      weeklySummaries: [],
      isSubscribed: false,
      setIsSubscribed: jest.fn(),
    };
    return selector(state);
  };
  mockStore.getState = () => ({ weeklySummaries: [] });
  return { useGremlyStore: mockStore };
});

// Mock subscription status
jest.mock('../../../lib/subscriptions/useSubscriptionStatus', () => ({
  useSubscriptionStatus: () => ({
    isSubscribed: false,
    isTrialActive: true,
    isLoading: false,
    refresh: jest.fn(),
  }),
}));

// Mock weekly summary + selectors
jest.mock('../../../lib/weeklySummary', () => ({ generateWeeklySummary: jest.fn() }));
jest.mock('../../../lib/store/selectors', () => ({ useCurrentWeekSummary: () => null }));

import SettingsScreen from '../SettingsScreen';

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Rendering
  // ─────────────────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the Settings title', () => {
      const { getByText } = render(<SettingsScreen />);
      expect(getByText('Settings')).toBeTruthy();
    });

    it('renders all 6 menu rows', () => {
      const { getByText } = render(<SettingsScreen />);
      expect(getByText('Gremly Premium')).toBeTruthy();
      expect(getByText('Rituals')).toBeTruthy();
      expect(getByText('Time Blocks')).toBeTruthy();
      expect(getByText('Calendar Connections')).toBeTruthy();
      expect(getByText('What Gremly Knows')).toBeTruthy();
      expect(getByText('Gremly color')).toBeTruthy();
    });

    it('renders subtitles for each row', () => {
      const { getByText } = render(<SettingsScreen />);
      expect(getByText('7-day Training Challenge active')).toBeTruthy();
      expect(getByText('Morning Brief, Evening Sweep, Day Boundary')).toBeTruthy();
      expect(getByText('Morning, Afternoon, Evening ranges')).toBeTruthy();
      expect(getByText('Outlook, Google, Calendar links')).toBeTruthy();
      expect(getByText('View and edit what Gremly has learned about you')).toBeTruthy();
    });

    it('hides the navigation header', () => {
      render(<SettingsScreen />);
      expect(mockSetOptions).toHaveBeenCalledWith({ headerShown: false });
    });

    it('does NOT render old inline settings controls', () => {
      const { queryByTestId, queryByText } = render(<SettingsScreen />);
      // These no longer live on the main Settings screen
      expect(queryByTestId('day-boundary-picker')).toBeNull();
      expect(queryByTestId('date-time-picker')).toBeNull();
      expect(queryByText('Save')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Navigation
  // ─────────────────────────────────────────────────────────────────────────

  describe('navigation', () => {
    it('navigates to RitualsSettings when Rituals row is pressed', () => {
      const { getByText } = render(<SettingsScreen />);
      fireEvent.press(getByText('Rituals'));
      expect(mockNavigate).toHaveBeenCalledWith('RitualsSettings');
    });

    it('navigates to TimeBlocksSettings when Time Blocks row is pressed', () => {
      const { getByText } = render(<SettingsScreen />);
      fireEvent.press(getByText('Time Blocks'));
      expect(mockNavigate).toHaveBeenCalledWith('TimeBlocksSettings');
    });

    it('navigates to CalendarSettings when Calendar row is pressed', () => {
      const { getByText } = render(<SettingsScreen />);
      fireEvent.press(getByText('Calendar Connections'));
      expect(mockNavigate).toHaveBeenCalledWith('CalendarSettings');
    });

    it('navigates to WhatGremlyKnows when What Gremly Knows row is pressed', () => {
      const { getByText } = render(<SettingsScreen />);
      fireEvent.press(getByText('What Gremly Knows'));
      expect(mockNavigate).toHaveBeenCalledWith('WhatGremlyKnows');
    });
  });
});
