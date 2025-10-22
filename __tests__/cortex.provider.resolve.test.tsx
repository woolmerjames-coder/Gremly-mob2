/**
 * Phase 10.4: CortexProvider context resolution tests
 * Verifies that decideWithContext enriches context with space defaults and user prefs
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { CortexProvider, useCortex } from '../providers/CortexProvider';
import * as RepoProvider from '../providers/RepoProvider';
import * as cortexDecideModule from '../lib/cortex/cortexDecide';

// Mock dependencies
jest.mock('../lib/cortex/cortexDecide', () => ({
  cortexDecide: jest.fn(),
}));

describe('CortexProvider context resolution (Phase 10.4)', () => {
  let mockRepo: any;
  let mockCortexDecide: jest.SpyInstance;

  beforeEach(() => {
    // Mock repo methods
    mockRepo = {
      getSpaceDefaults: jest.fn(),
      getCortexPrefs: jest.fn(),
    };

    jest.spyOn(RepoProvider, 'useRepo').mockReturnValue(mockRepo as any);

    // Mock cortexDecide
    mockCortexDecide = cortexDecideModule.cortexDecide as jest.Mock;
    mockCortexDecide.mockResolvedValue({
      actions: [],
      mode: 'keep' as const,
      confidence: 0.5,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('resolveDecisionContext', () => {
    it('should enrich context with space defaults when activeSpaceId present', async () => {
      const spaceDefaults = {
        tone: 'warm' as const,
        allowedTypes: ['todo' as const, 'habit' as const],
        preferredListKeys: ['shopping', 'packing'],
      };

      mockRepo.getSpaceDefaults.mockResolvedValue(spaceDefaults);
      mockRepo.getCortexPrefs.mockResolvedValue(null);

      const wrapper = ({ children }: any) => <CortexProvider>{children}</CortexProvider>;
      const { result } = renderHook(() => useCortex(), { wrapper });

      let enriched: any;
      await act(async () => {
        enriched = await result.current.resolveDecisionContext({
          userId: 'user-1',
          activeSpaceId: 'space-123',
          uiSurface: 'chat',
        });
      });

      expect(mockRepo.getSpaceDefaults).toHaveBeenCalledWith('space-123');
      expect(enriched.spaceDefaults).toEqual(spaceDefaults);
    });

    it('should enrich context with user tone preference from cortex_preferences', async () => {
      mockRepo.getSpaceDefaults.mockResolvedValue(null);
      mockRepo.getCortexPrefs.mockResolvedValue({
        id: 'pref-1',
        owner_id: 'user-1',
        tone: 'direct',
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      });

      const wrapper = ({ children }: any) => <CortexProvider>{children}</CortexProvider>;
      const { result } = renderHook(() => useCortex(), { wrapper });

      let enriched: any;
      await act(async () => {
        enriched = await result.current.resolveDecisionContext({
          userId: 'user-1',
          activeSpaceId: null,
          uiSurface: 'overlay',
        });
      });

      expect(mockRepo.getCortexPrefs).toHaveBeenCalledWith('user-1');
      expect(enriched.userPrefsTone).toBe('direct');
    });

    it('should enrich with both space defaults and user prefs', async () => {
      const spaceDefaults = { tone: 'calm' as const };
      const userPrefs = {
        id: 'pref-1',
        owner_id: 'user-1',
        tone: 'warm',
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };

      mockRepo.getSpaceDefaults.mockResolvedValue(spaceDefaults);
      mockRepo.getCortexPrefs.mockResolvedValue(userPrefs);

      const wrapper = ({ children }: any) => <CortexProvider>{children}</CortexProvider>;
      const { result } = renderHook(() => useCortex(), { wrapper });

      let enriched: any;
      await act(async () => {
        enriched = await result.current.resolveDecisionContext({
          userId: 'user-1',
          activeSpaceId: 'space-456',
          uiSurface: 'chat',
        });
      });

      expect(enriched.spaceDefaults).toEqual(spaceDefaults);
      expect(enriched.userPrefsTone).toBe('warm');
    });

    it('should not fetch space defaults when activeSpaceId is null', async () => {
      mockRepo.getCortexPrefs.mockResolvedValue(null);

      const wrapper = ({ children }: any) => <CortexProvider>{children}</CortexProvider>;
      const { result } = renderHook(() => useCortex(), { wrapper });

      await act(async () => {
        await result.current.resolveDecisionContext({
          userId: 'user-1',
          activeSpaceId: null,
          uiSurface: 'overlay',
        });
      });

      expect(mockRepo.getSpaceDefaults).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully and return base context', async () => {
      mockRepo.getSpaceDefaults.mockRejectedValue(new Error('DB error'));
      mockRepo.getCortexPrefs.mockRejectedValue(new Error('DB error'));

      const wrapper = ({ children }: any) => <CortexProvider>{children}</CortexProvider>;
      const { result } = renderHook(() => useCortex(), { wrapper });

      let enriched: any;
      await act(async () => {
        enriched = await result.current.resolveDecisionContext({
          userId: 'user-1',
          activeSpaceId: 'space-123',
          uiSurface: 'chat',
        });
      });

      // Should not throw and return base context
      expect(enriched.userId).toBe('user-1');
      expect(enriched.activeSpaceId).toBe('space-123');
    });
  });

  describe('decideWithContext', () => {
    it('should call resolveDecisionContext then cortexDecide', async () => {
      const spaceDefaults = { tone: 'warm' as const };
      mockRepo.getSpaceDefaults.mockResolvedValue(spaceDefaults);
      mockRepo.getCortexPrefs.mockResolvedValue(null);

      const wrapper = ({ children }: any) => <CortexProvider>{children}</CortexProvider>;
      const { result } = renderHook(() => useCortex(), { wrapper });

      await act(async () => {
        await result.current.decideWithContext(
          { text: 'buy milk' },
          {
            userId: 'user-1',
            activeSpaceId: 'space-123',
            uiSurface: 'chat',
          },
        );
      });

      // Should have fetched defaults
      expect(mockRepo.getSpaceDefaults).toHaveBeenCalledWith('space-123');

      // Should have called cortexDecide with enriched context
      expect(mockCortexDecide).toHaveBeenCalledWith(
        { text: 'buy milk' },
        expect.objectContaining({
          userId: 'user-1',
          activeSpaceId: 'space-123',
          spaceDefaults,
        }),
      );
    });

    it('should work without enrichment when no space or prefs available', async () => {
      mockRepo.getSpaceDefaults.mockResolvedValue(null);
      mockRepo.getCortexPrefs.mockResolvedValue(null);

      const wrapper = ({ children }: any) => <CortexProvider>{children}</CortexProvider>;
      const { result } = renderHook(() => useCortex(), { wrapper });

      await act(async () => {
        await result.current.decideWithContext(
          { text: 'task' },
          {
            userId: 'user-1',
            activeSpaceId: null,
            uiSurface: 'overlay',
          },
        );
      });

      expect(mockCortexDecide).toHaveBeenCalledWith(
        { text: 'task' },
        expect.objectContaining({
          userId: 'user-1',
          activeSpaceId: null,
        }),
      );
    });
  });

  describe('backward compatibility', () => {
    it('should still export cortexDecide for raw usage', () => {
      const wrapper = ({ children }: any) => <CortexProvider>{children}</CortexProvider>;
      const { result } = renderHook(() => useCortex(), { wrapper });

      expect(result.current.cortexDecide).toBeDefined();
      expect(typeof result.current.cortexDecide).toBe('function');
    });

    it('should still export classify for legacy usage', () => {
      const wrapper = ({ children }: any) => <CortexProvider>{children}</CortexProvider>;
      const { result } = renderHook(() => useCortex(), { wrapper });

      expect(result.current.classify).toBeDefined();
      expect(typeof result.current.classify).toBe('function');
    });
  });
});
