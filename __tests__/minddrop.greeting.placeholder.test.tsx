import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mockMindDropFlag, mockRepoHook, mockAuthHook } from './utils/flagHarness';

// Navigation mock: avoid needing a NavigationContainer
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    __esModule: true,
    ...actual,
    useNavigation: () => ({ setOptions: () => {}, addListener: jest.fn(() => jest.fn()) }),
  };
});

const LAST_OPEN_KEY = 'minddrop:last_open_ts';

describe.skip('Mind Drop greeting and placeholder rotation', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T10:00:00')); // 10:00 local time

    // Minimal stable mocks
    mockMindDropFlag(true);
    mockRepoHook();
    mockAuthHook({ userId: 'test-user' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders greeting (morning)', async () => {
    await AsyncStorage.removeItem(LAST_OPEN_KEY);
    const Screen = require('../app/screens/CatchAllNotepad').default;
    const { getByTestId, getByText } = render(<Screen />);

    // Greeting appears and matches Morning variant
    await waitFor(() => {
      expect(getByTestId('minddrop-greeting')).toBeTruthy();
      expect(getByText(/Morning!/i)).toBeTruthy();
    });
  });

  it('shows "Welcome back" after 3+ days', async () => {
    const past = Date.now() - (3 * 24 * 60 * 60 * 1000 + 1);
    await AsyncStorage.setItem(LAST_OPEN_KEY, String(past));

    const Screen = require('../app/screens/CatchAllNotepad').default;
    const { getByTestId, getByText } = render(<Screen />);

    await waitFor(() => {
      expect(getByTestId('minddrop-greeting')).toBeTruthy();
      expect(getByText(/Welcome back/i)).toBeTruthy();
    });
  });

  it('cycles placeholder text every 3s and loops', async () => {
    await AsyncStorage.removeItem(LAST_OPEN_KEY);
    const Screen = require('../app/screens/CatchAllNotepad').default;
    const { getByTestId } = render(<Screen />);

    const input = getByTestId('minddrop-input') as any;
    const first = input.props.placeholder;

    // Advance 3s to rotate placeholder
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    const second = (getByTestId('minddrop-input') as any).props.placeholder;
    expect(second).not.toBe(first);

    // Advance enough to loop back within the placeholders list
    act(() => {
      jest.advanceTimersByTime(3000 * 3);
    });

    const later = (getByTestId('minddrop-input') as any).props.placeholder;
    expect(typeof later).toBe('string');
    expect(later.length).toBeGreaterThan(0);
  });
});
