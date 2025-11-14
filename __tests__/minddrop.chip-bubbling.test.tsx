import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import type { CortexResponse } from '../lib/cortex/cortexDecide';
import { useGlobalOverlay } from '../contexts/OverlayContext';

jest.mock('../contexts/OverlayContext', () => ({
  useGlobalOverlay: jest.fn(() => ({
    openCreate: jest.fn(),
    openEdit: jest.fn(),
    close: jest.fn(),
  })),
}));

const mockUseGlobalOverlay = useGlobalOverlay as jest.MockedFunction<typeof useGlobalOverlay>;

const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  findNoteBySourceMessageId: jest.fn(),
  notes: { list: jest.fn(() => Promise.resolve([])) },
  todos: { list: jest.fn(() => Promise.resolve([])) },
  habits: { list: jest.fn(() => Promise.resolve([])) },
};

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user' }, userId: 'test-user' }),
}));

const mockDecideWithContext = jest.fn<Promise<CortexResponse>, any[]>();

jest.mock('../providers/CortexProvider', () => ({
  useCortex: () => ({ decideWithContext: mockDecideWithContext }),
}));

jest.mock('../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({ close: jest.fn() }),
}));

jest.mock('../lib/supabase/client', () => ({
  supabase: {
    rpc: jest.fn(() => Promise.resolve({ data: 'todo-abc', error: null })),
  },
}));

jest.mock('@react-navigation/native', () => ({
  __esModule: true,
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));

jest.mock('@react-navigation/elements', () => ({
  __esModule: true,
  useHeaderHeight: () => 100,
}));

let CatchAllNotepad: React.ComponentType;

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  CatchAllNotepad = require('../app/screens/CatchAllNotepad').default;
});

describe('Mind Drop chip bubbling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.create.mockReset();
    mockRepo.create.mockImplementation(async (payload: Record<string, unknown>) => ({
      id: 'unsorted-test',
      ...payload,
      drop_id: payload?.dropId ?? 'drop-test',
      dropId: payload?.dropId ?? 'drop-test',
      labels: ['catchall', 'needs_review'],
    }));
    mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);
    mockDecideWithContext.mockResolvedValue({
      mode: 'ask',
      confidence: 0.6,
      actions: [],
      suggestions: [
        {
          type: 'create.todo',
          label: 'Add to To-Do List',
          payload: { name: 'Call Mom', undefined_due: true },
        },
      ],
    });
  });

  it('does not invoke overlay open when selecting a category chip', async () => {
    const overlay = {
      openCreate: jest.fn(),
      openEdit: jest.fn(),
      close: jest.fn(),
    };
    mockUseGlobalOverlay.mockReturnValue(overlay as any);

    const { getByTestId, getByText } = render(<CatchAllNotepad />);

    fireEvent.changeText(getByTestId('minddrop-input'), 'Call mom tomorrow at noon');

    await act(async () => {
      fireEvent.press(getByTestId('minddrop-submit-button'));
    });

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalled());
    await waitFor(() => expect(getByText('Add to To-Do List')).toBeTruthy());

    fireEvent.press(getByText('Add to To-Do List'));

    await waitFor(() => {
      expect(overlay.openCreate).not.toHaveBeenCalled();
      expect(overlay.openEdit).not.toHaveBeenCalled();
    });
  });

  it('still allows explicit edit actions to bubble through overlay controller', async () => {
    const overlay = {
      openCreate: jest.fn(),
      openEdit: jest.fn(),
      close: jest.fn(),
    };
    mockUseGlobalOverlay.mockReturnValue(overlay as any);

    mockRepo.notes.list.mockResolvedValue([
      {
        id: 'unsorted-card-1',
        type: 'note',
        body: 'Refine travel plan',
        title: 'Refine travel plan',
        created_at: new Date().toISOString(),
        labels: ['catchall'],
        origin: 'catchall',
      },
    ] as any);

    const { getByText } = render(<CatchAllNotepad />);

    await waitFor(() => expect(getByText('Edit')).toBeTruthy());

    fireEvent.press(getByText('Edit'));

    await waitFor(() => {
      expect(overlay.openEdit).toHaveBeenCalled();
    });
  });
});
