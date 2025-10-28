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
import { Text } from 'react-native';

// Static placeholder text used in the component
const STATIC_PLACEHOLDER = 'Buy milk, call mom, that idea about...';

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

describe('CatchAllNotepad greeting and static placeholder', () => {
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

  it('displays static trust line with privacy message when no items organized', () => {
    render(<CatchAllNotepad />);

    const trustText = screen.getByTestId('minddrop-trust-text');
    const text = trustText.props.children?.toString() || '';
    // Should show privacy message when organizedToday is 0
    expect(text).toBe('Your thoughts are private & secure with Gremly.');
  });
});
