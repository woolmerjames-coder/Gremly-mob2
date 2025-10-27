import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { act } from 'react-test-renderer';

// Ensure feature flag path resolves; Trust Builders shows regardless, but keep consistency
jest.mock('@/src/config/featureFlags', () => ({ MIND_DROP_V2: true }));

// Mock navigation (setOptions used by screen)
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      setOptions: jest.fn(),
      navigate: jest.fn(),
      canGoBack: () => true,
      goBack: jest.fn(),
    }),
  };
});

// Mock Auth
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({ userId: 'user-1' }),
}));

// Test-time clock control
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

// Utilities
const isoNow = () => new Date().toISOString();

// Mutable data used by repo.list mocks
let mockNotes: any[];
let mockTodos: any[];
let mockHabits: any[];
const mockNotesList = jest.fn(async (_opts?: { createdAfter?: string }) => [...mockNotes]);
const mockTodosList = jest.fn(async (_opts?: { createdAfter?: string }) => [...mockTodos]);
const mockHabitsList = jest.fn(async (_opts?: { createdAfter?: string }) => [...mockHabits]);

const makeItem = (type: 'note' | 'todo' | 'habit', id: string) => ({
  id,
  type,
  created_at: isoNow(),
});

// Mocks that we can mutate across tests
const mockCreate = jest.fn(async (input: any) => {
  // Simulate record creation and add to lists used by refreshOrganizedToday
  const id = input?.type?.slice(0, 1) + String(Math.floor(Math.random() * 10000));
  const rec = { id, type: input.type, created_at: isoNow() };
  if (input.type === 'note') mockNotes.push(rec);
  if (input.type === 'todo') mockTodos.push(rec);
  if (input.type === 'habit') mockHabits.push(rec);
  return rec;
});

// Default repo mock; per-test we reset notes/todos/habits
jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: mockCreate,
    notes: { list: mockNotesList },
    todos: { list: mockTodosList },
    habits: { list: mockHabitsList },
  }),
}));

// Component under test
import CatchAllNotepad from '../app/screens/CatchAllNotepad';
import { restoreConsole } from './setup/console.silence';

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

function setTodayCounts(n: number, t: number, h: number) {
  mockNotes = Array.from({ length: n }, (_, i) => makeItem('note', `n${i + 1}`));
  mockTodos = Array.from({ length: t }, (_, i) => makeItem('todo', `t${i + 1}`));
  mockHabits = Array.from({ length: h }, (_, i) => makeItem('habit', `h${i + 1}`));
}

describe('Mind Drop Trust Builders', () => {
  test('renders trust row and first line', async () => {
    setTodayCounts(0, 0, 0);
    render(<CatchAllNotepad />);

    const row = screen.getByTestId('minddrop-trust');
    expect(row).toBeTruthy();

    // First message is the no-formatting tip
    expect(screen.getByText(/No formatting needed/i)).toBeTruthy();
  });

  test('cycles every 4s through messages', async () => {
    setTodayCounts(0, 0, 0);
    render(<CatchAllNotepad />);

    // Allow effects to run and interval to be scheduled
    await Promise.resolve();
    await Promise.resolve();

    // 0: No formatting needed
    expect(screen.getByText(/No formatting needed/i)).toBeTruthy();

    // 1: count line
    advance(4000);
    expect(screen.getByText(/thoughts organized today/i)).toBeTruthy();

    // 2: Most people drop...
    advance(4000);
    expect(screen.getByText(/Most people drop/i)).toBeTruthy();

    // 3: Voice input coming soon!
    advance(4000);
    expect(screen.getByText(/Voice input coming soon/i)).toBeTruthy();

    // 4: Your mind’s safe here.
    advance(4000);
    expect(screen.getByText(/Your mind.*safe here/i)).toBeTruthy();

    // 5 -> back to 0 (loop)
    advance(4000);
    expect(screen.getByText(/No formatting needed/i)).toBeTruthy();
  });

  test.skip('uses real count from repo lists', async () => {
    restoreConsole();
    // Keep fake timers for stability; drive intervals manually
    setTodayCounts(1, 1, 1); // total 3
    render(<CatchAllNotepad trustCycleMs={20} trustRefreshMs={25} />);

    // Allow initial async effects/microtasks to run so refreshOrganizedToday fires
    await act(async () => {});
    // Initial refresh should have fired synchronously after mount
    expect(mockNotesList).toHaveBeenCalled();
    expect(mockTodosList).toHaveBeenCalled();
    expect(mockHabitsList).toHaveBeenCalled();

    // Advance one cycle to hit the count line (index 1)
    act(() => {
      jest.advanceTimersByTime(20);
    });

    const trustText = screen.getByTestId('minddrop-trust-text');
    const text = (trustText as any).props?.children;
    const s = Array.isArray(text) ? text.join('') : String(text);
    expect(/\bthoughts? organized today\b/i.test(s)).toBe(true);
  });

  test.skip('refreshes count after submit', async () => {
    restoreConsole();
    // Keep fake timers; rely on await/act for async boundaries
    setTodayCounts(0, 0, 0);
    render(<CatchAllNotepad trustCycleMs={20} trustRefreshMs={25} />);

    // Type and submit to create a note (free mode)
    const input = screen.getByTestId('minddrop-input');
    fireEvent.changeText(input, 'hello world');
    const submit = screen.getByTestId('minddrop-submit-button');
    fireEvent.press(submit);

    // Allow state updates to settle
    await act(async () => {});

    // Ensure save actually executed
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Assert that list APIs were called again post-submit (mount performs one refresh)
    await act(async () => {});
    const totalListCalls =
      mockNotesList.mock.calls.length +
      mockTodosList.mock.calls.length +
      mockHabitsList.mock.calls.length;
    expect(totalListCalls).toBeGreaterThanOrEqual(4); // initial 3 lists at mount + at least one more after submit
  });
});
