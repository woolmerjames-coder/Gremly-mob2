import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { renderWithProviders, screen, waitFor, act, fireEvent } from './utils/renderWithProviders';
import { eventBus } from '../lib/events';

// Mock Auth: authenticated user
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    userId: 'test-user-id',
    loading: false,
    error: null,
  }),
}));

type MockRepo = ReturnType<typeof createRepoMock>;

function createRepoMock() {
  return {
    // Today merged + summary
    listTodayMerged: jest.fn(() =>
      Promise.resolve([
        {
          type: 'todo',
          id: 'todo-1',
          name: 'Finish packing',
          status: 'active',
          carry_forward: true,
        },
        {
          type: 'habit',
          id: 'habit-1',
          name: 'Water',
          target_count: 8,
          progress_today: 6,
          cadence: 'day',
        },
      ]),
    ),
    getTodaySummary: jest.fn(() => Promise.resolve({ completed: 3, remaining: 2 })),

    // Focus
    getFocusForDate: jest.fn(() => Promise.resolve(null)),
    setFocus: jest.fn(() => Promise.resolve()),
    clearFocusForDate: jest.fn(() => Promise.resolve()),
    topFocusCandidates: jest.fn(() =>
      Promise.resolve([{ id: 'todo-1', type: 'todo' as const, priority: 150 }]),
    ),

    // Drop zone
    listRecentDrops: jest.fn(() =>
      Promise.resolve([
        {
          id: 'n1',
          title: 'Packing list',
          body: 'mexico trip and travel prep',
          created_at: new Date().toISOString(),
        },
        {
          id: 'n2',
          title: 'Travel docs',
          body: 'check passport',
          created_at: new Date().toISOString(),
        },
      ]),
    ),
  };
}

let mockRepo: MockRepo = createRepoMock();

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

// Hooks under test
import { useTodayEntries } from '../lib/today/hooks/useTodayEntries';
import { useFocusCard } from '../lib/today/hooks/useFocusCard';
import { useDropZoneSummary } from '../lib/today/hooks/useDropZoneSummary';
import { useSweepPreview } from '../lib/today/hooks/useSweepPreview';

// Test harness components
function TodayEntriesHarness() {
  const { items, completed, remaining, loading, error } = useTodayEntries();
  return (
    <Text testID="entries">
      {JSON.stringify({ itemsLen: items.length, completed, remaining, loading, error })}
    </Text>
  );
}

function FocusCardHarness() {
  const { focus, autosuggest, clear, choose, loading, error } = useFocusCard();
  return (
    <>
      <Text testID="focus">{JSON.stringify({ focus, loading, error })}</Text>
      <TouchableOpacity testID="autosuggest" onPress={() => autosuggest()} />
      <TouchableOpacity
        testID="choose"
        onPress={() => choose({ entry_id: 'todo-1', entry_type: 'todo', source: 'user' })}
      />
      <TouchableOpacity testID="clear" onPress={() => clear()} />
    </>
  );
}

function DropZoneHarness() {
  const { count, quote, loading, error } = useDropZoneSummary();
  return <Text testID="dropzone">{JSON.stringify({ count, quote, loading, error })}</Text>;
}

function SweepPreviewHarness() {
  // threshold 0 so it is always available during tests
  const { completed, remaining, available, loading, error } = useSweepPreview(0);
  return (
    <Text testID="sweep">
      {JSON.stringify({ completed, remaining, available, loading, error })}
    </Text>
  );
}

describe('Today v3 Hooks', () => {
  beforeEach(() => {
    mockRepo = createRepoMock();
    jest.clearAllMocks();
  });

  afterEach(() => {
    eventBus.clear();
  });

  test('useTodayEntries: loads merged items and summary', async () => {
    renderWithProviders(<TodayEntriesHarness />);

    await waitFor(() => {
      const node = screen.getByTestId('entries');
      const { itemsLen, completed, remaining, loading, error } = JSON.parse(node.props.children);
      expect(loading).toBe(false);
      expect(error).toBeNull();
      expect(itemsLen).toBe(2);
      expect(completed).toBe(3);
      expect(remaining).toBe(2);
    });

    expect(mockRepo.listTodayMerged).toHaveBeenCalled();
    expect(mockRepo.getTodaySummary).toHaveBeenCalled();
  });

  test('useFocusCard: autosuggest picks top candidate and persists focus; clear removes it', async () => {
    renderWithProviders(<FocusCardHarness />);

    // Autosuggest
    await act(async () => {
      fireEvent.press(screen.getByTestId('autosuggest'));
    });

    await waitFor(() => {
      expect(mockRepo.topFocusCandidates).toHaveBeenCalled();
      expect(mockRepo.setFocus).toHaveBeenCalled();
    });

    // Choose explicitly
    await act(async () => {
      fireEvent.press(screen.getByTestId('choose'));
    });

    await waitFor(() => {
      expect(mockRepo.setFocus).toHaveBeenCalledTimes(2);
    });

    // Clear focus
    await act(async () => {
      fireEvent.press(screen.getByTestId('clear'));
    });

    await waitFor(() => {
      expect(mockRepo.clearFocusForDate).toHaveBeenCalled();
    });

    // Ensure the hook updated state without errors
    const node = screen.getByTestId('focus');
    const { loading, error } = JSON.parse(node.props.children);
    expect(loading).toBe(false);
    expect(error).toBeNull();
  });

  test('useDropZoneSummary: provides count and a summary quote', async () => {
    renderWithProviders(<DropZoneHarness />);

    await waitFor(() => {
      expect(mockRepo.listRecentDrops).toHaveBeenCalled();
      const node = screen.getByTestId('dropzone');
      const { count, quote, loading, error } = JSON.parse(node.props.children);
      expect(loading).toBe(false);
      expect(error).toBeNull();
      expect(count).toBe(2);
      expect(typeof quote).toBe('string');
      expect(quote.length).toBeGreaterThan(0);
    });
  });

  test('useSweepPreview: shows counts and is available after threshold', async () => {
    renderWithProviders(<SweepPreviewHarness />);

    await waitFor(() => {
      expect(mockRepo.getTodaySummary).toHaveBeenCalled();
      const node = screen.getByTestId('sweep');
      const { completed, remaining, available, loading, error } = JSON.parse(node.props.children);
      expect(loading).toBe(false);
      expect(error).toBeNull();
      expect(completed).toBe(3);
      expect(remaining).toBe(2);
      expect(available).toBe(true);
    });
  });
});
