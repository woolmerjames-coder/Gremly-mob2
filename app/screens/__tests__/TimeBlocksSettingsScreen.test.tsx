/**
 * TimeBlocksSettingsScreen.test.tsx
 *
 * Tests for the Time Blocks sub-screen wrapper.
 * Verifies title, header hidden, and that it renders the TimeBlockSettingsSection.
 *
 * Settings V2 (Feb 2026)
 */

import React from 'react';
import { render } from '@testing-library/react-native';

// Mock navigation
const mockGoBack = jest.fn();
const mockSetOptions = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    setOptions: mockSetOptions,
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
  };
});

// Track whether TimeBlockSettingsSection was rendered
let timeBlockSectionRendered = false;
jest.mock('../../../components/settings/TimeBlockSettingsSection', () => {
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    TimeBlockSettingsSection: () => {
      timeBlockSectionRendered = true;
      return (
        <View testID="time-block-settings-section">
          <Text>TimeBlockSettingsSection</Text>
        </View>
      );
    },
  };
});

import TimeBlocksSettingsScreen from '../TimeBlocksSettingsScreen';

describe('TimeBlocksSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    timeBlockSectionRendered = false;
  });

  it('renders the Time Blocks title', () => {
    const { getByText } = render(<TimeBlocksSettingsScreen />);
    expect(getByText('Time Blocks')).toBeTruthy();
  });

  it('hides the navigation header', () => {
    render(<TimeBlocksSettingsScreen />);
    expect(mockSetOptions).toHaveBeenCalledWith({ headerShown: false });
  });

  it('renders TimeBlockSettingsSection', () => {
    const { getByTestId } = render(<TimeBlocksSettingsScreen />);
    expect(getByTestId('time-block-settings-section')).toBeTruthy();
    expect(timeBlockSectionRendered).toBe(true);
  });

  it('renders a back button', () => {
    const { getByTestId } = render(<TimeBlocksSettingsScreen />);
    expect(getByTestId('icon-chevron-left')).toBeTruthy();
  });
});
