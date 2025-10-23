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
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('create.todo');
      if (result.actions[0].type === 'create.todo') {
        expect(result.actions[0].payload.title).toContain('review');
      }
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

      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('create.habit');
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

      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('add.to.list');
      if (result.actions[0].type === 'add.to.list') {
        expect(result.actions[0].payload.listKey).toBe('packing'); // First preferred key
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

      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('add.to.list');
      // Should fall back to heuristic: "buy" → shopping
      if (result.actions[0].type === 'add.to.list') {
        expect(result.actions[0].payload.listKey).toBe('shopping');
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

      // Warm tone should include emoji
      expect(result.explanation).toContain('✓');
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

      // Direct tone should be brief with no period
      expect(result.explanation).toBe('Todo created');
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

      // Calm tone should end with period
      expect(result.explanation).toBe('Todo created.');
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
      expect(result.explanation).toContain('🎯');
      expect(result.explanation).not.toBe('Habit created'); // Not direct tone
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
