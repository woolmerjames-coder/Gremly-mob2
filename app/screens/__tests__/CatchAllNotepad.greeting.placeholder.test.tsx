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
});
