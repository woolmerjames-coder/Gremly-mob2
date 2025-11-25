import React from 'react';
import { fireEvent, renderWithProviders, screen, waitFor } from '../utils/renderWithProviders';
import { Alert, ToastAndroid } from 'react-native';
import SpacesScreen from '../../app/tabs/SpacesScreen';
import CatchAllNotepad, { THINKING_DURATION } from '../../app/screens/CatchAllNotepad';
import { matchesSurface } from '../../lib/surfaces';

const mockRepo = {
  listSpaces: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
};

jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../providers/AuthProvider', () => {
  const actual = jest.requireActual('../../providers/AuthProvider');
  return {
    ...actual,
    useAuth: () => ({
      user: { id: 'test-user', email: 'test@example.com' },
      userId: 'test-user',
      session: null,
      loading: false,
      error: null,
      signInWithEmail: jest.fn(),
      signOut: jest.fn(),
      clearError: jest.fn(),
    }),
  };
});

jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
jest.spyOn(ToastAndroid, 'show').mockImplementation(() => undefined);

describe('Mind Drop entry points', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.listSpaces.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders Mind Drop link on Spaces screen', async () => {
    const { mockNavigate: nav } = renderWithProviders(<SpacesScreen />);

    expect(screen.getByTestId('spaces-catchall-button')).toBeTruthy();
    expect(screen.getByText('Mind Drop')).toBeTruthy();
    await waitFor(() => {
      expect(mockRepo.listSpaces).toHaveBeenCalled();
    });

    fireEvent.press(screen.getByTestId('spaces-catchall-button'));

    expect(nav).toHaveBeenCalledWith('CatchAllNotepad');
  });

  it('shows the correct description for Free and Guided modes', () => {
    renderWithProviders(<CatchAllNotepad />);

    expect(
      screen.getByText('Just a calm notepad. You can format with bullets, numbers, or checkboxes.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('ca-mode-guided'));

    expect(screen.getByText(/Talk it out with Gremly/)).toBeTruthy();
    expect(
      screen.queryByText(
        'Just a calm notepad. You can format with bullets, numbers, or checkboxes.',
      ),
    ).toBeNull();
  });

  it('submits note via guided flow after thinking delay', async () => {
    const realSetTimeout = global.setTimeout.bind(global);
    let capturedDelay: number | null = null;

    // Intercept the guided timer so the callback runs immediately in tests while still verifying the configured delay.
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((
      callback: any,
      timeout?: number,
      ...args: any[]
    ) => {
      if (typeof callback === 'function' && timeout === THINKING_DURATION) {
        capturedDelay = timeout;
        return realSetTimeout(() => {
          callback(...args);
        }, 0);
      }

      return realSetTimeout(callback as (...cbArgs: unknown[]) => void, timeout ?? 0, ...args);
    }) as typeof setTimeout);

    mockRepo.create.mockResolvedValue({ id: 'note-catchall-1', type: 'note', subtype: 'catchall' });

    renderWithProviders(<CatchAllNotepad />);

    fireEvent.press(screen.getByTestId('ca-mode-guided'));
    fireEvent.changeText(screen.getByTestId('ca-note-input'), 'Testing catch-all note');
    fireEvent.press(screen.getByTestId('ca-submit'));

    expect(mockRepo.create).not.toHaveBeenCalled();

    try {
      expect(capturedDelay).toBe(THINKING_DURATION);

      await waitFor(() => {
        expect(mockRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'note',
            title: 'Testing catch-all note',
            body: 'Testing catch-all note',
            subtype: 'catchall',
            origin: 'catchall',
            ai_placed: true,
            why_string: 'Needs decision',
            canonicalType: 'unsorted',
            labels: ['catchall'],
            views: {
              alsoShowIn: ['Hub:Catch-All'],
            },
          }),
        );
      });
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it('submits immediately when in Free mode', async () => {
    mockRepo.create.mockResolvedValue({ id: 'note-catchall-2', type: 'note', subtype: 'catchall' });

    renderWithProviders(<CatchAllNotepad />);

    fireEvent.changeText(screen.getByTestId('ca-note-input'), 'Free form entry');
    fireEvent.press(screen.getByTestId('ca-submit'));

    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Free form entry',
          origin: 'catchall',
          ai_placed: true,
        }),
      );
    });
  });

  it('adds checklist prefix when toolbar is set to checklist', async () => {
    renderWithProviders(<CatchAllNotepad />);

    fireEvent.press(screen.getByTestId('ca-toolbar-list-checklist'));

    const input = screen.getByTestId('ca-note-input');
    fireEvent.changeText(input, 'milk');
    fireEvent.changeText(input, 'milk\n');

    await waitFor(() => {
      expect(screen.getByTestId('ca-note-input').props.value).toBe('milk\n[ ] ');
    });
  });

  it('matchesSurface remains disabled for Phase 7', () => {
    expect(matchesSurface({}, 'Hub:Catch-All')).toBe(false);
  });
});
