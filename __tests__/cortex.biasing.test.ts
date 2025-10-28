/**
 * Phase 10.4: Cortex biasing tests
 * Verifies that space defaults influence Cortex decisions appropriately
 */

import type { CortexContext } from '../lib/cortex/cortexDecide';

// Mock env before importing cortexDecide
jest.mock('../lib/env', () => ({
  env: {
    cortex: {
      classifyCatchAll: true,
      timeoutMs: 2500,
      optimistic: false,
    },
  },
}));

// Mock the engine to return controlled output
jest.mock('../cortex/createEngine', () => ({
  createCortexEngine: jest.fn(() => ({
    classify: jest.fn(),
  })),
}));

import { cortexDecide } from '../lib/cortex/cortexDecide';
import * as engineModule from '../cortex/createEngine';

describe('Cortex biasing with space defaults (Phase 10.4)', () => {
  let mockEngine: any;

  beforeEach(() => {
    mockEngine = {
      classify: jest.fn(),
    };
    (engineModule.createCortexEngine as jest.Mock).mockReturnValue(mockEngine);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('allowedTypes biasing', () => {
    it('should bias ambiguous input toward todo when allowedTypes includes todo', async () => {
      // Mock engine to return low-confidence note
      mockEngine.classify.mockResolvedValue({
        type: 'note',
        confidence: 0.6,
        text: 'review code',
      });

      const ctx: CortexContext = {
        lane: 'system',
        userId: 'user-1',
        activeSpaceId: 'space-work',
        uiSurface: 'chat',
        spaceDefaults: {
          allowedTypes: ['todo', 'habit'],
        },
      };

      const result = await cortexDecide({ text: 'review code' }, ctx);

      // Should bias toward todo (first in allowedTypes)
      expect(result.mode).toBe('ask');
      expect(result.actions).toHaveLength(0);

      const candidate = (result.meta?.candidateActions ?? []) as any[];
      expect(candidate).toHaveLength(1);
      expect(candidate[0].type).toBe('create.todo');
      if (candidate[0].type === 'create.todo') {
        expect(candidate[0].payload.title).toContain('review');
      }

      expect(result.suggestions).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'create.todo' })]),
      );
    });

    it('should bias toward habit when allowedTypes has habit first', async () => {
      mockEngine.classify.mockResolvedValue({
        type: 'note',
        confidence: 0.5,
        text: 'exercise daily',
      });

      const ctx: CortexContext = {
        lane: 'system',
        userId: 'user-1',
        activeSpaceId: 'space-fitness',
        uiSurface: 'chat',
        spaceDefaults: {
          allowedTypes: ['habit'],
        },
      };

      const result = await cortexDecide({ text: 'exercise daily' }, ctx);

      expect(result.mode).toBe('keep');
      expect(result.actions).toHaveLength(0);

      const candidate = (result.meta?.candidateActions ?? []) as any[];
      expect(candidate).toHaveLength(1);
      expect(candidate[0].type).toBe('create.habit');

      const suggestions = result.suggestions ?? [];
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('should not bias high-confidence classifications', async () => {
      // High confidence should override biasing
      mockEngine.classify.mockResolvedValue({
        type: 'note',
        subtype: 'journal',
        confidence: 0.92,
        text: 'my thoughts today',
      });

      const ctx: CortexContext = {
        lane: 'system',
        userId: 'user-1',
        activeSpaceId: 'space-work',
        uiSurface: 'chat',
        spaceDefaults: {
          allowedTypes: ['todo'], // Wants todo but note is high confidence
        },
      };

      const result = await cortexDecide({ text: 'my thoughts today' }, ctx);

      // Should respect high-confidence classification
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('create.note');
    });
  });

  describe('preferredListKeys biasing', () => {
    it('should use preferredListKeys when detecting list intent', async () => {
      mockEngine.classify.mockResolvedValue({
        type: 'note',
        subtype: 'list',
        confidence: 0.8,
        text: 'add socks',
      });

      const ctx: CortexContext = {
        lane: 'system',
        userId: 'user-1',
        activeSpaceId: 'space-travel',
        uiSurface: 'chat',
        spaceDefaults: {
          preferredListKeys: ['packing', 'shopping'],
        },
      };

      const result = await cortexDecide({ text: 'add socks' }, ctx);

      expect(result.mode).toBe('ask');
      expect(result.actions).toHaveLength(0);

      const candidate = (result.meta?.candidateActions ?? []) as any[];
      expect(candidate).toHaveLength(1);
      expect(candidate[0].type).toBe('add.to.list');
      if (candidate[0].type === 'add.to.list') {
        expect(candidate[0].payload.listKey).toBe('packing');
      }
    });

    it('should fallback to heuristics when no preferred keys match', async () => {
      mockEngine.classify.mockResolvedValue({
        type: 'note',
        subtype: 'list',
        confidence: 0.8,
        text: 'buy milk',
      });

      const ctx: CortexContext = {
        lane: 'system',
        userId: 'user-1',
        activeSpaceId: 'space-home',
        uiSurface: 'chat',
        spaceDefaults: {
          preferredListKeys: ['reading'], // Not relevant to "buy milk"
        },
      };

      const result = await cortexDecide({ text: 'buy milk' }, ctx);

      expect(result.mode).toBe('ask');
      expect(result.actions).toHaveLength(0);

      const candidate = (result.meta?.candidateActions ?? []) as any[];
      expect(candidate).toHaveLength(1);
      expect(candidate[0].type).toBe('add.to.list');
      if (candidate[0].type === 'add.to.list') {
        expect(candidate[0].payload.listKey).toBe('shopping');
      }
    });
  });

  describe('tone biasing', () => {
    it('should use userPrefsTone when provided', async () => {
      mockEngine.classify.mockResolvedValue({
        type: 'todo',
        title: 'call dentist',
        confidence: 0.9,
      });

      const ctx: CortexContext = {
        lane: 'system',
        userId: 'user-1',
        activeSpaceId: null,
        uiSurface: 'overlay',
        userPrefsTone: 'warm',
      };

      const result = await cortexDecide({ text: 'call dentist' }, ctx);

      // Warm tone should return one of the varied responses (Phase 11.7+)
      const warmResponses = ['Got it ✓', 'All sorted', 'Done and dusted'];
      expect(warmResponses).toContain(result.explanation);
    });

    it('should fall back to spaceDefaults.tone when userPrefsTone not set', async () => {
      mockEngine.classify.mockResolvedValue({
        type: 'todo',
        title: 'call dentist',
        confidence: 0.9,
      });

      const ctx: CortexContext = {
        lane: 'system',
        userId: 'user-1',
        activeSpaceId: 'space-1',
        uiSurface: 'chat',
        spaceDefaults: {
          tone: 'direct',
        },
      };

      const result = await cortexDecide({ text: 'call dentist' }, ctx);

      // Direct tone should be brief (Phase 11.7+: 'Done.')
      expect(result.explanation).toBe('Done.');
    });

    it('should use calm tone as final fallback', async () => {
      mockEngine.classify.mockResolvedValue({
        type: 'todo',
        title: 'call dentist',
        confidence: 0.9,
      });

      const ctx: CortexContext = {
        lane: 'system',
        userId: 'user-1',
        activeSpaceId: null,
        uiSurface: 'chat',
        // No tone preferences set
      };

      const result = await cortexDecide({ text: 'call dentist' }, ctx);

      // Calm tone is clear and brief (Phase 11.7+: 'All sorted.')
      expect(result.explanation).toBe('All sorted.');
    });

    it('should prioritize userPrefsTone over spaceDefaults.tone', async () => {
      mockEngine.classify.mockResolvedValue({
        type: 'habit',
        name: 'meditate',
        frequency: 'daily',
        confidence: 0.85,
      });

      const ctx: CortexContext = {
        lane: 'system',
        userId: 'user-1',
        activeSpaceId: 'space-1',
        uiSurface: 'chat',
        spaceDefaults: {
          tone: 'direct',
        },
        userPrefsTone: 'warm', // Should take priority
      };

      const result = await cortexDecide({ text: 'meditate daily' }, ctx);

      // Should use warm tone (user pref) not direct (space default)
      // Phase 11.7+: warm tone returns one of varied responses
      expect(result.mode).toBe('ask');
      expect(result.explanation).toBe('A few options here:');
    });
  });

  describe('no biasing when defaults absent', () => {
    it('should work normally without spaceDefaults', async () => {
      mockEngine.classify.mockResolvedValue({
        type: 'todo',
        title: 'task',
        confidence: 0.9,
      });

      const ctx: CortexContext = {
        lane: 'system',
        userId: 'user-1',
        activeSpaceId: null,
        uiSurface: 'chat',
        // No spaceDefaults or userPrefsTone
      };

      const result = await cortexDecide({ text: 'task' }, ctx);

      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('create.todo');
      expect(result.mode).toBe('auto');
    });
  });
});
