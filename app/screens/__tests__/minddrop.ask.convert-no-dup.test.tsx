/**
 * Mind Drop ask-mode conversion guard
 * Ensures confirming a low-confidence ask conversion updates the existing
 * unsorted record without creating a duplicate.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { MidConfidenceChips } from '../../components/minddrop/MidConfidenceChips';

type MockDecision = {
  mode: 'ask' | 'auto';
  confidence: number;
  actions: Array<Record<string, unknown>>;
  suggestions: Array<Record<string, unknown>>;
  explanation?: string;
  meta?: Record<string, unknown>;
};

type StoredRecord = {
  id: string;
  type: 'note' | 'todo';
  title: string;
  body: string;
  labels: string[];
  origin: string;
  created_at: string;
  source_message_id: string | null;
  canonicalType?: string | null;
  tags?: string[] | null;
};

type StoredTodo = {
  id: string;
  type: 'todo';
  name: string;
  text: string;
  created_at: string;
  due_date: string | null;
  origin: string;
  tags?: string[] | null;
};

let idCounter = 0;
let store: { notes: StoredRecord[]; todos: StoredTodo[] } = { notes: [], todos: [] };

const buildNow = () => new Date('2025-01-12T09:00:00.000Z').toISOString();

const repoGetByIdImpl = async (id: string) => {
  const inNotes = store.notes.find((record) => record.id === id);
  if (inNotes) return inNotes;
  const inTodos = store.todos.find((record) => record.id === id);
  return inTodos ? { ...inTodos, title: inTodos.name, body: inTodos.text } : null;
};

const repoUpdateImpl = async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
  const noteIndex = store.notes.findIndex((record) => record.id === id);
  if (noteIndex >= 0) {
    const current = store.notes[noteIndex];
    const updatedNote = { ...current, ...patch } as StoredRecord;
    // When converting to todo, move the record into the todos list
    if ((patch.canonicalType ?? patch.canonical_type) === 'todo') {
      store.notes.splice(noteIndex, 1);
      store.todos.unshift({
        id: current.id,
        type: 'todo',
        name: (patch.title as string) ?? current.title,
        text: (patch.body as string) ?? current.body,
        created_at: current.created_at,
        due_date: (patch.due_date as string | undefined) ?? null,
        origin: current.origin,
        tags: (patch.tags as string[] | null | undefined) ?? current.tags ?? null,
      });
    } else {
      store.notes[noteIndex] = updatedNote;
    }
    return { id, ...patch };
  }

  const todoIndex = store.todos.findIndex((record) => record.id === id);
  if (todoIndex >= 0) {
    const current = store.todos[todoIndex];
    const updatedTodo = { ...current, ...patch } as StoredTodo;
    store.todos[todoIndex] = updatedTodo;
    return { id, ...patch };
  }

  return { id, ...patch };
};

const repoCreateImpl = async (payload: Record<string, unknown>) => {
  const id = `unsorted-${++idCounter}`;
  const created_at = buildNow();
  const record: StoredRecord = {
    id,
    type: 'note',
    title: String(payload.title ?? payload.body ?? ''),
    body: String(payload.body ?? payload.title ?? ''),
    labels: Array.isArray(payload.labels) ? (payload.labels as string[]) : [],
    origin: String(payload.origin ?? 'catchall'),
    created_at,
    source_message_id:
      (payload.sourceMessageId as string | undefined) ??
      (payload.source_message_id as string | undefined) ??
      null,
    canonicalType: (payload.canonicalType as string | undefined) ?? null,
    tags: (payload.tags as string[] | undefined) ?? null,
  };
  store.notes.unshift(record);
  return record;
};

const repoFindBySourceMessageIdImpl = async (_type: string, key: string) => {
  return (
    store.notes.find((record) => record.source_message_id === key) ??
    store.todos.find((record) => record.id === key) ??
    null
  );
};

const repoNotesListImpl = async () => [...store.notes];
const repoTodosListImpl = async () => [...store.todos];

const mockRepo = {
  getById: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  getAll: jest.fn(),
  findBySourceMessageId: jest.fn(),
  findNoteBySourceMessageId: jest.fn(),
  notes: {
    list: jest.fn(),
  },
  todos: {
    list: jest.fn(),
  },
  habits: {
    list: jest.fn(),
  },
  remove: jest.fn(),
  query: jest.fn(),
};

const wireRepoMocks = () => {
  mockRepo.getById.mockImplementation(repoGetByIdImpl);
  mockRepo.update.mockImplementation(repoUpdateImpl);
  mockRepo.create.mockImplementation(repoCreateImpl);
  mockRepo.delete.mockResolvedValue(undefined);
  mockRepo.getAll.mockResolvedValue([]);
  mockRepo.findBySourceMessageId.mockImplementation(repoFindBySourceMessageIdImpl);
  mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);
  mockRepo.notes.list.mockImplementation(repoNotesListImpl);
  mockRepo.todos.list.mockImplementation(repoTodosListImpl);
  mockRepo.habits.list.mockResolvedValue([]);
  mockRepo.remove.mockResolvedValue(undefined);
  mockRepo.query.mockResolvedValue([]);
};

wireRepoMocks();

const mockOverlayController = {
  state: {
    visible: false,
    mode: 'create' as const,
    initialEntity: undefined,
    initialSpaceId: null,
    conversionMeta: undefined,
  },
  openCreate: jest.fn(),
  openEdit: jest.fn(),
  openView: jest.fn(),
  close: jest.fn(),
};

const mockDecideWithContext = jest.fn<Promise<MockDecision>, []>(async () => ({
  mode: 'ask',
  confidence: 0.62,
  actions: [],
  suggestions: [
    {
      type: 'create.todo',
      label: 'Add to To-Do List',
      payload: { title: 'Plan retreat agenda' },
    },
  ],
  explanation: 'Low confidence — ask the user to decide',
  meta: {
    intent: { kind: 'todo' },
    classification: {
      type: 'note',
      subtype: 'idea',
      tags: ['planning'],
    },
  },
}));

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user' }, userId: 'test-user' }),
}));

jest.mock('../../../providers/CortexProvider', () => ({
  useCortex: () => ({ decideWithContext: mockDecideWithContext }),
}));

jest.mock('../../../providers/ThemeProvider', () => ({
  useTheme: () => ({
    c: {
      text: '#222',
      mutedText: '#666',
      sageTint: '#E8F4E8',
      goldenPear: '#FFE5B4',
      mossGreen: '#3D5A3D',
      danger: '#DC2626',
    },
    mode: 'light',
  }),
}));

jest.mock('../../../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => mockOverlayController,
}));

jest.mock('../../../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => mockOverlayController,
}));

jest.mock('../../../src/hooks/useActionToast', () => ({
  useActionToast: () => ({
    showToast: jest.fn(),
    Toast: () => null,
  }),
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

const resetRepo = () => {
  idCounter = 0;
  store = { notes: [], todos: [] };
  mockRepo.getById.mockReset();
  mockRepo.update.mockReset();
  mockRepo.create.mockReset();
  mockRepo.delete.mockReset();
  mockRepo.getAll.mockReset();
  mockRepo.findBySourceMessageId.mockReset();
  mockRepo.findNoteBySourceMessageId.mockReset();
  mockRepo.notes.list.mockReset();
  mockRepo.todos.list.mockReset();
  mockRepo.habits.list.mockReset();
  mockRepo.remove.mockReset();
  mockRepo.query.mockReset();
  wireRepoMocks();
};

let CatchAllNotepad: React.ComponentType<{ eagerLoad?: boolean }>;

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  CatchAllNotepad = require('../CatchAllNotepad').default as React.ComponentType<{
    eagerLoad?: boolean;
  }>;
});

describe('Mind Drop ask conversion', () => {
  beforeEach(() => {
    resetRepo();
    mockDecideWithContext.mockClear();
    mockDecideWithContext.mockImplementation(async () => ({
      mode: 'ask',
      confidence: 0.62,
      actions: [],
      suggestions: [
        {
          type: 'create.todo',
          label: 'Add to To-Do List',
          payload: { title: 'Plan retreat agenda' },
        },
      ],
      explanation: 'Low confidence — ask the user to decide',
      meta: {
        intent: { kind: 'todo' },
        classification: {
          type: 'note',
          subtype: 'idea',
          tags: ['planning'],
        },
      },
    }));
  });

  it('reuses the unsorted record when confirming todo conversion', async () => {
    const { getByTestId, queryByTestId, UNSAFE_getAllByType } = render(
      <CatchAllNotepad eagerLoad />,
    );

    const input = getByTestId('minddrop-input');
    const submit = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Plan retreat agenda');
    await act(async () => {
      fireEvent.press(submit);
    });

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockDecideWithContext).toHaveBeenCalledTimes(1));
    expect(store.notes[0]?.id).toBe('unsorted-1');

    let chipsInstance: ReturnType<typeof UNSAFE_getAllByType>[number] | undefined;
    await waitFor(() => {
      const matches = UNSAFE_getAllByType(MidConfidenceChips) ?? [];
      chipsInstance = matches.find((inst) => inst.props.variant === 'category');
      expect(chipsInstance).toBeTruthy();
    });
    if (!chipsInstance) throw new Error('Category chips instance missing');

    expect(chipsInstance.props.categoryChips.map((chip: { kind: string }) => chip.kind)).toContain(
      'todo',
    );

    await act(async () => {
      await chipsInstance!.props.onDirectPick('todo');
    });

    await waitFor(() => expect(mockRepo.update).toHaveBeenCalledTimes(1));
    expect(mockRepo.create).toHaveBeenCalledTimes(1);

    const updateCall = mockRepo.update.mock.calls[0]?.[0];
    expect(updateCall?.id).toBe('unsorted-1');
    expect(updateCall?.patch).toEqual(
      expect.objectContaining({
        canonicalType: 'todo',
        why_string: expect.stringContaining('Confirmed as to-do via category chip'),
      }),
    );

    expect(mockOverlayController.openCreate).not.toHaveBeenCalled();
    expect(store.todos[0]?.id).toBe('unsorted-1');
    expect(store.notes.find((record) => record.id === 'unsorted-1')).toBeUndefined();
  });
});
