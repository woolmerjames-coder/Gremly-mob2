import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react-native';
import { v2Reducer, initialV2State } from '../components/overlay/overlayV2.state';
import { RecentDropsTestable as RecentDrops } from '../app/screens/CatchAllNotepad';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn(), setOptions: jest.fn() }),
  };
});

const mockRepo = {
  notes: {
    list: jest.fn(),
    delete: jest.fn(),
  },
  todos: {
    list: jest.fn(),
  },
  habits: {
    list: jest.fn(),
  },
  remove: jest.fn(),
};

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../providers/ThemeProvider', () => ({
  useTheme: () => ({
    c: {
      text: '#111',
      mutedText: '#555',
      sageTint: '#E7F4EA',
      goldenPear: '#FFE5B4',
      mossGreen: '#3D5A3D',
      danger: '#DC2626',
    },
    mode: 'light',
  }),
}));

jest.mock('../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => ({
    openEdit: jest.fn(),
    openCreate: jest.fn(),
    close: jest.fn(),
  }),
}));

const makeNote = (id: string, body: string, createdAt: Date) => ({
  id,
  type: 'note',
  subtype: 'catchall',
  title: body,
  body,
  created_at: createdAt.toISOString(),
  labels: ['catchall'],
  origin: 'catchall',
});

describe('Overlay Phase 2 — Title Sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.notes.list.mockResolvedValue([]);
    mockRepo.todos.list.mockResolvedValue([]);
    mockRepo.habits.list.mockResolvedValue([]);
  });

  describe('Compact title sync between overlay and recent drops', () => {
    it('keeps recent drops listing in sync with overlay title edits', async () => {
      const noteText = 'I really need to make dinner tonight for the family';
      mockRepo.notes.list.mockResolvedValue([makeNote('n1', noteText, new Date())]);

      render(<RecentDrops initiallyOpen eagerLoad />);

      const card = await screen.findByTestId('minddrop-recent-note-n1');
      await waitFor(() =>
        expect(within(card).getByText('Make dinner tonight for the family')).toBeTruthy(),
      );

      let state = { ...initialV2State };
      state = v2Reducer(state, { type: 'SET_TEXT', text: noteText });

      expect(state.compactTitle).toBe('Make dinner tonight for the family');
      expect(state.log.title).toBe('Make dinner tonight for the family');
    });
  });

  describe('User-title override persistence', () => {
    it('persists manual titles even after automated suggestions run later', () => {
      let state = { ...initialV2State };

      state = v2Reducer(state, { type: 'SET_TITLE', title: 'Plan the week ahead' });
      expect(state.compactTitle).toBe('Plan the week ahead');
      expect(state.userEditedTitle).toBe(false);

      state = v2Reducer(state, {
        type: 'SET_TEXT',
        text: 'Maybe I should tidy the garage this weekend',
      });
      expect(state.compactTitle).toBe('Tidy the garage this weekend');
      expect(state.log.title).toBe('Tidy the garage this weekend');
      expect(state.userEditedTitle).toBe(true);

      const afterSuggestion = v2Reducer(state, {
        type: 'SET_TITLE',
        title: 'Organize the garage now',
      });
      expect(afterSuggestion.compactTitle).toBe('Tidy the garage this weekend');
      expect(afterSuggestion.log.title).toBe('Tidy the garage this weekend');
      expect(afterSuggestion.userEditedTitle).toBe(true);
    });
  });
});
