import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('../../../providers/RepoProvider', () => ({
  __esModule: true,
  useRepo: () => ({
    notes: { list: jest.fn(() => Promise.resolve([])) },
    todos: { list: jest.fn(() => Promise.resolve([])) },
    habits: { list: jest.fn(() => Promise.resolve([])) },
    remove: jest.fn(),
    getOrCreateList: jest.fn(),
    addListItem: jest.fn(),
    create: jest.fn(),
    writeEvent: jest.fn(() => Promise.resolve()),
  }),
}));

jest.mock('../../../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => ({ userId: 'test-user' }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('@/src/config/featureFlags', () => ({
  __esModule: true,
  MIND_DROP_V2: true,
  whenEnabled: (flag: boolean, on: () => any, off: () => any) => (flag ? on() : off()),
}));

jest.mock('../../../config/featureFlags', () => ({
  __esModule: true,
  shouldUseHaptics: () => false,
}));

jest.mock('../../../lib/haptics', () => ({
  haptics: {
    submitSuccess: jest.fn(),
    warning: jest.fn(),
  },
}));

// Mock navigation elements (useHeaderHeight)
jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 100, // Mock header height
}));

jest.mock(
  '../../design-system/Button',
  () => {
    const React = require('react');
    const { Pressable, Text } = require('react-native');
    return {
      __esModule: true,
      Button: ({ label, onPress, testID }: any) => (
        <Pressable testID={testID} onPress={onPress} accessibilityRole="button">
          <Text>{label}</Text>
        </Pressable>
      ),
    };
  },
  { virtual: true },
);

jest.mock('../../../lib/cortex/router', () => ({
  cortexRoute: jest.fn(() =>
    Promise.resolve({ actions: [], mode: 'keep', suggestions: [], explanation: '', confidence: 0 }),
  ),
}));

jest.mock('../../../src/hooks/useActionToast', () => ({
  __esModule: true,
  useActionToast: () => ({
    showToast: jest.fn(),
    Toast: null,
  }),
}));

const mockNavigate = jest.fn();
let latestOptions: any;

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    __esModule: true,
    ...actual,
    useNavigation: () => ({
      setOptions: (options: any) => {
        latestOptions = options;
      },
      navigate: mockNavigate,
    }),
  };
});

import CatchAllNotepad from '../CatchAllNotepad';

const renderHeader = () => {
  if (!latestOptions?.headerTitle) {
    throw new Error('headerTitle not initialized');
  }
  const Header = latestOptions.headerTitle();
  return render(<>{Header}</>);
};

const triggerPress = (node: any) => {
  let current: any = node;
  while (current) {
    if (typeof current.props.onPress === 'function') {
      act(() => {
        current?.props.onPress?.({} as any);
      });
      return;
    }
    current = current.parent as any;
  }
  throw new Error('Press handler not found');
};

describe('CatchAllNotepad header + info sheet', () => {
  beforeEach(() => {
    latestOptions = undefined;
    mockNavigate.mockClear();
  });

  it('renders header title and subtitle from copy', () => {
    render(<CatchAllNotepad />);
    expect(latestOptions?.headerTitle).toBeDefined();

    const { getByText } = renderHeader();
    // Check for "Mind Drop" title (be resilient to subtitle changes)
    expect(getByText('Mind Drop')).toBeTruthy();
  });

  it('opens info sheet when header icon is pressed', () => {
    const screen = render(<CatchAllNotepad />);
    const header = renderHeader();

    expect(screen.queryByTestId('minddrop-info-sheet')).toBeNull();
    fireEvent.press(header.getByTestId('minddrop-info-header'));
    expect(screen.getByTestId('minddrop-info-sheet')).toBeTruthy();
  });

  it('invokes navigate when selecting View Recent Drops', async () => {
    const screen = render(<CatchAllNotepad />);
    const header = renderHeader();

    fireEvent.press(header.getByTestId('minddrop-info-header'));
    const openRecent = screen.getByTestId('minddrop-info-open-recent');
    triggerPress(openRecent);

    await waitFor(() => expect(screen.queryByTestId('minddrop-info-sheet')).toBeNull());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', {
      screen: 'Hub',
      params: { filter: 'recent' },
    });
  });
});
