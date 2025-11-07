import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock providers with minimal, stable shims relative to this test file
jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => ({ repo: { upsertNote: jest.fn() } }),
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

// Mock navigation: we only need setOptions
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ setOptions: jest.fn() }),
  };
});

// Mock navigation elements (useHeaderHeight)
jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 100, // Mock header height
}));

// Force feature flag ON
jest.mock('@/src/config/featureFlags', () => ({
  MIND_DROP_V2: true,
}));

// Import after mocks
import CatchAllNotepad from '../CatchAllNotepad';

beforeAll(() => {
  // Use real timers for most tests; we'll switch to fake timers only where needed
});

beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage.clear();
});

describe('CatchAllNotepad greeting and static placeholder', () => {
  it('renders input container and input', () => {
    render(<CatchAllNotepad />);
    expect(screen.getByTestId('minddrop-input-container')).toBeTruthy();
    expect(screen.getByTestId('minddrop-input')).toBeTruthy();
  });
  it('displays static placeholder text', () => {
    render(<CatchAllNotepad />);

    // Verify the placeholder is displayed (use regex to be robust to wording changes)
    const input = screen.getByTestId('minddrop-input');
    expect(input.props.placeholder).toBeTruthy();
    expect(input.props.placeholder.length).toBeGreaterThan(0);
  });

  it('focus state does not crash on focus/blur', () => {
    render(<CatchAllNotepad />);
    const input = screen.getByTestId('minddrop-input');
    // Fire focus and blur events; no assertion other than not throwing
    fireEvent(input, 'focus');
    fireEvent(input, 'blur');
  });

  it('shows a live character counter under the input', () => {
    render(<CatchAllNotepad />);

    const input = screen.getByTestId('minddrop-input');
    fireEvent.changeText(input, 'Hello');
    expect(screen.queryByTestId('minddrop-counter')).toBeNull();

    fireEvent.changeText(input, 'x'.repeat(1500));
    const counter = screen.getByTestId('minddrop-counter');
    expect(counter.props.children).toBe('1500/2000');
  });

  it('renders the privacy badge with expected copy', () => {
    render(<CatchAllNotepad />);
    const input = screen.getByTestId('minddrop-input');
    fireEvent.changeText(input, 'privacy check');
    const privacy = screen.getByTestId('minddrop-privacy');
    const text = privacy.props.children?.toString() || '';
    expect(text.toLowerCase()).toContain('private & secure');
  });

  it('is disabled when empty and enabled when non-empty (checks accessibility/disabled state)', () => {
    render(<CatchAllNotepad />);

    const submit = screen.getByTestId('minddrop-submit-button');
    // Prefer checking accessibilityState or disabled prop rather than exact style values
    const isDisabledInitially =
      submit.props.accessibilityState?.disabled === true || submit.props.disabled === true;
    expect(isDisabledInitially).toBe(true);

    const input = screen.getByTestId('minddrop-input');
    fireEvent.changeText(input, 'Hi');

    const submitEnabled = screen.getByTestId('minddrop-submit-button');
    const isDisabledAfter =
      submitEnabled.props.accessibilityState?.disabled === true ||
      submitEnabled.props.disabled === true;
    expect(isDisabledAfter).toBe(false);
  });

  it('hides trust row when no items have been organized today', () => {
    render(<CatchAllNotepad />);

    expect(screen.queryByTestId('minddrop-trust')).toBeNull();
  });
});
