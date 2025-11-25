/**
 * Test: Recent drops display correct badges based on canonical_type
 *
 * Ensures that items with canonical_type="log" show "Log" badge, not "Unsorted"
 * Tests WiFi Password and Sarah's Dietary Preference scenarios (general logs)
 */

// Mock Supabase client FIRST, before any other imports
const mockSupabaseChannel = {
  on: jest.fn(function (this: any) {
    return this;
  }),
  subscribe: jest.fn(function (this: any) {
    return this;
  }),
};

const mockSupabase = {
  channel: jest.fn(() => mockSupabaseChannel),
  removeChannel: jest.fn(),
  auth: {
    getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
  },
};

jest.mock('../../../lib/supabase/client', () => ({
  __esModule: true,
  supabase: mockSupabase,
}));

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { RecentDropsTestable as RecentDrops } from '../CatchAllNotepad';

const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getById: jest.fn(),
  notes: {
    list: jest.fn(),
  },
  todos: {
    list: jest.fn(),
  },
  habits: {
    list: jest.fn(),
  },
};

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({
    userId: undefined, // No userId to prevent realtime subscriptions
    user: null,
  }),
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ setOptions: jest.fn() }),
}));

jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 100,
}));

jest.mock('../../../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => ({
    state: {
      visible: false,
      mode: 'create' as const,
      initialEntity: undefined,
      initialSpaceId: null,
      conversionMeta: undefined,
      initialText: null,
    },
    openEdit: jest.fn(),
    openCreate: jest.fn(),
    close: jest.fn(),
  }),
}));

const overlayStub = {
  state: {
    visible: false,
    mode: 'create' as const,
    initialEntity: undefined,
    initialSpaceId: null,
    conversionMeta: undefined,
    initialText: null,
  },
  openEdit: jest.fn(),
  openCreate: jest.fn(),
  close: jest.fn(),
};

jest.mock('../../../providers/ThemeProvider', () => ({
  useTheme: () => ({
    c: {
      text: '#000',
      mutedText: '#666',
      sageTint: '#E8F4E8',
      goldenPear: '#FFE5B4',
      mossGreen: '#3D5A3D',
      danger: '#DC2626',
    },
    mode: 'light',
  }),
}));

// Mock environment with canonical types ON
jest.mock('../../../lib/env', () => ({
  env: {
    feature: {
      canonicalTypes: true,
      minddropV3Instant: true,
    },
  },
}));

describe('Mind Drop Canonical Type Badge Rendering', () => {
  const renderRecentDrops = () =>
    render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset channel mocks
    mockSupabaseChannel.on.mockClear();
    mockSupabaseChannel.subscribe.mockClear();
  });

  it('shows "Log" badge for note with canonical_type=log and journal_subtype=general', async () => {
    const today = new Date().toISOString();

    // Seed: WiFi Password saved as a log with subtype "general"
    mockRepo.notes.list.mockResolvedValue([
      {
        id: 'note-wifi-1',
        title: 'WiFi Password',
        body: 'Network: HomeWiFi, Password: SuperSecret123',
        created_at: today,
        origin: 'catchall',
        labels: ['catchall', 'log'],
        canonical_type: 'log',
        subtype: 'general',
        journal_subtype: 'general',
        archived: false,
        drop_id: 'drop-wifi-1',
        views: {},
      },
    ]);

    mockRepo.todos.list.mockResolvedValue([]);
    mockRepo.habits.list.mockResolvedValue([]);

    const { getByTestId, getByText } = renderRecentDrops();

    await waitFor(() => {
      expect(mockRepo.notes.list).toHaveBeenCalled();
    });

    // Assert: Badge should say "Log", not "Unsorted"
    const badge = getByText('Log');
    expect(badge).toBeTruthy();

    // Verify the item appears in the list
    const listItem = getByText(/WiFi Password/);
    expect(listItem).toBeTruthy();
  });

  it('shows "Log" badge for note with canonical_type=log and journal_subtype=journal', async () => {
    const today = new Date().toISOString();

    // Seed: Sarah's Dietary Preference saved as a journal log
    mockRepo.notes.list.mockResolvedValue([
      {
        id: 'note-sarah-1',
        title: "Sarah's Dietary Preference",
        body: 'Sarah is vegetarian and allergic to nuts',
        created_at: today,
        origin: 'catchall',
        labels: ['catchall', 'log'],
        canonical_type: 'log',
        subtype: 'journal',
        journal_subtype: 'journal',
        archived: false,
        drop_id: 'drop-sarah-1',
        views: {},
      },
    ]);

    mockRepo.todos.list.mockResolvedValue([]);
    mockRepo.habits.list.mockResolvedValue([]);

    const { getByText } = renderRecentDrops();

    await waitFor(() => {
      expect(mockRepo.notes.list).toHaveBeenCalled();
    });

    // Assert: Badge should say "Log"
    const badge = getByText('Log');
    expect(badge).toBeTruthy();

    // Verify the item appears
    const listItem = getByText(/Sarah's Dietary Preference/);
    expect(listItem).toBeTruthy();
  });

  it('shows "Todo" badge for note with canonical_type=todo', async () => {
    const today = new Date().toISOString();

    mockRepo.notes.list.mockResolvedValue([
      {
        id: 'note-todo-1',
        title: 'Buy groceries',
        body: 'Buy groceries',
        created_at: today,
        origin: 'catchall',
        labels: ['catchall', 'todo'],
        canonical_type: 'todo',
        archived: false,
        drop_id: 'drop-todo-1',
        views: {},
      },
    ]);

    mockRepo.todos.list.mockResolvedValue([]);
    mockRepo.habits.list.mockResolvedValue([]);

    const { getByText } = renderRecentDrops();

    await waitFor(() => {
      expect(mockRepo.notes.list).toHaveBeenCalled();
    });

    const badge = getByText('Todo');
    expect(badge).toBeTruthy();
  });

  it('shows "Habit" badge for note with canonical_type=habit', async () => {
    const today = new Date().toISOString();

    mockRepo.notes.list.mockResolvedValue([
      {
        id: 'note-habit-1',
        title: 'Meditate every morning',
        body: 'Meditate every morning',
        created_at: today,
        origin: 'catchall',
        labels: ['catchall', 'habit'],
        canonical_type: 'habit',
        archived: false,
        drop_id: 'drop-habit-1',
        views: {},
      },
    ]);

    mockRepo.todos.list.mockResolvedValue([]);
    mockRepo.habits.list.mockResolvedValue([]);

    const { getByText } = renderRecentDrops();

    await waitFor(() => {
      expect(mockRepo.notes.list).toHaveBeenCalled();
    });

    const badge = getByText('Habit');
    expect(badge).toBeTruthy();
  });

  it('shows "Unsorted" badge only when canonical_type=unsorted', async () => {
    const today = new Date().toISOString();

    mockRepo.notes.list.mockResolvedValue([
      {
        id: 'note-unsorted-1',
        title: 'Some random thought',
        body: 'Some random thought',
        created_at: today,
        origin: 'catchall',
        labels: ['catchall', 'needs_review'],
        canonical_type: 'unsorted',
        archived: false,
        drop_id: 'drop-unsorted-1',
        views: {},
      },
    ]);

    mockRepo.todos.list.mockResolvedValue([]);
    mockRepo.habits.list.mockResolvedValue([]);

    const { getByText } = renderRecentDrops();

    await waitFor(() => {
      expect(mockRepo.notes.list).toHaveBeenCalled();
    });

    const badge = getByText('Unsorted');
    expect(badge).toBeTruthy();
  });

  it('shows "Log" badge when labels includes "log" (backwards compat)', async () => {
    const today = new Date().toISOString();

    // Legacy item: no canonical_type, but labels includes 'log'
    mockRepo.notes.list.mockResolvedValue([
      {
        id: 'note-legacy-log-1',
        title: 'Legacy log entry',
        body: 'Legacy log entry',
        created_at: today,
        origin: 'catchall',
        labels: ['catchall', 'log'],
        // No canonical_type (legacy)
        archived: false,
        drop_id: 'drop-legacy-1',
        views: {},
      },
    ]);

    mockRepo.todos.list.mockResolvedValue([]);
    mockRepo.habits.list.mockResolvedValue([]);

    const { getByText } = renderRecentDrops();

    await waitFor(() => {
      expect(mockRepo.notes.list).toHaveBeenCalled();
    });

    // Should still show "Log" based on labels
    const badge = getByText('Log');
    expect(badge).toBeTruthy();
  });

  it('shows "Log" badge when journal_subtype exists without canonical_type', async () => {
    const today = new Date().toISOString();

    // Edge case: journal_subtype set but no canonical_type
    mockRepo.notes.list.mockResolvedValue([
      {
        id: 'note-jsubtype-1',
        title: 'Quick idea',
        body: 'Quick idea',
        created_at: today,
        origin: 'catchall',
        labels: ['catchall'],
        journal_subtype: 'idea',
        // No canonical_type
        archived: false,
        drop_id: 'drop-jsubtype-1',
        views: {},
      },
    ]);

    mockRepo.todos.list.mockResolvedValue([]);
    mockRepo.habits.list.mockResolvedValue([]);

    const { getByText } = renderRecentDrops();

    await waitFor(() => {
      expect(mockRepo.notes.list).toHaveBeenCalled();
    });

    // Should show "Log" based on journal_subtype
    const badge = getByText('Log');
    expect(badge).toBeTruthy();
  });

  it('shows "Unsorted" badge when no canonical info is available', async () => {
    const today = new Date().toISOString();

    // Truly unsorted: no canonical_type, no labels, no journal_subtype
    mockRepo.notes.list.mockResolvedValue([
      {
        id: 'note-truly-unsorted-1',
        title: 'Ambiguous note',
        body: 'Ambiguous note',
        created_at: today,
        origin: 'catchall',
        labels: ['catchall'],
        // No canonical_type, no journal_subtype
        archived: false,
        drop_id: 'drop-ambiguous-1',
        views: {},
      },
    ]);

    mockRepo.todos.list.mockResolvedValue([]);
    mockRepo.habits.list.mockResolvedValue([]);

    const { getByText } = renderRecentDrops();

    await waitFor(() => {
      expect(mockRepo.notes.list).toHaveBeenCalled();
    });

    const badge = getByText('Unsorted');
    expect(badge).toBeTruthy();
  });
});
