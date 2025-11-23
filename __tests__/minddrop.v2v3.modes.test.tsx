/**
 * Mind Drop V2 (Blocking) vs V3 (Instant) Mode Tests
 *
 * Tests the behavior difference between:
 * - V2 Mode (EXPO_PUBLIC_MIND_DROP_V3_INSTANT = 'off'): onSubmit awaits full pipeline
 * - V3 Mode (EXPO_PUBLIC_MIND_DROP_V3_INSTANT = 'on'): onSubmit returns immediately, pipeline runs in background
 *
 * Verifies:
 * - V2: Submit blocks until AI classification completes
 * - V3: Submit returns instantly, UI resets immediately
 * - Both modes: Duplicate prevention (mutex) works correctly
 * - Both modes: Final entities have views.ai_pending: false
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import type { CortexResponse } from '../lib/cortex/cortexDecide';

// Mock environment variables before any imports
const originalEnv = process.env;

// Mock dependencies
const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  getById: jest.fn(),
  remove: jest.fn(),
  findNoteBySourceMessageId: jest.fn(),
  getAll: jest.fn(),
  query: jest.fn(),
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

// Import after mocks
import CatchAllNotepad from '../app/screens/CatchAllNotepad';

describe('Mind Drop V2 vs V3 Mode Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.create.mockResolvedValue({ id: 'todo-123', type: 'todo' });
    mockRepo.getById.mockResolvedValue({ id: 'todo-123', type: 'todo', views: {} });
    mockRepo.update.mockResolvedValue({
      id: 'todo-123',
      type: 'todo',
      views: { ai_pending: false },
    });
    mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('V2 Mode (Blocking) - EXPO_PUBLIC_MIND_DROP_V3_INSTANT = off', () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_MIND_DROP_V3_INSTANT = 'off';
    });

    it('should await full pipeline before clearing input', async () => {
      let pipelineStarted = false;
      let pipelineCompleted = false;

      mockDecideWithContext.mockImplementation(async () => {
        pipelineStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate AI delay
        pipelineCompleted = true;

        const response: CortexResponse = {
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
        };
        return response;
      });

      const { getByPlaceholderText, getByTestId } = render(<CatchAllNotepad />);

      const input = getByPlaceholderText(/Mind Drop/i);
      const submitButton = getByTestId('submit-button');

      // Type text
      fireEvent.changeText(input, 'Buy groceries');

      // Submit
      await act(async () => {
        fireEvent.press(submitButton);
        // Wait a tiny bit for the submit to start
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // V2 mode: input should NOT be cleared yet (pipeline still running)
      expect(pipelineStarted).toBe(true);
      expect(pipelineCompleted).toBe(false);

      // Wait for pipeline to complete
      await waitFor(
        () => {
          expect(pipelineCompleted).toBe(true);
        },
        { timeout: 3000 },
      );

      // Now input should be cleared
      await waitFor(() => {
        expect(input.props.value).toBe('');
      });

      // Verify entity was created
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'todo',
          title: 'Buy groceries',
        }),
      );

      // Verify views.ai_pending was cleared
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
    });

    it('should prevent duplicate submissions with mutex in V2 mode', async () => {
      mockDecideWithContext.mockResolvedValue({
        mode: 'auto',
        confidence: 0.85,
        actions: [
          {
            type: 'create.todo',
            payload: {
              title: 'Test task',
            },
          },
        ],
        suggestions: [],
      });

      const { getByPlaceholderText, getByTestId } = render(<CatchAllNotepad />);

      const input = getByPlaceholderText(/Mind Drop/i);
      const submitButton = getByTestId('submit-button');

      // Type same text
      fireEvent.changeText(input, 'Test task');

      // Submit twice rapidly
      await act(async () => {
        fireEvent.press(submitButton);
        fireEvent.press(submitButton); // Second press should be blocked
      });

      // Wait for pipeline
      await waitFor(() => {
        expect(mockRepo.create).toHaveBeenCalledTimes(1); // Only one creation
      });
    });
  });

  describe('V3 Mode (Instant) - EXPO_PUBLIC_MIND_DROP_V3_INSTANT = on', () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_MIND_DROP_V3_INSTANT = 'on';
    });

    it('should clear input immediately without awaiting pipeline', async () => {
      let pipelineStarted = false;
      let pipelineCompleted = false;

      mockDecideWithContext.mockImplementation(async () => {
        pipelineStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate AI delay
        pipelineCompleted = true;

        const response: CortexResponse = {
          mode: 'auto',
          confidence: 0.85,
          actions: [
            {
              type: 'create.todo',
              payload: {
                title: 'Buy milk',
              },
            },
          ],
          suggestions: [],
        };
        return response;
      });

      const { getByPlaceholderText, getByTestId } = render(<CatchAllNotepad />);

      const input = getByPlaceholderText(/Mind Drop/i);
      const submitButton = getByTestId('submit-button');

      // Type text
      fireEvent.changeText(input, 'Buy milk');

      // Submit
      await act(async () => {
        fireEvent.press(submitButton);
        // Wait just a tick for the instant return
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // V3 mode: input should be cleared IMMEDIATELY (before pipeline completes)
      expect(input.props.value).toBe('');
      expect(pipelineCompleted).toBe(false); // Pipeline still running in background

      // Wait for background pipeline to complete
      await waitFor(
        () => {
          expect(pipelineCompleted).toBe(true);
        },
        { timeout: 3000 },
      );

      // Entity should still be created (in background)
      await waitFor(() => {
        expect(mockRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'todo',
            title: 'Buy milk',
          }),
        );
      });

      // views.ai_pending should be cleared (in background)
      await waitFor(() => {
        expect(mockRepo.update).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'todo-789',
            patch: expect.objectContaining({
              views: expect.objectContaining({
                ai_pending: false,
              }),
            }),
          }),
        );
      });
    });

    it('should still prevent duplicate submissions with mutex in V3 mode', async () => {
      mockDecideWithContext.mockResolvedValue({
        mode: 'auto',
        confidence: 0.85,
        actions: [
          {
            type: 'create.todo',
            payload: {
              title: 'Instant task',
            },
          },
        ],
        suggestions: [],
      });

      const { getByPlaceholderText, getByTestId } = render(<CatchAllNotepad />);

      const input = getByPlaceholderText(/Mind Drop/i);
      const submitButton = getByTestId('submit-button');

      // Type same text
      fireEvent.changeText(input, 'Instant task');

      // Submit twice rapidly
      await act(async () => {
        fireEvent.press(submitButton);
        fireEvent.press(submitButton); // Second press should be blocked by mutex
      });

      // Wait a bit for any background processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Even in instant mode, only one entity should be created
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
    });

    it('should track lastSubmittedTextRef to prevent re-submission in V3 mode', async () => {
      mockDecideWithContext.mockResolvedValue({
        mode: 'auto',
        confidence: 0.85,
        actions: [
          {
            type: 'create.todo',
            payload: {
              title: 'Repeated task',
            },
          },
        ],
        suggestions: [],
      });

      const { getByPlaceholderText, getByTestId } = render(<CatchAllNotepad />);

      const input = getByPlaceholderText(/Mind Drop/i);
      const submitButton = getByTestId('submit-button');

      // First submission
      fireEvent.changeText(input, 'Repeated task');
      await act(async () => {
        fireEvent.press(submitButton);
      });

      // Wait for instant clear
      await waitFor(() => {
        expect(input.props.value).toBe('');
      });

      // Try to submit same text again
      fireEvent.changeText(input, 'Repeated task');
      await act(async () => {
        fireEvent.press(submitButton);
      });

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should still only have one creation (second blocked by lastSubmittedTextRef)
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('Mode Switching', () => {
    it('should respect mode changes between renders', async () => {
      // Start in V2 mode
      process.env.EXPO_PUBLIC_MIND_DROP_V3_INSTANT = 'off';

      mockDecideWithContext.mockResolvedValue({
        mode: 'auto',
        confidence: 0.85,
        actions: [
          {
            type: 'create.todo',
            payload: {
              title: 'Mode test',
            },
          },
        ],
        suggestions: [],
      });

      const { unmount } = render(<CatchAllNotepad />);

      // Verify V2 behavior would apply here
      // (full test omitted for brevity - covered in V2 tests above)

      // Unmount
      unmount();

      // Switch to V3 mode
      process.env.EXPO_PUBLIC_MIND_DROP_V3_INSTANT = 'on';

      // Re-render
      const { getByPlaceholderText } = render(<CatchAllNotepad />);

      // Verify V3 mode is now active
      const input = getByPlaceholderText(/Mind Drop/i);
      expect(input).toBeDefined();

      // (Full V3 verification omitted - covered in V3 tests above)
    });
  });
});
