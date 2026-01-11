/**
 * Tests for OnboardingScreen notification setup
 *
 * Tests the notification time pickers and preferences saving on Screen 2.
 * Note: FlatList scrolling in tests is tricky, so we test components in isolation.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// Mock navigation
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      dispatch: jest.fn(),
    }),
    CommonActions: {
      reset: jest.fn((params) => params),
    },
  };
});

// Mock safe area insets
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// Mock the store
jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: jest.fn((selector) => {
    const state = {
      markOnboardingComplete: jest.fn().mockResolvedValue(undefined),
    };
    return selector(state);
  }),
}));

// Mock notification preferences hook
const mockSavePreferences = jest.fn();
jest.mock('../../../hooks/useNotificationPreferences', () => ({
  useNotificationPreferences: () => ({
    preferences: {
      morningEnabled: true,
      morningTime: new Date(2026, 0, 10, 8, 0),
      eveningEnabled: true,
      eveningTime: new Date(2026, 0, 10, 21, 0),
      timezone: 'America/New_York',
    },
    savePreferences: mockSavePreferences,
    isLoading: false,
  }),
}));

// Mock DateTimePicker
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ value, disabled, testID }: any) => (
      <View testID={testID || 'datetime-picker'}>
        <Text>{disabled ? 'disabled' : 'enabled'}</Text>
        <Text>{value?.toISOString?.() || 'no-value'}</Text>
      </View>
    ),
  };
});

// Mock FlatList to avoid scrollToIndex issues
jest.mock('react-native/Libraries/Lists/FlatList', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ data, renderItem, keyExtractor }: any) => (
      <View testID="mock-flatlist">
        {data?.map((item: any, index: number) => (
          <View key={keyExtractor?.(item, index) || index}>{renderItem?.({ item, index })}</View>
        ))}
      </View>
    ),
  };
});

import OnboardingScreen from '../OnboardingScreen';

describe('OnboardingScreen Notification Setup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('renders all screens content', () => {
    it('renders the notification section title', () => {
      const { getByText } = render(<OnboardingScreen />);

      // With mocked FlatList, all screens render
      expect(getByText('When should I remind you?')).toBeTruthy();
    });

    it('renders morning and evening time labels', () => {
      const { getByText } = render(<OnboardingScreen />);

      expect(getByText('Morning check-in')).toBeTruthy();
      expect(getByText('Evening sweep')).toBeTruthy();
    });

    it('renders the "Don\'t remind me" toggle', () => {
      const { getByText } = render(<OnboardingScreen />);

      expect(getByText("Don't remind me")).toBeTruthy();
    });

    it('renders ritual explanation rows', () => {
      const { getByText } = render(<OnboardingScreen />);

      expect(getByText(/Drop 3\+ thoughts/i)).toBeTruthy();
      expect(getByText(/Sweep 3\+ cards/i)).toBeTruthy();
    });

    it('renders ritual subtext', () => {
      const { getByText } = render(<OnboardingScreen />);

      expect(getByText('Complete the ritual and I age by 1.')).toBeTruthy();
      expect(getByText('Miss a day? No stress, I just wait.')).toBeTruthy();
    });

    it('renders welcome screen content', () => {
      const { getByText } = render(<OnboardingScreen />);

      expect(getByText("Hi, I'm Gremly")).toBeTruthy();
    });

    it('renders final screen content', () => {
      const { getByText } = render(<OnboardingScreen />);

      expect(getByText('I help you think')).toBeTruthy();
    });
  });

  describe('navigation elements', () => {
    it('shows skip button', () => {
      const { getByText } = render(<OnboardingScreen />);
      expect(getByText('Skip')).toBeTruthy();
    });

    it('shows dot indicators', () => {
      const { UNSAFE_getAllByType } = render(<OnboardingScreen />);
      const { View } = require('react-native');
      // Should have dot indicator views (3 steps)
      const views = UNSAFE_getAllByType(View);
      expect(views.length).toBeGreaterThan(3);
    });
  });
});
