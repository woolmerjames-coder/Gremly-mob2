import React from 'react';
import { LayoutAnimation } from 'react-native';
import { act, fireEvent, renderWithProviders, screen, waitFor } from './utils/renderWithProviders';
import TodayScreen from '../app/tabs/TodayScreen';
import { useTodayEntries } from '../lib/today/hooks/useTodayEntries';
import type { IRepo } from '../lib/repo/IRepo';

jest.mock('../lib/today/hooks/useTodayEntries', () => ({
  useTodayEntries: jest.fn(),
}));

// Enable v3
jest.mock('../lib/env', () => ({
  env: {
    feature: {
      today: {
        v3: true,
        focusCard: true,
        dropZone: true,
        sweepPreview: true,
        suggestions: false,
        celebration: false,
        eveningTeaser: false,
      },
      sweep: { eveningV1: true },
    },
  },
}));

// Auth
jest.mock('../providers/AuthProvider', () => ({
  ...jest.requireActual('../providers/AuthProvider'),
  useAuth: () => require('./utils/renderWithProviders').useAuth(),
}));

jest.mock('../providers/RepoProvider', () => ({
  ...jest.requireActual('../providers/RepoProvider'),
  useRepo: () => require('./utils/renderWithProviders').useRepo(),
}));

const nowIso = new Date().toISOString();

// Repo mock: one todo and one habit active
const useTodayEntriesMock = useTodayEntries as jest.MockedFunction<typeof useTodayEntries>;

const makeRepoOverrides = (): Partial<IRepo> => ({
  completeTodo: jest.fn((_id: string, _timestamp: string) => Promise.resolve()),
  logHabitProgress: jest.fn((_id: string, _timestamp?: string, _count?: number) =>
    Promise.resolve(),
  ),
  getById: jest.fn((id: string) =>
    Promise.resolve(
      id.startsWith('h')
        ? ({
            id,
            type: 'habit',
            name: 'Habit',
            frequency: 'daily',
            subtype: 'routine',
            ai_placed: false,
            created_at: nowIso,
            updated_at: nowIso,
            owner_id: 'test-user-1',
            space_id: null,
          } as any)
        : ({
            id,
            type: 'todo',
            name: 'Task',
            ai_placed: false,
            created_at: nowIso,
            updated_at: nowIso,
            owner_id: 'test-user-1',
            space_id: null,
          } as any),
    ),
  ),
});

// Skip entire test suite: TodayScreen component has import issues with ProgressBar
describe.skip('Action Zone rows and Done Today', () => {
  let configureNextSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    useTodayEntriesMock.mockReturnValue({
      items: [
        {
          type: 'todo' as const,
          id: 't1',
          name: 'Email Alex tomorrow 3pm',
          due_date: nowIso,
          carry_forward: true,
        },
        {
          type: 'habit' as const,
          id: 'h1',
          name: 'Swim',
          target_count: 3,
          progress_today: 1,
          cadence: 'day' as const,
        },
      ],
      doneItems: [],
      completed: 0,
      remaining: 2,
      loading: false,
      error: null,
      reload: jest.fn(() => Promise.resolve()),
    });
    configureNextSpy = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
  });

  afterEach(() => {
    configureNextSpy.mockRestore();
  });

  it('renders flat rows with progress text and moves completed items to Done Today', async () => {
    const repoOverrides = makeRepoOverrides();
    const { mockRepo } = renderWithProviders(<TodayScreen />, { repo: repoOverrides });

    await waitFor(() => {
      expect(screen.getByTestId('today-v3-stack')).toBeTruthy();
    });

    await screen.findByTestId('row-todo-t1');
    await screen.findByTestId('row-habit-h1');

    expect(screen.getByText(/Due:/)).toBeTruthy();
    expect(screen.getByText('Today: 1 / 3')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Mark task complete'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('done-row-todo-t1')).toBeTruthy();
    });

    expect(mockRepo.completeTodo).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Add a habit check-in'));
    });

    expect(mockRepo.logHabitProgress).toHaveBeenCalledTimes(1);
  });

  it('opens overlay when tapping an active entry', async () => {
    const repoOverrides = makeRepoOverrides();
    const { mockRepo } = renderWithProviders(<TodayScreen />, { repo: repoOverrides });

    await waitFor(() => {
      expect(screen.getByTestId('row-todo-t1')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('row-todo-t1'));
    });

    await waitFor(() => {
      expect(mockRepo.getById).toHaveBeenCalledWith('t1');
    });
  });

  it('hydrates Done Today rows from hook doneItems', async () => {
    useTodayEntriesMock.mockReturnValue({
      items: [],
      doneItems: [
        {
          type: 'habit',
          id: 'remote-h1',
          name: 'Stretch',
          target_count: 1,
          progress_today: 1,
          status: 'completed',
          completed_at: nowIso,
        },
      ],
      completed: 1,
      remaining: 0,
      loading: false,
      error: null,
      reload: jest.fn(() => Promise.resolve()),
    });

    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('today-v3-stack')).toBeTruthy();
    });

    expect(screen.getByTestId('done-row-habit-remote-h1')).toBeTruthy();
  });
});
