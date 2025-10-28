import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as RN from 'react-native';

// Feature flag ON
jest.mock('@/src/config/featureFlags', () => ({ MIND_DROP_V2: true }));

// Mock navigation
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    __esModule: true,
    ...actual,
    useNavigation: () => ({
      setOptions: jest.fn(),
      navigate: mockNavigate,
      canGoBack: () => true,
      goBack: jest.fn(),
    }),
  };
});

// Mock navigation elements (useHeaderHeight)
jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 100, // Mock header height
}));

// Mock Auth
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({ userId: 'user-polish' }),
}));

// Repo mock (overridable per-test)
const mockCreate = jest.fn();
const mockRemove = jest.fn();
const mockWriteEvent = jest.fn();
const mockNotesList = jest.fn();

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: mockCreate,
    remove: mockRemove,
    writeEvent: mockWriteEvent,
    notes: { list: mockNotesList },
  }),
}));

// Component under test
import CatchAllNotepad from '../app/screens/CatchAllNotepad';

beforeEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('Mind Drop P10 Polish', () => {
  test('Reduced motion disables placeholder animation (smoke)', async () => {
    jest.useFakeTimers();

    // Mock reduced motion enabled
    jest
      .spyOn(RN.AccessibilityInfo, 'isReduceMotionEnabled')
      .mockImplementation(() => Promise.resolve(true));

    render(<CatchAllNotepad />);

    // Advance timers enough to rotate placeholder a couple times; with reduced motion,
    // animation code paths are skipped, so we just ensure no exceptions are thrown.
    act(() => {
      jest.advanceTimersByTime(6500);
    });

    // Basic sanity check: input still present
    expect(screen.getByTestId('minddrop-input')).toBeTruthy();
  });

  test('Token application (dark scheme) renders without errors', () => {
    const spyScheme = jest.spyOn(RN, 'useColorScheme');
    spyScheme.mockReturnValue('dark');

    render(<CatchAllNotepad />);

    // Smoke checks: core nodes render
    expect(screen.getByTestId('minddrop-screen')).toBeTruthy();
    expect(screen.getByTestId('minddrop-input')).toBeTruthy();
  });

  test('Announcements fire on success', async () => {
    // Mock Accessibility announce
    const announceSpy = jest
      .spyOn(RN.AccessibilityInfo as any, 'announceForAccessibility')
      .mockImplementation(() => {});

    // Make create succeed (free mode path)
    mockCreate.mockResolvedValue({ id: 'n-polish', type: 'note' });

    render(<CatchAllNotepad />);

    const input = screen.getByTestId('minddrop-input');
    fireEvent.changeText(input, 'hello gremly');

    const submit = screen.getByTestId('minddrop-submit-button');
    fireEvent.press(submit);

    await waitFor(() => {
      // Wait for submit cycle to complete back to default label
      expect(screen.getByText('Drop to Gremly →')).toBeTruthy();
    });

    // Verify an announcement was made
    expect(announceSpy).toHaveBeenCalledWith('Mind Drop organized successfully.');
  });

  test('A11y roles and states: submit button reflects busy while submitting', async () => {
    mockCreate.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ id: 'n1' }), 50)),
    );

    render(<CatchAllNotepad />);

    const input = screen.getByTestId('minddrop-input');
    fireEvent.changeText(input, 'check roles');

    const submit = screen.getByTestId('minddrop-submit-button');
    fireEvent.press(submit);

    // While submitting, ensure a11y role/state reflect busy + disabled
    await waitFor(() => {
      expect(submit).toHaveProp('accessibilityRole', 'button');
      expect(submit).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ busy: true, disabled: true }),
      );
    });

    // Let it finish to avoid leaking timers
    await waitFor(() => {
      expect(screen.getByText('Drop to Gremly →')).toBeTruthy();
    });
  });
});
