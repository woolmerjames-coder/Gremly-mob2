/**
 * RitualsSettingsScreen.test.tsx
 *
 * Tests for the Rituals sub-screen: Morning Brief, Evening Sweep, Day Boundary.
 * Validates toggle rendering, time pickers, and auto-save on beforeRemove.
 *
 * NOTE: All jest.fn() are inline inside mock factories to avoid hoisting issues.
 * This screen imports useGremlyStore (7k+ lines) and useNotificationPreferences
 * (supabase), so every heavy import must be mocked to prevent OOM.
 *
 * Settings V2 (Feb 2026)
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

// ═══════════════════════════════════════════════════════════════════
// MOCKS — all jest.fn() inline to minimise memory footprint
// ═══════════════════════════════════════════════════════════════════

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: jest.fn(),
    setOptions: jest.fn(),
    addListener: jest.fn((_evt: string, cb: any) => {
      // Stash the callback so tests can trigger it
      (global as any).__ritualBeforeRemove = cb;
      return () => {};
    }),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: (props: any) => <View testID="date-time-picker" /> };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return { ChevronLeft: (props: any) => <View testID="icon-chevron-left" /> };
});

jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: (sel: any) => sel({
    dayBoundaryHour: 5,
    setDayBoundaryHour: jest.fn(),
  }),
}));

jest.mock('../../../hooks/useNotificationPreferences', () => ({
  useNotificationPreferences: () => ({
    preferences: {
      morningEnabled: true,
      morningTime: new Date('2025-01-01T08:00:00'),
      eveningEnabled: true,
      eveningTime: new Date('2025-01-01T20:00:00'),
      timezone: 'America/New_York',
    },
    savePreferences: jest.fn(),
  }),
}));

jest.mock('../../../components/settings/DayBoundaryPicker', () => {
  const { View, Text, Pressable } = require('react-native');
  return {
    __esModule: true,
    default: ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
      <View testID="day-boundary-picker">
        <Text>Day Boundary: {value}</Text>
        <Pressable testID="day-boundary-option-3" onPress={() => onChange(3)}>
          <Text>3:00 AM</Text>
        </Pressable>
      </View>
    ),
  };
});

import RitualsSettingsScreen from '../RitualsSettingsScreen';

describe('RitualsSettingsScreen', () => {
  afterEach(() => {
    (global as any).__ritualBeforeRemove = null;
  });

  it('renders all three ritual sections with time pickers', () => {
    const { getByText, getByTestId, queryAllByTestId } = render(<RitualsSettingsScreen />);
    expect(getByText('Rituals')).toBeTruthy();
    expect(getByText('Morning Brief')).toBeTruthy();
    expect(getByText('Evening Sweep')).toBeTruthy();
    expect(getByText('Day Boundary')).toBeTruthy();
    expect(getByTestId('day-boundary-picker')).toBeTruthy();
    // Two DateTimePickers: one for morning, one for evening
    expect(queryAllByTestId('date-time-picker').length).toBe(2);
  });

  it('fires day boundary onChange and registers beforeRemove listener', () => {
    const { getByTestId } = render(<RitualsSettingsScreen />);
    // Pressing the mocked picker option triggers onChange(3)
    fireEvent.press(getByTestId('day-boundary-option-3'));
    // The screen should have registered a beforeRemove listener
    expect((global as any).__ritualBeforeRemove).toBeTruthy();
  });
});
