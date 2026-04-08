/**
 * Tests for DevTools paywall button
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: Object.assign(
    (selector: (s: any) => any) =>
      selector({
        gremlyAge: 3,
        todayDropsCount: 5,
        todaySweepsCount: 1,
      }),
    { setState: jest.fn(), getState: jest.fn() },
  ),
}));

jest.mock('../../features/celebration/CelebrationController', () => ({
  __esModule: true,
  default: { showAgeUpCelebration: jest.fn() },
}));

jest.mock('../../../theme/tokens', () => ({
  colors: { textPrimary: '#000', textSecondary: '#666', bgPrimary: '#fff', surface: '#f0f0f0' },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
  radii: { sm: 4, md: 8 },
}));

jest.mock('../../../design-system/Button', () => {
  const { Pressable, Text } = require('react-native');
  return {
    Button: ({ label, onPress, testID }: any) => (
      <Pressable onPress={onPress} testID={testID} accessibilityRole="button">
        <Text>{label}</Text>
      </Pressable>
    ),
  };
});

import DevTools from '../../(dev)/DevTools';

describe('DevTools', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the Show Paywall button', () => {
    const { getByTestId } = render(<DevTools />);
    expect(getByTestId('show-paywall-button')).toBeTruthy();
  });

  it('navigates to TrialEndPaywall when Show Paywall is pressed', () => {
    const { getByTestId } = render(<DevTools />);
    fireEvent.press(getByTestId('show-paywall-button'));
    expect(mockNavigate).toHaveBeenCalledWith('TrialEndPaywall');
  });
});
