/**
 * Tests for TrialEndPaywallScreen
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockDispatch = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ dispatch: mockDispatch, goBack: mockGoBack, canGoBack: () => true }),
  useRoute: () => ({ params: { source: 'expiry' } }),
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
      trialStartedAt: null,
      isSubscribed: false,
      setIsSubscribed: jest.fn(),
    }),
}));

jest.mock('../../../lib/subscriptions/useSubscriptionStatus', () => ({
  useSubscriptionStatus: () => ({
    isSubscribed: false,
    isTrialActive: false,
    isExpired: true,
    isLoading: false,
    refresh: jest.fn(),
  }),
}));

jest.mock('../../../lib/subscriptions/purchases', () => ({
  fetchOfferings: jest.fn(),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
}));

jest.mock('../../components/MascotLottie', () => {
  const { View } = require('react-native');
  return () => <View testID="mascot-lottie" />;
});

import TrialEndPaywallScreen from '../TrialEndPaywallScreen';
import {
  fetchOfferings,
  purchasePackage,
  restorePurchases,
} from '../../../lib/subscriptions/purchases';

describe('TrialEndPaywallScreen', () => {
  beforeEach(() => {
    (fetchOfferings as jest.Mock).mockResolvedValue({ current: null });
    (purchasePackage as jest.Mock).mockResolvedValue({ success: false, cancelled: true });
    (restorePurchases as jest.Mock).mockResolvedValue({ success: false });
  });

  it('renders the headline', () => {
    const { getByText } = render(<TrialEndPaywallScreen />);
    expect(getByText('Keep the momentum going')).toBeTruthy();
  });

  it('renders the subtitle', () => {
    const { getByText } = render(<TrialEndPaywallScreen />);
    expect(getByText("Your free trial has ended. Here's what we built together.")).toBeTruthy();
  });

  it('renders stat cards with store values', () => {
    const { getByLabelText } = render(<TrialEndPaywallScreen />);
    expect(getByLabelText('5 days fed')).toBeTruthy();
    expect(getByLabelText('23 thoughts')).toBeTruthy();
    expect(getByLabelText('Gremly age 7')).toBeTruthy();
  });

  it('defaults to annual plan selected', () => {
    const { getByText } = render(<TrialEndPaywallScreen />);
    expect(getByText('Subscribe for $69.99 per year')).toBeTruthy();
  });

  it('switches to monthly plan when monthly card is pressed', () => {
    const { getByText, getAllByText } = render(<TrialEndPaywallScreen />);
    fireEvent.press(getByText('Monthly'));
    expect(getByText('Subscribe for $9.99 per month')).toBeTruthy();
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

  it('renders Restore purchase button', () => {
    const { getByText } = render(<TrialEndPaywallScreen />);
    expect(getByText('Restore purchase')).toBeTruthy();
  });

  it('navigates back when Not now is pressed (mid-trial)', () => {
    // Override route to mid-trial source
    const useRoute = require('@react-navigation/native').useRoute;
    const original = useRoute;
    require('@react-navigation/native').useRoute = () => ({ params: { source: 'settings' } });
    // Also override subscription status to show mid-trial
    const { useSubscriptionStatus } = require('../../../lib/subscriptions/useSubscriptionStatus');
    const origSub = useSubscriptionStatus;
    require('../../../lib/subscriptions/useSubscriptionStatus').useSubscriptionStatus = () => ({
      isSubscribed: false,
      isTrialActive: true,
      isExpired: false,
      isLoading: false,
      refresh: jest.fn(),
    });

    const { getByText } = render(<TrialEndPaywallScreen />);
    fireEvent.press(getByText('Not now'));
    expect(mockGoBack).toHaveBeenCalled();

    // Restore
    require('@react-navigation/native').useRoute = original;
    require('../../../lib/subscriptions/useSubscriptionStatus').useSubscriptionStatus = origSub;
  });

  it('resets navigation to Tabs when Subscribe is pressed', async () => {
    const annualPkg = { product: { identifier: 'com.gremly.mob2.annual' } };
    (fetchOfferings as jest.Mock).mockResolvedValue({
      current: { availablePackages: [annualPkg] },
    });
    (purchasePackage as jest.Mock).mockResolvedValue({ success: true });

    const { CommonActions } = require('@react-navigation/native');
    const { getByText, findByText } = render(<TrialEndPaywallScreen />);

    // Wait for offerings useEffect to resolve and re-render
    await findByText('Subscribe for $69.99 per year');
    fireEvent.press(getByText('Subscribe for $69.99 per year'));

    // Wait for async purchase
    await new Promise((r) => setTimeout(r, 50));
    expect(purchasePackage).toHaveBeenCalledWith(annualPkg);
    expect(mockDispatch).toHaveBeenCalled();
  });
});
