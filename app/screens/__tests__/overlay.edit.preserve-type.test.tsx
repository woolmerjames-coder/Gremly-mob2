/**
 * UnifiedOverlayV2 canonical type preservation tests.
 * Ensures editing existing entities keeps their canonical type annotations.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UnifiedOverlayV2 } from '../../../components/overlay/UnifiedOverlayV2';

const mockRepo = {
  update: jest.fn(),
  create: jest.fn(),
  listSpaces: jest.fn().mockResolvedValue([]),
  listTags: jest.fn().mockResolvedValue([]),
  listPeople: jest.fn().mockResolvedValue([]),
  linkTag: jest.fn(),
  linkPerson: jest.fn(),
  linkPersonToEntity: jest.fn(),
  countActiveCommitments: jest.fn().mockResolvedValue(0),
  listCommitments: jest.fn().mockResolvedValue([]),
  findBySourceMessageId: jest.fn(),
  findNoteBySourceMessageId: jest.fn(),
  getById: jest.fn(),
};

type UsePhase8LinksState =
  typeof import('../../../components/overlay/hooks/usePhase8LinksState').usePhase8LinksState;

type UseOverlayV2Draft =
  typeof import('../../../components/overlay/useOverlayV2Draft').useOverlayV2Draft;

type ReadOverlayV2Draft =
  typeof import('../../../components/overlay/useOverlayV2Draft').readOverlayV2Draft;

type ClearOverlayV2Draft =
  typeof import('../../../components/overlay/useOverlayV2Draft').clearOverlayV2Draft;

type CanonicalFeatureEnv = typeof import('../../../lib/env').env;

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ userId: 'user-1' }),
}));

jest.mock('../../../providers/ThemeProvider', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        cream: '#FFF9F0',
        white: '#FFFFFF',
        mint: '#B7F7E1',
        deepTeal: { DEFAULT: '#0A2F2E' },
        text: {
          primary: '#1A1A1A',
          secondary: '#4B5563',
          tertiary: '#9CA3AF',
        },
        border: { DEFAULT: '#E7E2D9' },
      },
    },
  }),
}));

jest.mock('../../../components/overlay/hooks/usePhase8LinksState', () => ({
  usePhase8LinksState: (() => ({
    allTags: [],
    currentTags: [],
    loadTags: jest.fn(async () => {}),
    addTag: jest.fn(async () => ({ id: 'tag-1' }) as any),
    linkTag: jest.fn(async () => {}),
    unlinkTag: jest.fn(async () => {}),
    linkedPeople: [],
    loadPeople: jest.fn(async () => {}),
    linkPerson: jest.fn(async () => ({ id: 'link-1' }) as any),
    unlinkPerson: jest.fn(async () => {}),
    clearPendingPeople: jest.fn(),
    pendingTagIds: [],
    pendingPeople: [],
    clearPendingTags: jest.fn(),
    isLoading: false,
  })) as unknown as UsePhase8LinksState,
}));

jest.mock('../../../components/overlay/useOverlayV2Draft', () => ({
  useOverlayV2Draft: ((..._args: Parameters<UseOverlayV2Draft>) => undefined) as UseOverlayV2Draft,
  readOverlayV2Draft: (async (..._args: Parameters<ReadOverlayV2Draft>) =>
    '') as ReadOverlayV2Draft,
  clearOverlayV2Draft: (async (..._args: Parameters<ClearOverlayV2Draft>) =>
    undefined) as ClearOverlayV2Draft,
}));

jest.mock('../../../components/overlay/useOverlayPrefill', () => ({
  __esModule: true,
  default: (() => ({
    suggestedTitle: null,
    suggestedTags: [],
    loading: false,
    error: null,
    refresh: jest.fn(),
  })) as unknown,
}));

jest.mock('../../../lib/events/EventBus', () => ({
  eventBus: {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  },
}));

jest.mock('../../../lib/env', () => {
  const actual = jest.requireActual('../../../lib/env');
  const env = actual.env as CanonicalFeatureEnv;
  return {
    ...actual,
    env: {
      ...env,
      feature: {
        ...env.feature,
        canonicalTypes: true,
      },
    },
  };
});

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const renderOverlay = (entity: Record<string, unknown>) =>
  render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <UnifiedOverlayV2
        visible
        mode="edit"
        onClose={jest.fn()}
        initialEntity={entity as any}
        initialText={null}
        initialSpaceId={null}
      />
    </SafeAreaProvider>,
  );

describe('UnifiedOverlayV2 canonical type preservation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.update.mockResolvedValue({ id: 'todo-123' });
  });

  it('keeps canonicalType todo when editing a todo', async () => {
    const overlay = renderOverlay({
      id: 'todo-123',
      type: 'todo',
      title: 'Plan Q1 objectives',
      details: 'Draft OKRs for the quarter',
      body: 'Draft OKRs for the quarter',
      canonicalType: 'todo',
      origin: 'catchall',
      created_at: '2025-01-10T10:00:00.000Z',
      tags: ['planning'],
    });

    const textInput = await overlay.findByLabelText('Overlay content input');
    fireEvent.changeText(textInput, 'Draft OKRs and share with team');

    fireEvent.press(overlay.getByText('Save'));

    await waitFor(() => expect(mockRepo.update).toHaveBeenCalledTimes(1));

    expect(mockRepo.update).toHaveBeenCalledWith({
      id: 'todo-123',
      patch: expect.objectContaining({
        canonicalType: 'todo',
        type: 'todo',
        title: expect.stringContaining('Draft OKRs'),
      }),
    });
  });

  it('keeps canonicalType log when editing a canonical log', async () => {
    mockRepo.update.mockResolvedValue({ id: 'note-42' });

    const overlay = renderOverlay({
      id: 'note-42',
      type: 'note',
      title: 'Daily reflection',
      body: 'Felt productive after the morning session.',
      subtype: 'journal',
      canonicalType: 'log',
      canonicalSubtype: 'journal',
      origin: 'catchall',
      created_at: '2025-01-08T08:00:00.000Z',
      tags: ['journal'],
    });

    const textInput = await overlay.findByLabelText('Overlay content input');
    fireEvent.changeText(textInput, 'Felt productive and wrapped major tasks.');

    fireEvent.press(overlay.getByText('Save'));

    await waitFor(() => expect(mockRepo.update).toHaveBeenCalledTimes(1));

    expect(mockRepo.update).toHaveBeenCalledWith({
      id: 'note-42',
      patch: expect.objectContaining({
        canonicalType: 'log',
        type: 'note',
      }),
    });
  });
});
