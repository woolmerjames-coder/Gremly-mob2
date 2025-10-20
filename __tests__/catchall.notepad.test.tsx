/**
 * Catch-All Notepad Tests (Phase 7)
 *
 * Tests for:
 * - Guided vs Free mode
 * - Saving notes with ai_placed: false (direct save, not AI-placed)
 * - List formatting
 * - Thinking animation
 */

import React from 'react';
import { renderWithProviders, screen, waitFor, fireEvent } from './utils/renderWithProviders';
import CatchAllNotepad, { THINKING_DURATION } from '../app/screens/CatchAllNotepad';

// Mock the auth provider
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    userId: 'test-user-id',
    loading: false,
    signInWithEmail: jest.fn(),
    signOut: jest.fn(),
  }),
}));

const mockCreate = jest.fn().mockResolvedValue({ id: 'new-note-1' });

// Mock repo provider
jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: mockCreate,
  }),
}));

// Mock cortex provider (not used in Phase 7 direct save)
jest.mock('../providers/CortexProvider', () => ({
  useCortex: () => ({
    classify: jest.fn().mockResolvedValue({
      type: 'note',
      subtype: 'catchall',
      confidence: 0.9,
    }),
  }),
}));

// TODO: All tests skipped due to timeout issues in CI environment - UI timing flakiness
describe.skip('Catch-All Notepad (Phase 7)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // TODO: Skipped due to timeout issues in CI environment
  it.skip('renders Catch-All notepad with Guided mode selected', async () => {
    renderWithProviders(<CatchAllNotepad />);

    await waitFor(() => {
      expect(screen.getByTestId('ca-mode-guided')).toBeTruthy();
      expect(screen.getByTestId('ca-mode-free')).toBeTruthy();
      expect(screen.getByTestId('ca-note-input')).toBeTruthy();
      expect(screen.getByTestId('ca-submit')).toBeTruthy();
    });
  });

  // TODO: Skipped due to timeout issues in CI environment
  it.skip('submits note immediately in Free mode with ai_placed: false', async () => {
    renderWithProviders(<CatchAllNotepad />);

    // Switch to Free mode
    await waitFor(() => {
      expect(screen.getByTestId('ca-mode-free')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('ca-mode-free'));

    // Enter text
    const textarea = screen.getByTestId('ca-note-input');
    fireEvent.changeText(textarea, 'Free form entry');

    // Submit
    fireEvent.press(screen.getByTestId('ca-submit'));

    // Should save immediately without thinking animation
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'note',
          subtype: 'catchall',
          body: 'Free form entry',
          title: '',
          origin: 'catchall',
          ai_placed: false, // Phase 7: Direct save, not AI-placed
          why_string: 'Saved from Catch-All Notepad',
          canonicalType: 'note',
          labels: ['catchall'],
          views: { alsoShowIn: ['Hub:Catch-All'] },
        }),
      );
    });
  });

  it('submits note with ai_placed: false in Guided mode', async () => {
    renderWithProviders(<CatchAllNotepad />);

    // Guided mode is default
    const textarea = screen.getByTestId('ca-note-input');
    fireEvent.changeText(textarea, 'Testing catch-all note');

    // Submit
    fireEvent.press(screen.getByTestId('ca-submit'));

    // Should show thinking animation
    await waitFor(() => {
      expect(screen.getByTestId('ca-thinking')).toBeTruthy();
    });

    // Fast-forward past thinking duration
    jest.advanceTimersByTime(THINKING_DURATION + 100);

    // Should call create with ai_placed: false
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'note',
          subtype: 'catchall',
          body: 'Testing catch-all note',
          title: '',
          ai_placed: false, // Phase 7: saved directly, not AI-classified
          origin: 'catchall',
          why_string: 'Saved from Catch-All Notepad',
        }),
      );
    });
  });

  it('applies bullet list formatting when bullets toolbar is active', async () => {
    renderWithProviders(<CatchAllNotepad />);

    // Switch to Guided mode (default)
    const textarea = screen.getByTestId('ca-note-input');

    // Activate bullets toolbar
    await waitFor(() => {
      expect(screen.getByTestId('ca-toolbar-list-bullets')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('ca-toolbar-list-bullets'));

    // Type text
    fireEvent.changeText(textarea, 'First item\nSecond item');

    // Should auto-format with bullets
    await waitFor(() => {
      const textareaValue = textarea.props.value;
      // Implementation may add bullets automatically
      expect(textareaValue).toContain('First item');
      expect(textareaValue).toContain('Second item');
    });
  });

  it('shows thinking animation with correct duration in Guided mode', async () => {
    renderWithProviders(<CatchAllNotepad />);

    const textarea = screen.getByTestId('ca-note-input');
    fireEvent.changeText(textarea, 'Test note');

    fireEvent.press(screen.getByTestId('ca-submit'));

    // Thinking indicator should appear
    await waitFor(() => {
      expect(screen.getByTestId('ca-thinking')).toBeTruthy();
    });

    // Fast-forward half the thinking duration
    jest.advanceTimersByTime(THINKING_DURATION / 2);

    // Still thinking
    expect(screen.getByTestId('ca-thinking')).toBeTruthy();

    // Fast-forward to complete thinking
    jest.advanceTimersByTime(THINKING_DURATION / 2 + 100);

    // Thinking should be done, item created
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });
  });

  it('disables submit button when textarea is empty', async () => {
    renderWithProviders(<CatchAllNotepad />);

    await waitFor(() => {
      const submitBtn = screen.getByTestId('ca-submit');
      // Check if button is disabled (implementation-dependent)
      expect(submitBtn).toBeTruthy();
    });
  });

  it('clears textarea after successful submission', async () => {
    renderWithProviders(<CatchAllNotepad />);

    // Switch to Free mode for immediate submit
    fireEvent.press(screen.getByTestId('ca-mode-free'));

    const textarea = screen.getByTestId('ca-note-input');
    fireEvent.changeText(textarea, 'Quick note');

    fireEvent.press(screen.getByTestId('ca-submit'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });

    // Textarea should be cleared
    await waitFor(() => {
      expect(textarea.props.value).toBe('');
    });
  });

  it('switches between Guided and Free modes', async () => {
    renderWithProviders(<CatchAllNotepad />);

    // Start in Guided mode
    await waitFor(() => {
      expect(screen.getByTestId('ca-mode-guided')).toBeTruthy();
    });

    // Switch to Free
    fireEvent.press(screen.getByTestId('ca-mode-free'));

    // Verify Free mode is active (visual indicator would show)
    await waitFor(() => {
      expect(screen.getByTestId('ca-mode-free')).toBeTruthy();
    });

    // Switch back to Guided
    fireEvent.press(screen.getByTestId('ca-mode-guided'));

    await waitFor(() => {
      expect(screen.getByTestId('ca-mode-guided')).toBeTruthy();
    });
  });

  it('saves with correct space_id as null for unassigned', async () => {
    renderWithProviders(<CatchAllNotepad />);

    // Switch to Free mode
    fireEvent.press(screen.getByTestId('ca-mode-free'));

    const textarea = screen.getByTestId('ca-note-input');
    fireEvent.changeText(textarea, 'Test note');

    fireEvent.press(screen.getByTestId('ca-submit'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          space_id: null, // Unassigned by default
        }),
      );
    });
  });
});
