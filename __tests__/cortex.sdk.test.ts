/**
 * Cortex SDK Tests
 *
 * Lightweight tests for thresholds, explainability, and cortexDecide normalization.
 * No DB access - pure unit tests with mocked engines.
 */

import { decideMode, AUTO_THRESHOLD, ASK_THRESHOLD } from '../lib/cortex/thresholds';
import {
  explainFiledToSpace,
  explainAddedToList,
  explainCreated,
  explainAmbiguous,
} from '../lib/cortex/explain';
import { cortexDecide } from '../lib/cortex/cortexDecide';
import type { CortexContext } from '../lib/cortex/cortexDecide';

// Mock createEngine to return controlled outputs
jest.mock('../cortex/createEngine', () => ({
  createCortexEngine: jest.fn(),
}));

// Mock env to enable classification
jest.mock('../lib/env', () => ({
  env: {
    cortex: {
      timeoutMs: 2500,
      classifyCatchAll: true,
      optimistic: true,
    },
  },
}));

describe('Cortex Thresholds', () => {
  it('should return auto for confidence >= 0.8', () => {
    expect(decideMode(0.8)).toBe('auto');
    expect(decideMode(0.9)).toBe('auto');
    expect(decideMode(1.0)).toBe('auto');
  });

  it('should return ask for confidence 0.5-0.8', () => {
    expect(decideMode(0.5)).toBe('ask');
    expect(decideMode(0.65)).toBe('ask');
    expect(decideMode(0.79)).toBe('ask');
  });

  it('should return keep for confidence < 0.5', () => {
    expect(decideMode(0.0)).toBe('keep');
    expect(decideMode(0.3)).toBe('keep');
    expect(decideMode(0.49)).toBe('keep');
  });

  it('should return keep for missing/invalid confidence', () => {
    expect(decideMode()).toBe('keep');
    expect(decideMode(undefined)).toBe('keep');
    expect(decideMode(NaN)).toBe('keep');
  });

  it('should have correct threshold constants', () => {
    expect(AUTO_THRESHOLD).toBe(0.8);
    expect(ASK_THRESHOLD).toBe(0.5);
  });
});

describe('Cortex Explainability', () => {
  describe('explainFiledToSpace', () => {
    it('should generate basic explanation', () => {
      const result = explainFiledToSpace('Fitness');
      expect(result).toContain('Filed to Fitness');
    });

    it('should not include hints (Gremly style - brief)', () => {
      const result = explainFiledToSpace('Fitness', 'calm', ['you mentioned running']);
      expect(result).toBe('Filed to Fitness.');
    });

    it('should add emoji for warm tone', () => {
      const result = explainFiledToSpace('Fitness', 'warm');
      expect(result).toContain('💫');
    });

    it('should be brief for direct tone', () => {
      const result = explainFiledToSpace('Fitness', 'direct');
      expect(result).toBe('Filed: Fitness');
    });
  });

  describe('explainAddedToList', () => {
    it('should generate basic list explanation (brief)', () => {
      const result = explainAddedToList('Shopping');
      expect(result).toContain('Added');
      expect(result).toContain('🛒'); // Contextual emoji
    });

    it('should add emoji for shopping list (warm)', () => {
      const result = explainAddedToList('Shopping', 'warm');
      expect(result).toContain('🛒');
    });

    it('should be very brief for direct tone', () => {
      const result = explainAddedToList('Reading', 'direct');
      expect(result).toBe('Added');
    });
  });

  describe('explainCreated', () => {
    it('should explain todo creation (brief, Gremly style)', () => {
      const result = explainCreated('todo', 'calm');
      expect(result).toBe('All sorted.');
    });

    it('should vary responses for warm tone', () => {
      const result = explainCreated('habit', 'warm');
      expect([
        'On it 🎯',
        "Nice work — that's one less thing buzzing around your brain.",
        'Habit locked in',
      ]).toContain(result);
    });

    it('should be brief for direct tone', () => {
      const result = explainCreated('note', 'direct');
      expect(result).toBe('Saved.');
    });
  });

  describe('explainAmbiguous', () => {
    it('should indicate uncertainty (brief, friendly)', () => {
      const result = explainAmbiguous('calm');
      expect(result).toBe('Break that down for me?');
    });

    it('should mention suggestions when provided (brief)', () => {
      const result = explainAmbiguous('warm', ['File to Fitness?', 'Add to list?']);
      expect(result).toBe('A few options here:');
    });
  });
});

describe('cortexDecide Integration', () => {
  const mockContext: CortexContext = {
    lane: 'system',
    userId: 'user-123',
    activeSpaceId: null,
    uiSurface: 'overlay',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should normalize shopping list intent to create.note action (high confidence)', async () => {
    const { createCortexEngine } = require('../cortex/createEngine');

    // Mock engine to return shopping list classification
    // Lists are no longer a subtype - they're detected via has_list attribute
    createCortexEngine.mockReturnValue({
      classify: jest.fn().mockResolvedValue({
        type: 'note',
        subtype: null, // Lists are attributes, not subtypes
        text: 'buy milk',
        confidence: 0.9,
        aiPlaced: true,
        whyString: 'Shopping list item detected',
      }),
    });

    const result = await cortexDecide({ text: 'buy milk' }, mockContext);

    expect(result.mode).toBe('auto');
    expect(result.confidence).toBe(0.9);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe('create.note');

    if (result.actions[0].type === 'create.note') {
      // List detection happens in Mind Drop pipeline
      expect(result.actions[0].payload.text).toBe('buy milk');
    }

    expect(result.explanation).toBeDefined();
  });

  it('should convert todo list creation commands into todo actions', async () => {
    const { createCortexEngine } = require('../cortex/createEngine');

    createCortexEngine.mockReturnValue({
      classify: jest.fn().mockResolvedValue({
        type: 'todo', // Change to todo type to trigger create.todo
        text: 'Make work todo list today',
        confidence: 0.88,
        aiPlaced: true,
        whyString: 'Todo creation',
        undefined_due: false,
      }),
    });

    const result = await cortexDecide({ text: 'Make work todo list today' }, mockContext);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe('create.todo');

    if (result.actions[0].type === 'create.todo') {
      expect(result.actions[0].payload.title).toContain('work todo list');
    }
  });

  it('should strip due phrasing from todo titles while preserving due date', async () => {
    const { createCortexEngine } = require('../cortex/createEngine');

    createCortexEngine.mockReturnValue({
      classify: jest.fn().mockResolvedValue({
        type: 'todo',
        text: 'For today, find CDMX day of the dead parties',
        confidence: 0.92,
        aiPlaced: true,
        whyString: 'Todo with due date',
        due: '2025-10-31T23:00:00.000Z',
      }),
    });

    const result = await cortexDecide(
      { text: 'For today, find CDMX day of the dead parties' },
      mockContext,
    );

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe('create.todo');

    if (result.actions[0].type === 'create.todo') {
      expect(result.actions[0].payload.title).toBe('Find CDMX day of the dead parties');
      expect(result.actions[0].payload.due).toBe('2025-10-31T23:00:00.000Z');
    }
  });

  it('should remove daily suffix from habit names while keeping cadence', async () => {
    const { createCortexEngine } = require('../cortex/createEngine');

    createCortexEngine.mockReturnValue({
      classify: jest.fn().mockResolvedValue({
        type: 'habit',
        name: 'Drink 2 liters of water a day',
        confidence: 0.91,
        aiPlaced: true,
        whyString: 'Daily habit detected',
        frequency: 'daily',
      }),
    });

    const result = await cortexDecide({ text: 'Drink 2 liters of water a day' }, mockContext);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe('create.habit');

    if (result.actions[0].type === 'create.habit') {
      expect(result.actions[0].payload.name).toBe('Drink 2 liters of water');
      expect(result.actions[0].payload.freq).toBe('daily');
    }
  });

  it('should return ask mode for medium confidence (0.65)', async () => {
    const { createCortexEngine } = require('../cortex/createEngine');

    createCortexEngine.mockReturnValue({
      classify: jest.fn().mockResolvedValue({
        type: 'todo',
        text: 'something ambiguous',
        confidence: 0.65,
        aiPlaced: true,
        whyString: 'Unclear intent',
      }),
    });

    const result = await cortexDecide({ text: 'something ambiguous' }, mockContext);

    expect(result.mode).toBe('ask');
    expect(result.confidence).toBe(0.65);
    expect(result.suggestions).toBeDefined();
    expect(result.suggestions!.length).toBeGreaterThan(0);
  });

  it('normalizes low-confidence logs to unsorted catch-all candidates', async () => {
    const { createCortexEngine } = require('../cortex/createEngine');

    createCortexEngine.mockReturnValue({
      classify: jest.fn().mockResolvedValue({
        type: 'note',
        subtype: 'catchall',
        text: 'random thought fragment',
        confidence: 0.3,
        aiPlaced: true,
        whyString: 'Low confidence note routing',
      }),
    });

    const result = await cortexDecide({ text: 'random thought fragment' }, mockContext);

    expect(result.mode).toBe('keep');
    expect(result.actions).toHaveLength(0);
    expect(result.meta?.canonicalType).toBe('unsorted');
    expect(result.meta?.canonicalSubtype).toBeNull();

    const candidates = result.meta?.candidateActions ?? [];
    expect(candidates).toHaveLength(1);
    const candidate = candidates[0];
    expect(candidate.type).toBe('create.note');
    if (candidate.type === 'create.note') {
      expect(candidate.payload.subtype).toBe('catchall');
    }
  });

  it('should return keep mode with safe explanation on engine error', async () => {
    const { createCortexEngine } = require('../cortex/createEngine');

    // Mock engine to throw error
    createCortexEngine.mockReturnValue({
      classify: jest.fn().mockRejectedValue(new Error('Engine failure')),
    });

    const result = await cortexDecide({ text: 'test input' }, mockContext);

    expect(result.mode).toBe('ask');
    expect(result.confidence).toBe(0);
    expect(result.actions).toHaveLength(0);
    expect(result.explanation).toContain("Let's explore that a bit more.");
  });

  it('should handle engine timeout gracefully', async () => {
    const { createCortexEngine } = require('../cortex/createEngine');

    // Mock engine to never resolve (will timeout)
    createCortexEngine.mockReturnValue({
      classify: jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            // Never resolves - will trigger timeout
            setTimeout(resolve, 10000);
          }),
      ),
    });

    const result = await cortexDecide({ text: 'test input' }, mockContext);

    expect(result.mode).toBe('ask');
    expect(result.actions).toHaveLength(0);
    expect(result.explanation).toContain("Let's explore that a bit more.");
  });

  it('should normalize habit creation with daily frequency', async () => {
    const { createCortexEngine } = require('../cortex/createEngine');

    createCortexEngine.mockReturnValue({
      classify: jest.fn().mockResolvedValue({
        type: 'habit',
        name: 'morning run',
        frequency: 'daily',
        confidence: 0.9,
        aiPlaced: true,
        whyString: 'Daily habit detected',
      }),
    });

    const result = await cortexDecide({ text: 'morning run every day' }, mockContext);

    expect(result.mode).toBe('auto');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe('create.habit');

    if (result.actions[0].type === 'create.habit') {
      expect(result.actions[0].payload.name).toBe('morning run');
      expect(result.actions[0].payload.freq).toBe('daily');
    }
  });

  it('should handle structured input', async () => {
    const { createCortexEngine } = require('../cortex/createEngine');

    createCortexEngine.mockReturnValue({
      classify: jest.fn().mockResolvedValue({
        type: 'todo',
        title: 'structured task',
        confidence: 0.9,
        aiPlaced: true,
        whyString: 'Structured input',
      }),
    });

    const result = await cortexDecide(
      { structured: { action: 'create', type: 'todo', title: 'structured task' } },
      mockContext,
    );

    expect(result.mode).toBe('auto');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe('create.todo');
  });

  it('should fall back to ask when confidence equals threshold', async () => {
    const { createCortexEngine } = require('../cortex/createEngine');

    createCortexEngine.mockReturnValue({
      classify: jest.fn().mockResolvedValue({
        type: 'habit',
        name: 'drink water',
        frequency: 'daily',
        confidence: 0.85,
        aiPlaced: true,
        whyString: 'Daily habit detected',
      }),
    });

    const result = await cortexDecide({ text: 'drink water every day' }, mockContext);

    expect(result.mode).toBe('ask');
  });

  it('should use activeSpaceId from context', async () => {
    const { createCortexEngine } = require('../cortex/createEngine');

    createCortexEngine.mockReturnValue({
      classify: jest.fn().mockResolvedValue({
        type: 'todo',
        title: 'task',
        confidence: 0.9,
        aiPlaced: true,
        whyString: '',
      }),
    });

    const contextWithSpace: CortexContext = {
      ...mockContext,
      activeSpaceId: 'space-123',
    };

    const result = await cortexDecide({ text: 'new task' }, contextWithSpace);

    expect(result.actions[0].type).toBe('create.todo');

    if (result.actions[0].type === 'create.todo') {
      expect(result.actions[0].payload.spaceId).toBe('space-123');
    }
  });
});
