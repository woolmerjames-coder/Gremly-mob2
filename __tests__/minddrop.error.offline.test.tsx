import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { organizedToastContent } from '../lib/ui/toast/copy';

// Force feature flag ON
jest.mock('@/src/config/featureFlags', () => ({ MIND_DROP_V2: true }));

// Mock navigation
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      setOptions: jest.fn(),
      navigate: jest.fn(),
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
  useAuth: () => ({ userId: 'user-1' }),
}));
// Repo mocks (per-test configured)
const mockCreate = jest.fn();
const mockNotesCreate = jest.fn();
const mockNotesList = jest.fn(async () => []);
const mockWriteEvent = jest.fn();
const mockDecideWithContext = jest.fn().mockResolvedValue({
  mode: 'auto',
  actions: [
    {
      type: 'create.note',
      payload: { text: 'Auto note', subtype: 'note', spaceId: null },
    },
  ],
  confidence: 0.9,
  suggestions: [],
  explanation: 'Auto note',
});

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: mockCreate,
    writeEvent: mockWriteEvent,
    notes: { list: mockNotesList, create: mockNotesCreate },
  }),
}));

jest.mock('../providers/CortexProvider', () => {
  const actual = jest.requireActual('../providers/CortexProvider');
  return {
    ...actual,
    useCortex: () => ({
      decideWithContext: mockDecideWithContext,
    }),
  };
});

import CatchAllNotepad from '../app/screens/CatchAllNotepad';

beforeEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  mockDecideWithContext.mockClear();
  process.env.EXPO_PUBLIC_MINDDROP_TOASTS = 'on';
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_MINDDROP_TOASTS;
});

function typeAndSubmit(text: string, options: { offline?: boolean } = {}) {
  render(<CatchAllNotepad networkIsOnline={options.offline === true ? false : undefined} />);
  const input = screen.getByTestId('minddrop-input');
  fireEvent.changeText(input, text);
  const submit = screen.getByTestId('minddrop-submit-button');
  fireEvent.press(submit);
  return { input, submit };
}

describe('Mind Drop — Error & Offline UX', () => {
  test('Auto-retry once: first save yields no created items, second succeeds; shows final success toast and uses two attempts', async () => {
    // First performSave path: repo.create throws -> performSave returns empty created
    // Second performSave path: repo.create succeeds -> one note created
    let call = 0;
    mockCreate.mockImplementation(async (input: any) => {
      call += 1;
      if (call === 1) {
        throw new Error('transient');
      }
      return { id: 'n-ok', type: input.type || 'note' };
    });

    typeAndSubmit('retry me once');

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));

    const expectedToast = organizedToastContent('note', 1);
    await screen.findByText(expectedToast);
  });

  test('Fallback to Unsorted when both attempts fail (non-network); shows Unsorted message and saves with labels', async () => {
    // Make performSave attempts fail (throw), but fallback unsorted succeed when labels present
    mockCreate.mockImplementation(async (input: any) => {
      if (Array.isArray(input?.labels) && input.labels.includes('needs_review')) {
        return { id: 'uns1', type: 'note' };
      }
      throw new Error('permanent');
    });

    typeAndSubmit('route me to unsorted');

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockNotesCreate).toHaveBeenCalledTimes(1));

    // Expect Unsorted Tray message
    await screen.findByText(/Saved to your Unsorted Tray/i);
    // Verify notes.create received labels including catchall + needs_review
    const [fallbackPayload] = mockNotesCreate.mock.calls[0];
    expect(fallbackPayload.labels).toEqual(expect.arrayContaining(['catchall', 'needs_review']));
  });

  test('Offline short-circuit: networkIsOnline=false -> Saved offline message and local write', async () => {
    // For offline short-circuit, we expect saveToUnsortedTray to run; prefer notes.create if present
    mockNotesCreate.mockResolvedValue({ id: 'n-off', type: 'note' });

    typeAndSubmit('offline path', { offline: true });

    await screen.findByText(/No internet — but I saved it!/i);

    // Should not go through performSave at all in this path; only unsorted write once
    expect(mockNotesCreate).toHaveBeenCalledTimes(1);
    // Input cleared
    const input = screen.getByTestId('minddrop-input');
    expect((input.props as any).value).toBe('');
    // Undo button should not be present on a simple success message toast
    expect(screen.queryByText('↩️ Undo')).toBeNull();
  });

  test('Double submit guard: second press within 600ms does not trigger another save', async () => {
    // First call succeeds, but rapid second press should be ignored
    mockCreate.mockResolvedValue({ id: 'n1', type: 'note' });

    render(<CatchAllNotepad />);
    const input = screen.getByTestId('minddrop-input');
    fireEvent.changeText(input, 'debounce me');
    const submit = screen.getByTestId('minddrop-submit-button');

    fireEvent.press(submit);
    fireEvent.press(submit);

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  });
});
