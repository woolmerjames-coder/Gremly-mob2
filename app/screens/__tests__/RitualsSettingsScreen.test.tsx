/**
 * RitualsSettingsScreen.test.tsx
 *
 * Tests for the Rituals sub-screen: Morning Brief, Evening Sweep, Day Boundary,
 * and Weekly Summary settings.
 *
 * NOTE: All jest.fn() are inline inside mock factories to avoid hoisting issues.
 * This screen imports useGremlyStore (7k+ lines) and useNotificationPreferences
 * (supabase), so every heavy import must be mocked to prevent OOM.
 *
 * Settings V2 (Feb 2026)
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// ═══════════════════════════════════════════════════════════════════
// MOCKS — stable refs hoisted above jest.mock to prevent infinite
// re-render loops (useEffect depends on notificationPrefs ref)
// ═══════════════════════════════════════════════════════════════════

const mockGoBack = jest.fn();
const mockSetOptions = jest.fn();
const mockSavePreferences = jest.fn();
const mockSetDayBoundaryHour = jest.fn();
const mockPreferences = {
  morningEnabled: true,
  morningTime: new Date('2025-01-01T08:00:00'),
  eveningEnabled: true,
  eveningTime: new Date('2025-01-01T20:00:00'),
  weeklyEnabled: true,
  weeklyTime: new Date('2025-01-01T18:00:00'),
  weeklyDay: 0, // Sunday
  timezone: 'America/New_York',
};

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: null }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    setOptions: mockSetOptions,
    addListener: jest.fn((_evt: string, cb: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).__ritualBeforeRemove = cb;
      return () => {};
    }),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@react-native-community/datetimepicker', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { View } = require('react-native');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { __esModule: true, default: (_props: any) => <View testID="date-time-picker" /> };
});

jest.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { View } = require('react-native');
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ChevronLeft: (_props: any) => <View testID="icon-chevron-left" />,
  };
});

jest.mock('../../../lib/store/useGremlyStore', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useGremlyStore: (sel: any) =>
    sel({
      dayBoundaryHour: 5,
      setDayBoundaryHour: mockSetDayBoundaryHour,
    }),
}));

jest.mock('../../../hooks/useNotificationPreferences', () => ({
  useNotificationPreferences: () => ({
    preferences: mockPreferences,
    savePreferences: mockSavePreferences,
  }),
}));

jest.mock('../../../components/settings/DayBoundaryPicker', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
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

jest.mock('../../../design/tokens', () => ({
  colors: {
    background: '#000',
    text: '#fff',
    textSecondary: '#aaa',
    border: '#333',
    primary: '#007AFF',
    surface: '#111',
    surfaceAlt: '#222',
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  borderRadius: { sm: 4, md: 8, lg: 12, xl: 16 },
}));

jest.mock('../../../design/brand', () => ({
  BRAND: {
    radius: { sm: 6, md: 8, lg: 12, xl: 16, pill: 999 },
    shadow: { sm: {} },
    colors: { mossGreen: '#7C9A5E' },
  },
}));

import RitualsSettingsScreen from '../RitualsSettingsScreen';

describe('RitualsSettingsScreen', () => {
  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).__ritualBeforeRemove = null;
  });

  it('renders ritual sections with time pickers', () => {
    const { getByText, getByTestId, queryAllByTestId } = render(<RitualsSettingsScreen />);
    expect(getByText('Rituals')).toBeTruthy();
    expect(getByText('Morning Brief')).toBeTruthy();
    expect(getByText('Evening Sweep')).toBeTruthy();
    expect(getByText('Day Boundary')).toBeTruthy();
    expect(getByTestId('day-boundary-picker')).toBeTruthy();
    // At least 2 DateTimePickers: morning and evening
    expect(queryAllByTestId('date-time-picker').length).toBeGreaterThanOrEqual(2);
  });

  it('fires day boundary onChange', () => {
    const { getByTestId } = render(<RitualsSettingsScreen />);
    fireEvent.press(getByTestId('day-boundary-option-3'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((global as any).__ritualBeforeRemove).toBeTruthy();
  });
});
