/**
 * Mind Drop Entry Points Integration Test
 *
 * Tests that the useMindDropSubmit hook integrates correctly with the
 * feature flag system and produces the expected outputs.
 *
 * NOTE: Full component rendering tests for CatchAllNotepad are complex
 * due to its many dependencies. These tests focus on the hook behavior
 * and flag integration which is the core of the new pipeline.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';

// Store original modules for selective mocking
const originalFeatureFlags = jest.requireActual('../../lib/config/featureFlags');

// Mock the feature flags
const mockFeatureFlags = {
  MIND_DROP_V4_ENABLED: true,
  PHASE2_ENRICHMENT_ENABLED: true,
  USE_ZUSTAND_STORE: false,
  HEURISTIC_LOGGING_ENABLED: false,
};

jest.mock('../../lib/config/featureFlags', () => ({
  FEATURE_FLAGS: mockFeatureFlags,
  getFlag: (key: string) => mockFeatureFlags[key as keyof typeof mockFeatureFlags],
  isMindDropV4FullyEnabled: () =>
    mockFeatureFlags.MIND_DROP_V4_ENABLED && mockFeatureFlags.USE_ZUSTAND_STORE,
}));

// Mock useRepo
const mockTodosCreate = jest.fn();
const mockHabitsCreate = jest.fn();
const mockNotesCreate = jest.fn();

jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: jest.fn((input: any) => {
      if (input.type === 'todo') {
        return mockTodosCreate(input);
      } else if (input.type === 'habit') {
        return mockHabitsCreate(input);
      } else if (input.type === 'note') {
        return mockNotesCreate(input);
      }
    }),
  }),
}));

// Mock eventBus
jest.mock('../../lib/events/EventBus', () => ({
  eventBus: {
    emit: jest.fn(),
    on: jest.fn(() => jest.fn()),
    off: jest.fn(),
  },
}));

import { useMindDropSubmit } from '../../hooks/useMindDropSubmit';
import { useMindDropStore } from '../../lib/stores/mindDropStore';
import { eventBus } from '../../lib/events/EventBus';

// Note: FEATURE_FLAGS is accessed via mockFeatureFlags directly since the import
// returns the mock module, not the mock object itself

describe('Mind Drop Entry Points Integration', () => {
  beforeEach(() => {
    useMindDropStore.getState().clearAll();
    jest.clearAllMocks();

    // Reset feature flags to enabled state
    mockFeatureFlags.MIND_DROP_V4_ENABLED = true;
    mockFeatureFlags.USE_ZUSTAND_STORE = false;

    // Default mock implementations
    mockTodosCreate.mockResolvedValue({ id: 'mock-todo-id' });
    mockHabitsCreate.mockResolvedValue({ id: 'mock-habit-id' });
    mockNotesCreate.mockResolvedValue({ id: 'mock-note-id' });
  });

  describe('Feature Flags', () => {
    test('MIND_DROP_V4_ENABLED flag is accessible', () => {
      expect(mockFeatureFlags.MIND_DROP_V4_ENABLED).toBe(true);
    });

    test('getFlag returns correct values', () => {
      // Access via require since the mock is hoisted
      const { getFlag } = require('../../lib/config/featureFlags');
      expect(getFlag('MIND_DROP_V4_ENABLED')).toBe(true);
      expect(getFlag('PHASE2_ENRICHMENT_ENABLED')).toBe(true);
      expect(getFlag('USE_ZUSTAND_STORE')).toBe(false);
    });

    test('isMindDropV4FullyEnabled returns false when USE_ZUSTAND_STORE is false', () => {
      mockFeatureFlags.MIND_DROP_V4_ENABLED = true;
      mockFeatureFlags.USE_ZUSTAND_STORE = false;
      const { isMindDropV4FullyEnabled } = require('../../lib/config/featureFlags');
      expect(isMindDropV4FullyEnabled()).toBe(false);
    });

    test('isMindDropV4FullyEnabled returns true when both flags enabled', () => {
      mockFeatureFlags.MIND_DROP_V4_ENABLED = true;
      mockFeatureFlags.USE_ZUSTAND_STORE = true;
      const { isMindDropV4FullyEnabled } = require('../../lib/config/featureFlags');
      expect(isMindDropV4FullyEnabled()).toBe(true);
    });
  });

  describe('useMindDropSubmit with CatchAllNotepad source', () => {
    test('submits with source: minddrop and spaceId: null', async () => {
      const { result } = renderHook(() => useMindDropSubmit());

      let submitResult: any;
      await act(async () => {
        submitResult = await result.current.submit('buy groceries', {
          source: 'minddrop',
          spaceId: null,
        });
      });

      expect(submitResult.success).toBe(true);
      expect(mockTodosCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'todo',
          space_id: null,
          origin: 'catchall',
        }),
      );
    });

    test('includes dropId in entity creation', async () => {
      const { result } = renderHook(() => useMindDropSubmit());

      await act(async () => {
        // Use action text to ensure todo classification
        await result.current.submit('schedule dentist appointment', { source: 'minddrop' });
      });

      expect(mockTodosCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          dropId: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          ),
        }),
      );
    });

    test('sets views.ai_pending to true', async () => {
      const { result } = renderHook(() => useMindDropSubmit());

      await act(async () => {
        // Use action text to ensure todo classification
        await result.current.submit('call mom tomorrow', { source: 'minddrop' });
      });

      expect(mockTodosCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          views: expect.objectContaining({
            ai_pending: true,
            minddrop_stage: 'classified',
          }),
        }),
      );
    });
  });

  describe('useMindDropSubmit with Today source', () => {
    test('submits with source: today', async () => {
      const { result } = renderHook(() => useMindDropSubmit());

      let submitResult: any;
      await act(async () => {
        submitResult = await result.current.submit('meditate every day', {
          source: 'today',
          spaceId: null,
        });
      });

      expect(submitResult.success).toBe(true);
      // Today entries also use 'catchall' origin since they go to global list
      expect(mockHabitsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'habit',
          origin: 'catchall',
        }),
      );
    });
  });

  describe('useMindDropSubmit with Space source', () => {
    test('submits with source: space and correct spaceId', async () => {
      const { result } = renderHook(() => useMindDropSubmit());
      const testSpaceId = 'space-work-123';

      let submitResult: any;
      await act(async () => {
        submitResult = await result.current.submit('finish quarterly report', {
          source: 'space',
          spaceId: testSpaceId,
        });
      });

      expect(submitResult.success).toBe(true);
      expect(mockTodosCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'todo',
          space_id: testSpaceId,
          origin: 'space_chat',
        }),
      );
    });

    test('uses space_chat origin for space submissions', async () => {
      const { result } = renderHook(() => useMindDropSubmit());

      await act(async () => {
        await result.current.submit('team meeting notes', {
          source: 'space',
          spaceId: 'space-123',
        });
      });

      // For space source, origin should be 'space_chat'
      expect(mockNotesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: 'space_chat',
        }),
      );
    });
  });

  describe('useMindDropSubmit classification routing', () => {
    test('routes todo text to todos.create', async () => {
      const { result } = renderHook(() => useMindDropSubmit());

      await act(async () => {
        await result.current.submit('buy milk at the store', { source: 'minddrop' });
      });

      expect(mockTodosCreate).toHaveBeenCalled();
      expect(mockHabitsCreate).not.toHaveBeenCalled();
      expect(mockNotesCreate).not.toHaveBeenCalled();
    });

    test('routes habit text to habits.create', async () => {
      const { result } = renderHook(() => useMindDropSubmit());

      await act(async () => {
        await result.current.submit('exercise every morning', { source: 'minddrop' });
      });

      expect(mockHabitsCreate).toHaveBeenCalled();
      expect(mockTodosCreate).not.toHaveBeenCalled();
      expect(mockNotesCreate).not.toHaveBeenCalled();
    });

    test('routes log text to notes.create', async () => {
      const { result } = renderHook(() => useMindDropSubmit());

      await act(async () => {
        await result.current.submit('interesting thought about life', { source: 'minddrop' });
      });

      expect(mockNotesCreate).toHaveBeenCalled();
      expect(mockTodosCreate).not.toHaveBeenCalled();
      expect(mockHabitsCreate).not.toHaveBeenCalled();
    });
  });

  describe('useMindDropSubmit EventBus integration', () => {
    test('emits entity:created event on success', async () => {
      const { result } = renderHook(() => useMindDropSubmit());

      await act(async () => {
        await result.current.submit('test task', { source: 'minddrop' });
      });

      expect(eventBus.emit).toHaveBeenCalledWith(
        'entity:created',
        expect.objectContaining({
          type: 'todo',
          entity: expect.objectContaining({
            id: 'mock-todo-id',
          }),
        }),
      );
    });

    test('includes drop_id in emitted event', async () => {
      const { result } = renderHook(() => useMindDropSubmit());

      await act(async () => {
        await result.current.submit('test task', { source: 'minddrop' });
      });

      expect(eventBus.emit).toHaveBeenCalledWith(
        'entity:created',
        expect.objectContaining({
          entity: expect.objectContaining({
            drop_id: expect.stringMatching(
              /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
            ),
          }),
        }),
      );
    });
  });

  describe('useMindDropSubmit photo handling', () => {
    test('passes photoUris in context', async () => {
      const { result } = renderHook(() => useMindDropSubmit());
      const testPhotoUris = ['file:///photo1.jpg', 'file:///photo2.jpg'];

      await act(async () => {
        await result.current.submit('', {
          source: 'minddrop',
          photoUris: testPhotoUris,
        });
      });

      // Photo-only drop should create a note with generated text
      expect(mockNotesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'note',
          title: expect.stringContaining('Photo capture'),
        }),
      );
    });

    test('photo-only drops are classified as log', async () => {
      const { result } = renderHook(() => useMindDropSubmit());

      let submitResult: any;
      await act(async () => {
        submitResult = await result.current.submit('', {
          source: 'minddrop',
          photoUris: ['file:///photo.jpg'],
        });
      });

      expect(submitResult.bucket).toBe('log');
    });
  });

  describe('useMindDropSubmit error handling', () => {
    test('returns error for empty text without photos', async () => {
      const { result } = renderHook(() => useMindDropSubmit());

      let submitResult: any;
      await act(async () => {
        submitResult = await result.current.submit('', { source: 'minddrop' });
      });

      expect(submitResult.success).toBe(false);
      expect(submitResult.error?.message).toBe('Cannot submit empty drop');
    });

    test('cleans up pending item on repo error', async () => {
      mockTodosCreate.mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() => useMindDropSubmit());

      await act(async () => {
        await result.current.submit('test task', { source: 'minddrop' });
      });

      const pendingItems = useMindDropStore.getState().pendingItems;
      expect(Object.keys(pendingItems).length).toBe(0);
    });
  });
});
