import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

describe('UnifiedCreateOverlay conversions overflow menu', () => {
  const originalEnv = process.env.EXPO_PUBLIC_CANONICAL_CONVERSIONS;

  const baseNote: any = {
    id: 'note-1',
    type: 'note',
    subtype: 'list',
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
  };

  afterEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_CANONICAL_CONVERSIONS = originalEnv;
  });

  const renderOverlay = async (conversionsEnabled: boolean) => {
    jest.resetModules();

    process.env.EXPO_PUBLIC_CANONICAL_CONVERSIONS = conversionsEnabled ? 'on' : 'off';

    const repoMock = {
      getById: jest.fn().mockResolvedValue(baseNote),
      create: jest.fn(),
      update: jest.fn(),
    };

    jest.doMock('../../../providers/RepoProvider', () => ({
      __esModule: true,
      useRepo: () => repoMock,
    }));

    jest.doMock('../../../providers/AuthProvider', () => ({
      __esModule: true,
      useAuth: () => ({ userId: 'user-1', user: { id: 'user-1' } }),
    }));

    jest.doMock('../../../providers/ThemeProvider', () => ({
      __esModule: true,
      useTheme: () => ({
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
      }),
    }));

    jest.doMock('../../../providers/CortexProvider', () => ({
      __esModule: true,
      useCortex: () => ({ classify: jest.fn() }),
    }));

    jest.doMock('../hooks/usePhase8LinksState', () => ({
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

    jest.doMock('../fields/HabitFields', () => ({ HabitFields: () => null }));
    jest.doMock('../fields/TodoFields', () => ({ TodoFields: () => null }));
    jest.doMock('../fields/JournalFields', () => ({ JournalFields: () => null }));
    jest.doMock('../fields/NoteFields', () => ({ NoteFields: () => null }));
    jest.doMock('../fields/TagEditor', () => ({ TagEditor: () => null }));
    jest.doMock('../fields/PeopleLinker', () => ({ PeopleLinker: () => null }));

    jest.doMock(
      'react-native-safe-area-context',
      () => ({
        useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
      }),
      { virtual: true },
    );

    jest.doMock('react-native/Libraries/Animated/NativeAnimatedHelper', () => ({}), {
      virtual: true,
    });

    const { UnifiedCreateOverlay } = await import('../UnifiedCreateOverlay');

    const utils = render(
      <UnifiedCreateOverlay
        visible
        mode="edit"
        initialEntity={{ type: 'log', id: baseNote.id, logSubtype: 'list' }}
        onClose={jest.fn()}
      />,
    );

    return { ...utils, repoMock };
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
