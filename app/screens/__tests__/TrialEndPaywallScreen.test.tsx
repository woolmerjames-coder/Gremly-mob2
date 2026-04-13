/**
 * Tests for TrialEndPaywallScreen
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

jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: (selector: (s: any) => any) =>
    selector({
      fedDaysCount: 5,
      todayDropsCount: 23,
      gremlyAge: 7,
    }),
}));

jest.mock('../../components/MascotLottie', () => {
  const { View } = require('react-native');
  return () => <View testID="mascot-lottie" />;
});

import TrialEndPaywallScreen from '../TrialEndPaywallScreen';

describe('TrialEndPaywallScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the headline', () => {
    const { getByText } = render(<TrialEndPaywallScreen />);
    expect(getByText('Keep the momentum going')).toBeTruthy();
  });

  it('renders the subtitle', () => {
    const { getByText } = render(<TrialEndPaywallScreen />);
    expect(getByText("Your free trial has ended - here's what we built together")).toBeTruthy();
  });

  it('renders stat cards with store values', () => {
    const { getByLabelText } = render(<TrialEndPaywallScreen />);
    expect(getByLabelText('5 days fed')).toBeTruthy();
    expect(getByLabelText('23 thoughts')).toBeTruthy();
    expect(getByLabelText('7 Gremly age')).toBeTruthy();
  });

  it('defaults to annual plan selected', () => {
    const { getByRole } = render(<TrialEndPaywallScreen />);
    // The subscribe button should show annual price by default
    const { getByText } = render(<TrialEndPaywallScreen />);
    expect(getByText('Subscribe - $69.99/year')).toBeTruthy();
  });

  it('switches to monthly plan when monthly card is pressed', () => {
    const { getByText, getAllByText } = render(<TrialEndPaywallScreen />);
    fireEvent.press(getByText('Monthly'));
    expect(getByText('Subscribe - $9.99/month')).toBeTruthy();
  });

  it('renders Save 42% badge', () => {
    const { getByText } = render(<TrialEndPaywallScreen />);
    expect(getByText('Save 42%')).toBeTruthy();
  });

  it('renders reassurance text', () => {
    const { getByText } = render(<TrialEndPaywallScreen />);
    expect(
      getByText('Cancel anytime. Your Gremly and all your data will be waiting if you come back.'),
    ).toBeTruthy();
  });

  it('renders Restore purchase and Not now buttons', () => {
    const { getByText } = render(<TrialEndPaywallScreen />);
    expect(getByText('Restore purchase')).toBeTruthy();
    expect(getByText('Not now')).toBeTruthy();
  });

  it('resets navigation to Tabs when Not now is pressed', () => {
    const { CommonActions } = require('@react-navigation/native');
    const { getByText } = render(<TrialEndPaywallScreen />);
    fireEvent.press(getByText('Not now'));

    expect(CommonActions.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Tabs' }],
    });
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('resets navigation to Tabs when Subscribe is pressed', async () => {
    const { CommonActions } = require('@react-navigation/native');
    const { getByText } = render(<TrialEndPaywallScreen />);
    fireEvent.press(getByText('Subscribe - $69.99/year'));

    await new Promise((r) => setTimeout(r, 0));
    expect(mockDispatch).toHaveBeenCalled();
  });
});
