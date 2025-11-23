/**
 * Tests for views.ai_pending flag lifecycle in V2 and V3 modes
 *
 * Verifies that:
 * - Entities created by successful pipeline have views.ai_pending: false
 * - Unsorted fallback entities have views.ai_pending: true (awaiting processing)
 * - Flag clearing works in both V2 (blocking) and V3 (instant) modes
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import type { CortexResponse } from '../lib/cortex/cortexDecide';

// Mock dependencies
const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  getById: jest.fn(),
  remove: jest.fn(),
  findNoteBySourceMessageId: jest.fn(),
  getAll: jest.fn(() => Promise.resolve([])),
  notes: {
    list: jest.fn(() => Promise.resolve([])),
  },
  todos: {
    list: jest.fn(() => Promise.resolve([])),
  },
  habits: {
    list: jest.fn(() => Promise.resolve([])),
  },
};

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user-123' }, userId: 'test-user-123' }),
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ setOptions: jest.fn() }),
  };
});

jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 100,
}));

const mockDecideWithContext = jest.fn();
jest.mock('../providers/CortexProvider', () => ({
  useCortex: () => ({ decideWithContext: mockDecideWithContext }),
}));

jest.mock('../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => ({
    openCreate: jest.fn(),
  }),
}));

import CatchAllNotepad from '../app/screens/CatchAllNotepad';

describe('views.ai_pending Flag Lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('V2 Mode (Blocking)', () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_MIND_DROP_V3_INSTANT = 'off';
    });

    it('should clear ai_pending flag after successful todo creation', async () => {
      const createdTodo = {
        id: 'todo-123',
        type: 'todo',
        title: 'Buy groceries',
        views: {},
      };

      mockRepo.create.mockResolvedValue(createdTodo);
      mockRepo.getById.mockResolvedValue(createdTodo);
      mockRepo.update.mockResolvedValue({
        ...createdTodo,
        views: { ai_pending: false },
      });
      mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);

      mockDecideWithContext.mockResolvedValue({
        mode: 'auto',
        confidence: 0.85,
        actions: [
          {
            type: 'create.todo',
            payload: {
              title: 'Buy groceries',
            },
          },
        ],
        suggestions: [],
      });

      const { getByPlaceholderText, getByTestId } = render(<CatchAllNotepad />);

      const input = getByPlaceholderText(/Mind Drop/i);
      const submitButton = getByTestId('submit-button');

      fireEvent.changeText(input, 'Buy groceries');

      await act(async () => {
        fireEvent.press(submitButton);
      });

      // Wait for pipeline completion
      await waitFor(
        () => {
          expect(mockRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({
              id: 'todo-123',
              patch: expect.objectContaining({
                views: expect.objectContaining({
                  ai_pending: false,
                }),
              }),
            }),
          );
        },
        { timeout: 3000 },
      );
    });

    it('should clear ai_pending for multiple created entities (todo + note + habit)', async () => {
      const createdTodo = { id: 'todo-1', type: 'todo', title: 'Task', views: {} };
      const createdNote = { id: 'note-1', type: 'note', body: 'Note', views: {} };
      const createdHabit = { id: 'habit-1', type: 'habit', title: 'Run', views: {} };

      mockRepo.create.mockResolvedValueOnce(createdTodo);
      mockRepo.create.mockResolvedValueOnce(createdNote);
      mockRepo.create.mockResolvedValueOnce(createdHabit);

      mockRepo.getById.mockImplementation(async (id: string) => {
        if (id === 'todo-1') return createdTodo;
        if (id === 'note-1') return createdNote;
        if (id === 'habit-1') return createdHabit;
        return null;
      });

      mockRepo.update.mockResolvedValue({ views: { ai_pending: false } });
      mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);

      mockDecideWithContext.mockResolvedValue({
        mode: 'auto',
        confidence: 0.85,
        actions: [
          {
            type: 'create.todo',
            payload: { title: 'Task' },
          },
          {
            type: 'create.note',
            payload: { body: 'Note' },
          },
          {
            type: 'create.habit',
            payload: { name: 'Run' },
          },
        ],
        suggestions: [],
      });

      const { getByPlaceholderText, getByTestId } = render(<CatchAllNotepad />);

      const input = getByPlaceholderText(/Mind Drop/i);
      const submitButton = getByTestId('submit-button');

      fireEvent.changeText(input, 'Complex input');

      await act(async () => {
        fireEvent.press(submitButton);
      });

      // Wait for all updates
      await waitFor(
        () => {
          // Should update all three entities
          expect(mockRepo.update).toHaveBeenCalledTimes(3);

          // Verify each update clears ai_pending
          expect(mockRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({
              id: 'todo-1',
              patch: expect.objectContaining({
                views: expect.objectContaining({ ai_pending: false }),
              }),
            }),
          );

          expect(mockRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({
              id: 'note-1',
              patch: expect.objectContaining({
                views: expect.objectContaining({ ai_pending: false }),
              }),
            }),
          );

          expect(mockRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({
              id: 'habit-1',
              patch: expect.objectContaining({
                views: expect.objectContaining({ ai_pending: false }),
              }),
            }),
          );
        },
        { timeout: 3000 },
      );
    });
  });

  describe('V3 Mode (Instant)', () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_MIND_DROP_V3_INSTANT = 'on';
    });

    it('should clear ai_pending flag in background after instant submit', async () => {
      const createdHabit = {
        id: 'habit-456',
        type: 'habit',
        title: 'Meditate',
        views: {},
      };

      mockRepo.create.mockResolvedValue(createdHabit);
      mockRepo.getById.mockResolvedValue(createdHabit);
      mockRepo.update.mockResolvedValue({
        ...createdHabit,
        views: { ai_pending: false },
      });
      mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);

      mockDecideWithContext.mockResolvedValue({
        mode: 'auto',
        confidence: 0.92,
        actions: [
          {
            type: 'create.habit',
            payload: {
              name: 'Meditate',
              freq: 'daily',
            },
          },
        ],
        suggestions: [],
      });

      const { getByPlaceholderText, getByTestId } = render(<CatchAllNotepad />);

      const input = getByPlaceholderText(/Mind Drop/i);
      const submitButton = getByTestId('submit-button');

      fireEvent.changeText(input, 'Meditate daily');

      await act(async () => {
        fireEvent.press(submitButton);
      });

      // Input cleared immediately in V3 mode
      expect(input.props.value).toBe('');

      // Wait for background pipeline to clear ai_pending
      await waitFor(
        () => {
          expect(mockRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({
              id: 'habit-456',
              patch: expect.objectContaining({
                views: expect.objectContaining({
                  ai_pending: false,
                }),
              }),
            }),
          );
        },
        { timeout: 3000 },
      );
    });
  });

  describe('Fallback Paths', () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_MIND_DROP_V3_INSTANT = 'off';
    });

    it('should NOT clear ai_pending for unsorted fallback notes (needs processing)', async () => {
      // Simulate pipeline failure leading to unsorted tray
      mockRepo.create.mockRejectedValue(new Error('Classification failed'));
      mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);

      // Mock addUnsorted to capture the created note
      let capturedNote: any = null;
      mockRepo.create.mockImplementation(async (input: any) => {
        if (input.subtype === 'catchall' && input.labels?.includes('needs_review')) {
          capturedNote = {
            id: 'unsorted-123',
            ...input,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          return capturedNote;
        }
        throw new Error('Unexpected create call');
      });

      mockDecideWithContext.mockRejectedValue(new Error('AI service unavailable'));

      const { getByPlaceholderText, getByTestId } = render(<CatchAllNotepad />);

      const input = getByPlaceholderText(/Mind Drop/i);
      const submitButton = getByTestId('submit-button');

      fireEvent.changeText(input, 'Ambiguous text');

      await act(async () => {
        fireEvent.press(submitButton);
      });

      // Wait for fallback creation
      await waitFor(
        () => {
          expect(capturedNote).not.toBeNull();
        },
        { timeout: 3000 },
      );

      // Verify unsorted note has ai_pending: true (NOT cleared)
      expect(capturedNote.views).toEqual({ ai_pending: true });

      // Verify update was NOT called to clear the flag (fallback notes stay pending)
      expect(mockRepo.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({
            views: expect.objectContaining({ ai_pending: false }),
          }),
        }),
      );
    });
  });
});
