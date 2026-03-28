/**
 * CalendarSettingsScreen.test.tsx
 *
 * Tests for the Calendar Connections sub-screen wrapper.
 * Verifies title, header hidden, and that it renders CalendarConnectionsCard.
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

// Track whether CalendarConnectionsCard was rendered
let calendarCardRendered = false;
jest.mock('../../../components/settings/CalendarConnectionsCard', () => {
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: () => {
      calendarCardRendered = true;
      return (
        <View testID="calendar-connections-card">
          <Text>CalendarConnectionsCard</Text>
        </View>
      );
    },
  };
});

import CalendarSettingsScreen from '../CalendarSettingsScreen';

describe('CalendarSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    calendarCardRendered = false;
  });

  it('renders the Calendar Connections title', () => {
    const { getByText } = render(<CalendarSettingsScreen />);
    expect(getByText('Calendar Connections')).toBeTruthy();
  });

  it('hides the navigation header', () => {
    render(<CalendarSettingsScreen />);
    expect(mockSetOptions).toHaveBeenCalledWith({ headerShown: false });
  });

  it('renders CalendarConnectionsCard', () => {
    const { getByTestId } = render(<CalendarSettingsScreen />);
    expect(getByTestId('calendar-connections-card')).toBeTruthy();
    expect(calendarCardRendered).toBe(true);
  });

  it('renders a back button', () => {
    const { getByTestId } = render(<CalendarSettingsScreen />);
    expect(getByTestId('icon-chevron-left')).toBeTruthy();
  });
});
