import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import * as RN from 'react-native';

// Feature flag ON to render the screen path
jest.mock('@/src/config/featureFlags', () => ({ MIND_DROP_V2: true }));

// Minimal provider mocks
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({ userId: 'user-theme' }),
}));

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: jest.fn(),
    remove: jest.fn(),
    writeEvent: jest.fn(),
    notes: { list: jest.fn() },
  }),
}));

// Mock navigation to avoid requiring a NavigationContainer
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    __esModule: true,
    ...actual,
    useNavigation: () => ({ setOptions: jest.fn() }),
  };
});

import CatchAllNotepad, { makeStyles } from '../app/screens/CatchAllNotepad';
import { colors } from '../src/theme/tokens';

describe('Theme refactor smoke tests', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });
  afterEach(() => {
    try {
      // Drain any pending timers created by intervals inside the screen
      jest.runOnlyPendingTimers();
    } catch (e) {
      /* no-op: no pending timers */
    }
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('Dark/light mode renders without crash', () => {
    const spyScheme = jest.spyOn(RN, 'useColorScheme');
    // Render with dark first and unmount to clear intervals
    spyScheme.mockReturnValue('dark' as any);
    const { unmount } = render(<CatchAllNotepad />);
    expect(screen.getByTestId('minddrop-screen')).toBeTruthy();
    unmount();
    // Then light
    spyScheme.mockReturnValue('light' as any);
    const { unmount: unmount2 } = render(<CatchAllNotepad />);
    expect(screen.getByTestId('minddrop-screen')).toBeTruthy();
    unmount2();
  });

  test('makeStyles returns proper color sets', () => {
    const sLight = makeStyles(colors.light as any, 'light');
    // input text color should match token text
    // Access RN style object snapshot for input
    const inputStyle: any = (sLight as any).input;
    expect(inputStyle.color).toBe(colors.light.text);
  });

  test('Focus state applies themed border color', () => {
    const spyScheme = jest.spyOn(RN, 'useColorScheme');
    spyScheme.mockReturnValue('light' as any);

    const { getByTestId, unmount } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const container = getByTestId('minddrop-input-container');

    // Initially not focused: no borderColor from focused style
    const baseStyleArr = Array.isArray(container.props.style)
      ? container.props.style
      : [container.props.style];
    const hasBorderPre = baseStyleArr.some((s: any) => s && s.borderColor);
    expect(hasBorderPre).toBe(false);

    // Focus
    fireEvent(input, 'focus');

    const focusedStyleArr = Array.isArray(container.props.style)
      ? container.props.style
      : [container.props.style];
    const focusedBorder = focusedStyleArr.find((s: any) => s && s.borderColor)?.borderColor;
    expect(focusedBorder).toBe(colors.light.sage);
    unmount();
  });
});
