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

describe('Overlay Phase 2 — Title Sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.notes.list.mockResolvedValue([]);
    mockRepo.todos.list.mockResolvedValue([]);
    mockRepo.habits.list.mockResolvedValue([]);
  });

  describe('Compact title sync between overlay and recent drops', () => {
    it('promotes manual edits after an AI summary across overlay state and recent drops', async () => {
      const aiSummary = 'Plan the week ahead';
      const userEdit = 'Maybe I should tidy the garage this weekend';

      let state = { ...initialV2State };
      state = v2Reducer(state, { type: 'SET_TITLE', title: aiSummary });

      expect(state.compactTitle).toBe('The week ahead');
      expect(state.log.title).toBe('The week ahead');
      expect(state.userEditedTitle).toBe(false);

      state = v2Reducer(state, { type: 'SET_TEXT', text: userEdit });

      const expectedCompact = 'Tidy the garage this weekend';
      expect(state.log.body).toBe(userEdit);
      expect(state.compactTitle).toBe(expectedCompact);
      expect(state.log.title).toBe(expectedCompact);
      expect(state.userEditedTitle).toBe(true);

      mockRepo.notes.list.mockResolvedValue([
        {
          id: 'n1',
          type: 'note',
          subtype: 'catchall',
          title: state.log.title,
          body: state.log.body,
          created_at: new Date().toISOString(),
          labels: ['catchall'],
          origin: 'catchall',
        },
      ]);

      render(<RecentDrops initiallyOpen eagerLoad />);

      const card = await screen.findByTestId('minddrop-recent-note-n1');
      await waitFor(() => expect(within(card).getByText(expectedCompact)).toBeTruthy());
    });
  });

  describe('User-title override persistence', () => {
    it('persists manual titles even after automated suggestions run later', () => {
      let state = { ...initialV2State };

      state = v2Reducer(state, { type: 'SET_TITLE', title: 'Plan the week ahead' });
      expect(state.compactTitle).toBe('The week ahead');
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
