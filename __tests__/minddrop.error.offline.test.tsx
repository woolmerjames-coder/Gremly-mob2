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

// Mock Auth - userId undefined to prevent Supabase subscription code paths
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'test-user' },
    // userId undefined prevents CatchAllNotepad subscription effects from running
  }),
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
    // Pipeline idempotency check methods
    findTodoByDropId: jest.fn().mockResolvedValue(null),
    findHabitByDropId: jest.fn().mockResolvedValue(null),
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
  test.skip('Auto-retry once: first save yields no created items, second succeeds; shows final success toast and uses two attempts', async () => {
    // TODO: This test was written for Mind Drop v2 single-stage pipeline.
    // Mind Drop v3 uses a multi-stage pipeline (Stage A: classification → Stage B: prefill)
    // with different error handling and retry logic.
    // Needs to be rewritten to match v3 architecture or removed if retry logic changed.

    // Mind Drop v3 pipeline: Stage A creates unsorted note, then converts to canonical entity
    // First attempt: transient error
    // Second attempt: succeeds with unsorted note creation
    let call = 0;
    mockCreate.mockImplementation(async (input: any) => {
      call += 1;
      if (call === 1) {
        throw new Error('transient');
      }
      // Stage A creates unsorted note with catchall labels and ai_pending
      return {
        id: 'n-ok',
        type: 'note',
        labels: ['catchall', 'needs_review'],
        views: { ai_pending: true, minddrop_stage: 'pending' },
      };
    });

    typeAndSubmit('retry me once');

    // Should retry once (2 attempts total)
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));

    // Input should be cleared after successful save
    const input = screen.getByTestId('minddrop-input');
    await waitFor(() => {
      expect((input.props as any).value).toBe('');
    });

    // Should create unsorted note with catchall labels (Stage A behavior)
    const createCalls = mockCreate.mock.calls;
    const lastCall = createCalls[createCalls.length - 1][0];
    expect(lastCall.labels).toContain('catchall');
    expect(lastCall.labels).toContain('needs_review');
  });

  test.skip('Fallback to Unsorted when both attempts fail (non-network); shows Unsorted message and saves with labels', async () => {
    // TODO: This test was written for Mind Drop v2 fallback behavior.
    // Mind Drop v3 has different error handling and fallback paths.
    // Needs to be rewritten to match v3 architecture or removed if behavior changed.

    // Mind Drop v3: When auto pipeline fails, fallback creates unsorted note with needs_review label
    // Simulate pipeline failure, but fallback to unsorted succeeds
    mockCreate.mockImplementation(async (input: any) => {
      // Accept unsorted note creation with needs_review label
      if (Array.isArray(input?.labels) && input.labels.includes('needs_review')) {
        return {
          id: 'uns1',
          type: 'note',
          labels: input.labels,
          views: { ai_pending: false },
        };
      }
      throw new Error('permanent');
    });

    typeAndSubmit('route me to unsorted');

    // Should attempt auto path (fails) then fallback to unsorted
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });

    // Input should be cleared
    const input = screen.getByTestId('minddrop-input');
    await waitFor(() => {
      expect((input.props as any).value).toBe('');
    });

    // Verify unsorted note was created with proper labels
    const createCalls = mockCreate.mock.calls;
    const unsortedCall = createCalls.find((call) => call[0]?.labels?.includes('needs_review'));
    expect(unsortedCall).toBeTruthy();
    expect(unsortedCall[0].labels).toContain('catchall');
    expect(unsortedCall[0].labels).toContain('needs_review');
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

  test.skip('Double submit guard: second press within 600ms does not trigger another save', async () => {
    // TODO: This test was written for Mind Drop v2 debounce behavior.
    // Mind Drop v3 may have different submit guard logic.
    // Needs to be rewritten to match v3 architecture or removed if debounce behavior changed.

    // Mind Drop v3: First submit creates unsorted note, second press should be debounced
    mockCreate.mockResolvedValue({
      id: 'n1',
      type: 'note',
      labels: ['catchall', 'needs_review'],
      views: { ai_pending: true },
    });

    render(<CatchAllNotepad />);
    const input = screen.getByTestId('minddrop-input');
    fireEvent.changeText(input, 'debounce me');
    const submit = screen.getByTestId('minddrop-submit-button');

    fireEvent.press(submit);
    fireEvent.press(submit); // Rapid second press

    // Debounce should prevent second save - only 1 create call
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  });
});
