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

// Force feature flag ON
jest.mock('@/src/config/featureFlags', () => ({
  MIND_DROP_V2: true,
}));

// Import after mocks
import CatchAllNotepad, { PLACEHOLDERS } from '../CatchAllNotepad';
import { Text } from 'react-native';

// Utilities from the screen module (keys/placeholders)
// We avoid deep imports; instead, re-derive the storage key to seed AsyncStorage deterministically
const LAST_OPEN_KEY = 'minddrop:last_open_ts';

beforeAll(() => {
  // Use real timers for most tests; we'll switch to fake timers only where needed
});

beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage.clear();
});

describe('CatchAllNotepad greeting and placeholder rotation', () => {
  it('renders input container and input', () => {
    render(<CatchAllNotepad />);
    expect(screen.getByTestId('minddrop-input-container')).toBeTruthy();
    expect(screen.getByTestId('minddrop-input')).toBeTruthy();
  });

  it('renders a greeting on first open', async () => {
    render(<CatchAllNotepad />);

    const greeting = await screen.findByTestId('minddrop-greeting');
    const text = greeting.props.children?.toString() || '';
    expect(text.length).toBeGreaterThan(0);
  });

  it('shows a welcome back message when LAST_OPEN_KEY is >= 3 days old', async () => {
    // Mock last open to 4 days ago for this render
    const fourDaysAgo = Date.now() - 4 * 24 * 60 * 60 * 1000;
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(String(fourDaysAgo));

    render(<CatchAllNotepad />);

    const greeting = await screen.findByTestId('minddrop-greeting');
    const text = greeting.props.children?.toString().toLowerCase();
    expect(text).toContain('welcome');
  });

  it('rotates placeholder text deterministically via test-only control', () => {
    render(<CatchAllNotepad />);

    // Initial placeholder is the first entry
    expect(screen.getByPlaceholderText(PLACEHOLDERS[0])).toBeTruthy();

    // Tap the test-only rotator button (enabled via JEST_WORKAROUND)
    const rotator = screen.getByTestId('minddrop-rotate-placeholder');
    fireEvent.press(rotator);
    expect(screen.getByPlaceholderText(PLACEHOLDERS[1])).toBeTruthy();

    fireEvent.press(rotator);
    expect(screen.getByPlaceholderText(PLACEHOLDERS[2])).toBeTruthy();
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

    const counter = screen.getByTestId('minddrop-counter');
    expect(counter.props.children).toContain('0 / 2000');

    const input = screen.getByTestId('minddrop-input');
    fireEvent.changeText(input, 'Hello');
    const counterAfter = screen.getByTestId('minddrop-counter');
    expect(counterAfter.props.children).toContain('5 / 2000');
  });

  it('renders the privacy badge with expected copy', () => {
    render(<CatchAllNotepad />);
    const privacy = screen.getByTestId('minddrop-privacy');
    const text = privacy.props.children?.toString() || '';
    expect(text.toLowerCase()).toContain('private & secure');
  });

  it('disables submit when empty (opacity 0.6) and enables on non-empty (opacity 1)', () => {
    render(<CatchAllNotepad />);

    const submit = screen.getByTestId('minddrop-submit-button');
    // Check style opacity ~0.6 on the first style object (animated style is empty due to reduced motion)
    const styleArray = Array.isArray(submit.props.style)
      ? submit.props.style
      : [submit.props.style];
    const baseStyle = styleArray[0] || {};
    expect(baseStyle.opacity).toBe(0.6);

    const input = screen.getByTestId('minddrop-input');
    fireEvent.changeText(input, 'Hi');
    const submitEnabled = screen.getByTestId('minddrop-submit-button');
    const styleArrayEnabled = Array.isArray(submitEnabled.props.style)
      ? submitEnabled.props.style
      : [submitEnabled.props.style];
    const baseStyleEnabled = styleArrayEnabled[0] || {};
    expect(baseStyleEnabled.opacity).toBe(1);
  });
});
