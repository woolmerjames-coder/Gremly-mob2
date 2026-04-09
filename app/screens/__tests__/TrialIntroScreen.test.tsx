/**
 * Tests for TrialIntroScreen
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockDispatch = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ dispatch: mockDispatch }),
  CommonActions: { reset: jest.fn((params) => params) },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

const mockMarkOnboardingComplete = jest.fn().mockResolvedValue(undefined);
const mockStartTraining = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: (selector: (s: any) => any) =>
    selector({
      markOnboardingComplete: mockMarkOnboardingComplete,
      startTraining: mockStartTraining,
    }),
}));

jest.mock('../../components/MascotLottie', () => {
  const { View } = require('react-native');
  return () => <View testID="mascot-lottie" />;
});

jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: View,
    Path: View,
    Rect: View,
    Line: View,
  };
});

import TrialIntroScreen from '../TrialIntroScreen';

describe('TrialIntroScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the challenge title', () => {
    const { getByText } = render(<TrialIntroScreen />);
    expect(getByText('The 7-day Gremly challenge')).toBeTruthy();
  });

  it('renders the subtitle', () => {
    const { getByText } = render(<TrialIntroScreen />);
    expect(getByText('Feed your Gremly 7 days in a row')).toBeTruthy();
  });

  it('renders the trial note', () => {
    const { getByText } = render(<TrialIntroScreen />);
    expect(getByText('Your free trial — no card needed')).toBeTruthy();
  });

  it('renders all 3 feature rows', () => {
    const { getByText } = render(<TrialIntroScreen />);
    expect(getByText('Clear your head')).toBeTruthy();
    expect(getByText('Stay on top of what matters')).toBeTruthy();
    expect(getByText('Get a weekly summary of your life')).toBeTruthy();
  });

  it('renders the CTA button', () => {
    const { getByText } = render(<TrialIntroScreen />);
    expect(getByText("Let's do this")).toBeTruthy();
  });

  it('calls markOnboardingComplete and startTraining on CTA press', async () => {
    const { getByText } = render(<TrialIntroScreen />);
    fireEvent.press(getByText("Let's do this"));

    await new Promise((r) => setTimeout(r, 0)); // flush promises
    expect(mockMarkOnboardingComplete).toHaveBeenCalled();
    expect(mockStartTraining).toHaveBeenCalled();
  });

  it('resets navigation to Tabs on CTA press', async () => {
    const { CommonActions } = require('@react-navigation/native');
    const { getByText } = render(<TrialIntroScreen />);
    fireEvent.press(getByText("Let's do this"));

    await new Promise((r) => setTimeout(r, 0));
    expect(CommonActions.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Tabs' }],
    });
    expect(mockDispatch).toHaveBeenCalled();
  });
});
