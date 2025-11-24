import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { env } from '../../../lib/env';

let mockRepo: any;
let mockAuth: any;
let mockTheme: any;
let mockCortex: any;

jest.mock('../../../providers/RepoProvider', () => ({
  __esModule: true,
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => mockAuth,
}));

jest.mock('../../../providers/ThemeProvider', () => ({
  __esModule: true,
  useTheme: () => mockTheme,
}));

jest.mock('../../../providers/CortexProvider', () => ({
  __esModule: true,
  useCortex: () => mockCortex,
}));

jest.mock('../hooks/usePhase8LinksState', () => ({
  usePhase8LinksState: () => ({
    allTags: [],
    currentTags: [],
    loadTags: jest.fn(),
    addTag: jest.fn(),
    linkTag: jest.fn(),
    unlinkTag: jest.fn(),
    clearPendingTags: jest.fn(),
    linkedPeople: [],
    loadPeople: jest.fn(),
    linkPerson: jest.fn(),
    unlinkPerson: jest.fn(),
    clearPendingPeople: jest.fn(),
    pendingTagIds: [],
    pendingPeople: [],
    isLoading: false,
  }),
}));

jest.mock('../fields/HabitFields', () => ({ HabitFields: () => null }));
jest.mock('../fields/TodoFields', () => ({ TodoFields: () => null }));
jest.mock('../fields/JournalFields', () => ({ JournalFields: () => null }));
jest.mock('../fields/NoteFields', () => ({ NoteFields: () => null }));
jest.mock('../fields/TagEditor', () => ({ TagEditor: () => null }));
jest.mock('../fields/PeopleLinker', () => ({ PeopleLinker: () => null }));

jest.mock(
  'react-native-safe-area-context',
  () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }),
  { virtual: true },
);

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper', () => ({}), {
  virtual: true,
});

// Imports after mocks
import { UnifiedCreateOverlay } from '../UnifiedCreateOverlay';

describe('UnifiedCreateOverlay conversions overflow menu', () => {
  const originalCanonicalFlag = env.feature.canonicalConversions;

  // Lists are no longer a subtype; they are expressed as has_list + list_items
  const baseNote: any = {
    id: 'note-1',
    type: 'note',
    subtype: 'reference',
    body: '- [ ] Pack\n- [x] Brush',
    space_id: null,
    ai_placed: false,
    archived: false,
    why_string: '',
    origin: 'manual',
    canonicalType: 'log',
    labels: [],
    views: undefined,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    owner_id: 'user-1',
    fmt: 'checkboxes',
    tags: null,
    has_list: true,
    list_items: [
      { id: 'item-1', text: 'Pack', checked: false },
      { id: 'item-2', text: 'Brush', checked: true },
    ],
  };

  afterEach(() => {
    (env.feature as any).canonicalConversions = originalCanonicalFlag;
  });

  const renderOverlay = async (conversionsEnabled: boolean) => {
    (env.feature as any).canonicalConversions = conversionsEnabled;

    mockRepo = {
      getById: jest.fn().mockResolvedValue(baseNote),
      create: jest.fn(),
      update: jest.fn(),
    };

    mockAuth = { userId: 'user-1', user: { id: 'user-1' } };
    mockTheme = {
      mode: 'light',
      c: {},
      theme: {
        colors: {
          text: { primary: '#111', secondary: '#444', tertiary: '#777' },
          mint: '#DEF',
          deepTeal: { DEFAULT: '#0AA' },
          border: { DEFAULT: '#DDD' },
          white: '#FFF',
          cream: '#FFF9F0',
          error: '#C00',
        },
      },
      colors: {
        text: { primary: '#111', secondary: '#444', tertiary: '#777' },
        mint: '#DEF',
        deepTeal: { DEFAULT: '#0AA' },
        border: { DEFAULT: '#DDD' },
        white: '#FFF',
        cream: '#FFF9F0',
        error: '#C00',
      },
    };
    mockCortex = { classify: jest.fn() };

    const utils = render(
      <UnifiedCreateOverlay
        visible
        mode="edit"
        initialEntity={{ type: 'log', id: baseNote.id, logSubtype: 'everything_else' }}
        onClose={jest.fn()}
      />,
    );

    return { ...utils, repoMock: mockRepo };
  };

  it('shows overflow button when conversions flag is enabled and checklist present', async () => {
    const { getByTestId } = await renderOverlay(true);

    await waitFor(() => expect(getByTestId('overlay-overflow-button')).toBeTruthy());
  });

  it('hides overflow button when conversions flag is disabled', async () => {
    const { queryByTestId } = await renderOverlay(false);

    await waitFor(() => {
      expect(queryByTestId('overlay-overflow-button')).toBeNull();
    });
  });
});
