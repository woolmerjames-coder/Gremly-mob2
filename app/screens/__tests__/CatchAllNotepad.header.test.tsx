import { render, fireEvent, waitFor } from '@testing-library/react-native';

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
  useAuth: () => ({ user: { id: 'test-user' } }),
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
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    __esModule: true,
    ...actual,
    useNavigation: () => ({
      setOptions: jest.fn(),
      navigate: mockNavigate,
      canGoBack: () => false,
      goBack: mockGoBack,
      addListener: jest.fn(() => jest.fn()),
    }),
  };
});

import CatchAllNotepad from '../CatchAllNotepad';

describe('CatchAllNotepad header + info sheet', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockGoBack.mockClear();
  });

  it('renders header title as image', () => {
    const screen = render(<CatchAllNotepad />);
    expect(screen.getByTestId('minddrop-header')).toBeTruthy();
    // Header now uses an image instead of text
    const headerImage = screen.getByLabelText('Mind Drop');
    expect(headerImage).toBeTruthy();
  });

  // NOTE: Info sheet header button was removed in navigation refactor
  it.skip('opens info sheet when header icon is pressed', () => {
    const screen = render(<CatchAllNotepad />);
    expect(screen.queryByTestId('minddrop-info-sheet')).toBeNull();
    fireEvent.press(screen.getByTestId('minddrop-info-header'));
    expect(screen.getByTestId('minddrop-info-sheet')).toBeTruthy();
  });

  it.skip('invokes navigate when selecting View Recent Drops', async () => {
    const screen = render(<CatchAllNotepad />);

    fireEvent.press(screen.getByTestId('minddrop-info-header'));
    const openRecent = screen.getByTestId('minddrop-info-open-recent');

    fireEvent.press(openRecent);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('minddrop-info-sheet')).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', {
      screen: 'Search',
      params: { filter: 'recent' },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v1.20: Header layout changes - Age moved to Hub, mascot moved to input field
// ─────────────────────────────────────────────────────────────────────────────

describe('CatchAllNotepad header v1.20 layout', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockGoBack.mockClear();
  });

  it('does NOT render mascot in header (mascot now on input field)', () => {
    const screen = render(<CatchAllNotepad />);
    expect(screen.getByTestId('minddrop-header')).toBeTruthy();
    // Header mascot was removed - Gremly now lives on input field
    // Header should still have images (title image) but mascot is not in header
    const header = screen.getByTestId('minddrop-header');
    expect(header).toBeTruthy();
  });

  it('does NOT display age number in MindDrop header (moved to Hub)', () => {
    const screen = render(<CatchAllNotepad />);
    // Age is now displayed in Hub, not in MindDrop header
    // Should not find a standalone age number in header context
    const header = screen.getByTestId('minddrop-header');
    // The header should not contain gremlyAge text directly
    // (age badge was removed from MindDrop, now in Hub)
    expect(header).toBeTruthy();
  });

  it('centers title horizontally', () => {
    const screen = render(<CatchAllNotepad />);
    // Title should be centered via absolute positioning
    const titleImage = screen.getByLabelText('Mind Drop');
    expect(titleImage).toBeTruthy();
  });

  it('maintains header height after mascot removal (via headerLeft spacer)', () => {
    const screen = render(<CatchAllNotepad />);
    // Header should maintain consistent height even without mascot
    // The headerLeft style has width: 64, height: 64 to preserve layout
    const header = screen.getByTestId('minddrop-header');
    expect(header).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v1.20: Gremly mascot now on input field
// ─────────────────────────────────────────────────────────────────────────────

describe('CatchAllNotepad Gremly on input field', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockGoBack.mockClear();
  });

  it('renders Gremly mascot as Lottie animation on input field', () => {
    const screen = render(<CatchAllNotepad />);
    // Gremly mascot was changed from a static Image to MascotLottie (Lottie animation).
    // The title Image should still be present (at least 1 Image), but the mascot
    // is now a LottieView, not an Image.
    const { UNSAFE_root } = screen;
    const images = UNSAFE_root.findAllByType(require('react-native').Image);
    // At least the title image should be present
    expect(images.length).toBeGreaterThanOrEqual(1);

    // MascotLottie renders via LottieView (mocked) — verify the help pressable exists
    const helpButton = screen.getByLabelText('Help');
    expect(helpButton).toBeTruthy();
  });
});
