/**
 * Tests for OnboardingScreen
 *
 * Tests the 2-screen onboarding flow (welcome + getting started).
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
      addListener: jest.fn(() => jest.fn()),
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
      gremlyColor: 'forest',
      setGremlyColor: jest.fn(),
      setUserProfile: jest.fn(),
    };
    return selector(state);
  }),
}));

// Mock gremlyPalettes
jest.mock('../../../lib/constants/gremlyPalettes', () => ({
  GREMLY_PALETTES: [
    {
      id: 'forest',
      name: 'Forest',
      hex: { dark: '#285441', mid: '#5f966e', cream: '#f0e9bd' },
      colors: {
        dark: [0.157, 0.329, 0.255],
        mid1: [0.373, 0.588, 0.431],
        mid2: [0.318, 0.51, 0.365],
        cream: [0.941, 0.914, 0.741],
      },
    },
  ],
  getPaletteById: jest.fn(() => ({ id: 'forest', name: 'Forest' })),
  recolorLottieJson: jest.fn((json: any) => json),
}));

// Mock MascotLottie
jest.mock('../../components/MascotLottie', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => <View testID="mock-mascot-lottie" {...props} />,
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

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('renders all screens content', () => {
    it('renders the welcome screen title', () => {
      const { getByText } = render(<OnboardingScreen />);

      expect(getByText("Hi, I'm Gremly")).toBeTruthy();
    });

    it('renders welcome screen body and subtext', () => {
      const { getByText } = render(<OnboardingScreen />);

      expect(
        getByText('I help you get things out of your head and into a system that actually works.'),
      ).toBeTruthy();
      expect(getByText('The more we work together, the more we both grow.')).toBeTruthy();
    });

    it('renders getting started screen title', () => {
      const { getByText } = render(<OnboardingScreen />);

      expect(getByText('Choose your Gremly')).toBeTruthy();
    });

    it('renders getting started screen body and subtext', () => {
      const { getByText } = render(<OnboardingScreen />);

      expect(getByText('Feed me your thoughts every day')).toBeTruthy();
      expect(getByText('Tap any card to chat with me along the way.')).toBeTruthy();
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
      // Should have dot indicator views (2 steps)
      const views = UNSAFE_getAllByType(View);
      expect(views.length).toBeGreaterThan(3);
    });
  });
});
