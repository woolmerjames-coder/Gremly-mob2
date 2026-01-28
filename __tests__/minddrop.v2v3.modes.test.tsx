/**
 * Mind Drop V2 (Blocking) vs V3 (Instant) Mode Tests
 *
 * DEPRECATED: These tests were designed for the legacy Mind Drop pipeline
 * that used CortexProvider's decideWithContext and the EXPO_PUBLIC_MIND_DROP_V3_INSTANT flag.
 *
 * With FEATURE_FLAGS.MIND_DROP_V4_ENABLED = true (now the default), the pipeline uses:
 * - useMindDropSubmit hook
 * - runPhase1 for classification
 * - runPhase2 for background enrichment
 *
 * The V2/V3 mode distinction no longer applies to the V4 pipeline.
 * The V4 pipeline always clears the input immediately after successful entity creation.
 *
 * These tests are skipped until they can be rewritten for the V4 pipeline.
 * For V4 pipeline tests, see:
 * - __tests__/lib/minddrop/phase1.test.ts
 * - __tests__/lib/minddrop/phase2.test.ts
 * - app/screens/__tests__/CatchAllNotepad.mutex.duplication.test.tsx
 */

describe.skip('Mind Drop V2 vs V3 Mode Tests (DEPRECATED - V4 is now default)', () => {
  it('placeholder', () => {
    expect(true).toBe(true);
  });
});

/*
 * Original test file preserved below for reference when rewriting for V4
 */

// --- MOCK SUPABASE CLIENT ---
jest.mock('../lib/supabase/client', () => ({
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    })),
    from: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
    })),
    auth: {
      getSession: jest.fn(() =>
        Promise.resolve({ data: { session: { user: { id: 'test-user' } } } }),
      ),
    },
  },
}));

// Mock environment variables before any imports
const originalEnv = process.env;

// Mock runPhase1 - this is what the pipeline actually uses
let mockRunPhase1: jest.Mock;
jest.mock('../lib/minddrop/phase1', () => ({
  runPhase1: jest.fn(),
}));

// Mock runPhase2 - background enrichment
jest.mock('../lib/minddrop/phase2', () => ({
  runPhase2: jest.fn().mockResolvedValue({
    smartTitle: 'Test',
    tags: [],
    extractedDate: null,
    timeEstimateMinutes: null,
  }),
}));

// Mock dependencies
const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  getById: jest.fn(),
  remove: jest.fn(),
  findNoteBySourceMessageId: jest.fn(),
  findTodoByDropId: jest.fn(),
  findHabitByDropId: jest.fn(),
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
  useAuth: () => ({ user: { id: 'test-user-123' } }),
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

// Mock CortexProvider - provides legacy API, not used by current phase1/phase2 pipeline
jest.mock('../providers/CortexProvider', () => ({
  useCortex: () => ({ decideWithContext: jest.fn() }),
}));

// Mock overlay controller - no-op implementation for tests
const mockOverlayController = {
  openCreate: jest.fn(),
  openEdit: jest.fn(),
  openView: jest.fn(),
  close: jest.fn(),
  openClarificationPopup: jest.fn(),
  closeClarificationPopup: jest.fn(),
};

// Import after mocks
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import CatchAllNotepad from '../app/screens/CatchAllNotepad';
import { runPhase1 } from '../lib/minddrop/phase1';

// Skip the main test suite - V4 is now the default pipeline
describe.skip('Mind Drop V2 vs V3 Mode Tests (Original)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunPhase1 = runPhase1 as jest.Mock;

    // Default Phase1 mock - returns todo classification
    mockRunPhase1.mockResolvedValue({
      bucket: 'todo',
      subtype: null,
      confidence: 0.85,
      source: 'heuristic',
    });

    mockRepo.create.mockResolvedValue({ id: 'todo-123', type: 'todo', name: 'Test' });
    mockRepo.getById.mockResolvedValue({ id: 'todo-123', type: 'todo', views: {} });
    mockRepo.update.mockResolvedValue({
      id: 'todo-123',
      type: 'todo',
      views: { ai_pending: false },
    });
    mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);
    mockRepo.findTodoByDropId.mockResolvedValue(null);
    mockRepo.findHabitByDropId.mockResolvedValue(null);
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

      mockRunPhase1.mockImplementation(async () => {
        pipelineStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate AI delay
        pipelineCompleted = true;

        return {
          bucket: 'todo',
          subtype: null,
          confidence: 0.85,
          source: 'api',
        };
      });

      const { getByPlaceholderText, getByTestId } = render(
        <CatchAllNotepad overlayController={mockOverlayController} />,
      );

      const input = getByPlaceholderText(/What's on your mind/i);
      const submitButton = getByTestId('minddrop-submit-button');

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

      // Verify something was created (we don't care about exact type/fields - just that pipeline ran)
      expect(mockRepo.create).toHaveBeenCalled();

      // Verify Phase1 was called
      expect(mockRunPhase1).toHaveBeenCalled();
    });

    it('should prevent duplicate submissions with mutex in V2 mode', async () => {
      mockRunPhase1.mockResolvedValue({
        bucket: 'todo',
        subtype: null,
        confidence: 0.85,
        source: 'heuristic',
      });

      const { getByPlaceholderText, getByTestId } = render(
        <CatchAllNotepad overlayController={mockOverlayController} />,
      );

      const input = getByPlaceholderText(/What's on your mind/i);
      const submitButton = getByTestId('minddrop-submit-button');

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

      mockRunPhase1.mockImplementation(async () => {
        pipelineStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate AI delay
        pipelineCompleted = true;

        return {
          bucket: 'todo',
          subtype: null,
          confidence: 0.85,
          source: 'api',
        };
      });

      const { getByPlaceholderText, getByTestId } = render(
        <CatchAllNotepad overlayController={mockOverlayController} />,
      );

      const input = getByPlaceholderText(/What's on your mind/i);
      const submitButton = getByTestId('minddrop-submit-button');

      // Type text
      fireEvent.changeText(input, 'Buy milk');

      // Wait for submit button to be enabled
      await waitFor(() => {
        expect(submitButton.props.accessibilityState?.disabled).not.toBe(true);
      });

      // Submit
      await act(async () => {
        fireEvent.press(submitButton);
        // Wait just a tick for the instant return
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // V3 mode: input should be cleared IMMEDIATELY (before pipeline completes)
      await waitFor(
        () => {
          expect(input.props.value).toBe('');
        },
        { timeout: 500 },
      );

      // Pipeline should still be running or just finishing
      // Key behavior: input cleared before/during pipeline, not after

      // Wait for background pipeline to complete
      await waitFor(
        () => {
          expect(pipelineCompleted).toBe(true);
        },
        { timeout: 3000 },
      );

      // Verify something was created in background
      expect(mockRepo.create).toHaveBeenCalled();
      expect(mockRunPhase1).toHaveBeenCalled();
    });

    it('should still prevent duplicate submissions with mutex in V3 mode', async () => {
      mockRunPhase1.mockResolvedValue({
        bucket: 'todo',
        subtype: null,
        confidence: 0.85,
        source: 'heuristic',
      });

      const { getByPlaceholderText, getByTestId } = render(
        <CatchAllNotepad overlayController={mockOverlayController} />,
      );

      const input = getByPlaceholderText(/What's on your mind/i);
      const submitButton = getByTestId('minddrop-submit-button');

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
      mockRunPhase1.mockResolvedValue({
        bucket: 'todo',
        subtype: null,
        confidence: 0.85,
        source: 'heuristic',
      });

      const { getByPlaceholderText, getByTestId } = render(
        <CatchAllNotepad overlayController={mockOverlayController} />,
      );

      const input = getByPlaceholderText(/What's on your mind/i);
      const submitButton = getByTestId('minddrop-submit-button');

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

      mockRunPhase1.mockResolvedValue({
        bucket: 'todo',
        subtype: null,
        confidence: 0.85,
        source: 'heuristic',
      });

      const { unmount } = render(<CatchAllNotepad overlayController={mockOverlayController} />);

      // Verify V2 behavior would apply here
      // (full test omitted for brevity - covered in V2 tests above)

      // Unmount
      unmount();

      // Switch to V3 mode
      process.env.EXPO_PUBLIC_MIND_DROP_V3_INSTANT = 'on';

      // Re-render
      const { getByPlaceholderText } = render(
        <CatchAllNotepad overlayController={mockOverlayController} />,
      );

      // Verify V3 mode is now active
      const input = getByPlaceholderText(/What's on your mind/i);
      expect(input).toBeDefined();

      // (Full V3 verification omitted - covered in V3 tests above)
    });
  });
});
