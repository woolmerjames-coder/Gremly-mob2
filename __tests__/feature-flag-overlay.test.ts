/**
 * Feature Flag Tests - EXPO_PUBLIC_UNIFIED_OVERLAY
 *
 * Tests that the feature flag correctly switches between unified and legacy overlays
 */

import { renderHook, act } from '@testing-library/react-native';
import { useOverlayController } from '../hooks/useOverlayController';

// TODO: Skipped due to jest.resetModules() breaking React context in CI
describe.skip('Feature Flag: EXPO_PUBLIC_UNIFIED_OVERLAY', () => {
  const originalEnv = process.env.EXPO_PUBLIC_UNIFIED_OVERLAY;

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.EXPO_PUBLIC_UNIFIED_OVERLAY = originalEnv;
    } else {
      delete process.env.EXPO_PUBLIC_UNIFIED_OVERLAY;
    }
  });

  describe('useOverlayController', () => {
    it('should provide overlay controller interface', () => {
      const { result } = renderHook(() => useOverlayController());

      expect(result.current).toHaveProperty('state');
      expect(result.current).toHaveProperty('openCreate');
      expect(result.current).toHaveProperty('openEdit');
      expect(result.current).toHaveProperty('close');
    });

    it('should start with overlay closed', () => {
      const { result } = renderHook(() => useOverlayController());

      expect(result.current.state.visible).toBe(false);
      expect(result.current.state.mode).toBe('create');
    });

    it('should openCreate with type and spaceId', () => {
      const { result } = renderHook(() => useOverlayController());

      act(() => {
        result.current.openCreate({ type: 'habit', spaceId: 'space-123' });
      });

      expect(result.current.state.visible).toBe(true);
      expect(result.current.state.mode).toBe('create');
      expect(result.current.state.initialEntity?.type).toBe('habit');
      expect(result.current.state.initialSpaceId).toBe('space-123');
    });

    it('should openEdit with record', () => {
      const { result } = renderHook(() => useOverlayController());

      const mockRecord = {
        id: 'habit-1',
        type: 'habit' as const,
        name: 'Test Habit',
        frequency: 'daily' as const,
        subtype: 'start_habit' as const,
        space_id: null,
        ai_placed: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        owner_id: 'user-1',
      };

      act(() => {
        result.current.openEdit({ record: mockRecord, spaceId: 'space-456' });
      });

      expect(result.current.state.visible).toBe(true);
      expect(result.current.state.mode).toBe('edit');
      expect(result.current.state.initialEntity?.type).toBe('habit');
      expect(result.current.state.initialEntity?.id).toBe('habit-1');
      expect(result.current.state.initialSpaceId).toBe('space-456');
    });

    it('should close overlay', () => {
      const { result } = renderHook(() => useOverlayController());

      act(() => {
        result.current.openCreate({ type: 'todo' });
      });

      expect(result.current.state.visible).toBe(true);

      act(() => {
        result.current.close();
      });

      expect(result.current.state.visible).toBe(false);
    });

    it('should map journal note subtype to journal entity type in edit mode', () => {
      const { result } = renderHook(() => useOverlayController());

      const mockJournalNote = {
        id: 'note-1',
        type: 'note' as const,
        title: 'My journal entry',
        body: 'My journal entry',
        subtype: 'journal' as const,
        space_id: null,
        ai_placed: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        owner_id: 'user-1',
      };

      act(() => {
        result.current.openEdit({ record: mockJournalNote });
      });

      expect(result.current.state.initialEntity?.type).toBe('journal');
    });
  });

  describe('Feature Flag Behavior', () => {
    it('should use unified overlay when flag is true', () => {
      process.env.EXPO_PUBLIC_UNIFIED_OVERLAY = 'true';

      // Re-require to pick up env change
      jest.resetModules();
      const { useOverlayController: useController } = require('../hooks/useOverlayController');

      const { result } = renderHook(() => useController());

      // Unified controller should work
      expect(result.current).toBeDefined();
      expect(typeof result.current.openCreate).toBe('function');
    });

    it('should use legacy overlay when flag is false', () => {
      process.env.EXPO_PUBLIC_UNIFIED_OVERLAY = 'false';

      // Re-require to pick up env change
      jest.resetModules();
      const { useOverlayController: useController } = require('../hooks/useOverlayController');

      const { result } = renderHook(() => useController());

      // Legacy controller should work
      expect(result.current).toBeDefined();
      expect(typeof result.current.openCreate).toBe('function');
    });

    it('should default to unified overlay when flag is undefined', () => {
      delete process.env.EXPO_PUBLIC_UNIFIED_OVERLAY;

      // Re-require to pick up env change
      jest.resetModules();
      const { useOverlayController: useController } = require('../hooks/useOverlayController');

      const { result } = renderHook(() => useController());

      // Should default to unified
      expect(result.current).toBeDefined();
    });
  });

  describe('API Consistency', () => {
    it('should have same API regardless of flag value', () => {
      // Test with unified (true)
      process.env.EXPO_PUBLIC_UNIFIED_OVERLAY = 'true';
      jest.resetModules();
      const { useOverlayController: useUnified } = require('../hooks/useOverlayController');
      const { result: unifiedResult } = renderHook(() => useUnified());

      // Test with legacy (false)
      process.env.EXPO_PUBLIC_UNIFIED_OVERLAY = 'false';
      jest.resetModules();
      const { useOverlayController: useLegacy } = require('../hooks/useOverlayController');
      const { result: legacyResult } = renderHook(() => useLegacy());

      // Both should have same methods
      expect(Object.keys(unifiedResult.current).sort()).toEqual(
        Object.keys(legacyResult.current).sort(),
      );

      // Both should have same state shape
      expect(Object.keys(unifiedResult.current.state).sort()).toEqual(
        Object.keys(legacyResult.current.state).sort(),
      );
    });
  });
});
