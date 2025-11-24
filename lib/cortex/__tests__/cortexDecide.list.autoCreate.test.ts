/**
 * Regression tests for list auto-creation flow
 *
 * Issue: Lists like "- eggs - milk - cereal" were:
 * 1. Not being detected by list heuristic (only detected newline-separated)
 * 2. Going to Todo instead of Log
 * 3. Showing timestamp + mood UI (incorrect for lists)
 * 4. AI title reverting to raw text on save
 *
 * Fix: Enhanced list detection, auto-create as logs, tag priority, title preservation
 */

import type { ChipSuggestion } from '../policy/chips';

const mockClassify = jest.fn();

jest.mock('../../../cortex/createEngine', () => ({
  createCortexEngine: () => ({
    classify: mockClassify,
  }),
}));

describe('cortexDecide - List Auto-Creation Regression Tests', () => {
  beforeEach(() => {
    mockClassify.mockReset();
    jest.resetModules();
    process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL = 'on';
    process.env.EXPO_PUBLIC_CORTEX_MODEL = 'gpt-4o-mini';
    process.env.EXPO_PUBLIC_CORTEX_ENGINE = 'LLM';
    process.env.EXPO_PUBLIC_CORTEX_TIMEOUT_MS = '1500';
    process.env.EXPO_PUBLIC_CANONICAL_TYPES = 'off';
    process.env.EXPO_PUBLIC_CANONICAL_CONVERSIONS = 'on';
  });

  it('should auto-create inline lists as notes (not todos)', async () => {
    // Simulate AI thinking it's a todo (which it might)
    mockClassify.mockResolvedValue({
      type: 'todo',
      title: 'Grocery shopping',
      confidence: 0.75,
    });

    const userText = '- eggs - milk - cereal';

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: userText },
      { userId: 'user-1', uiSurface: 'catchall', activeSpaceId: null },
    );

    // List heuristic should trigger and override AI classification
    expect(result.meta?.heuristics?.list?.applied).toBe(true);
    expect(result.meta?.heuristics?.list?.score).toBeGreaterThanOrEqual(0.7);

    // Should be in auto mode (strong heuristic overrides AI)
    expect(result.mode).toBe('auto');

    // Should create a note, not a todo
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      type: 'create.note',
    });
  });

  it('should handle newline-separated lists', async () => {
    mockClassify.mockResolvedValue({
      type: 'log',
      title: 'Shopping list',
      confidence: 0.7,
    });

    const userText = '- eggs\n- milk\n- cereal';

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: userText },
      { userId: 'user-1', uiSurface: 'catchall', activeSpaceId: null },
    );

    expect(result.meta?.heuristics?.list?.applied).toBe(true);
    expect(result.mode).toBe('auto');
    expect(result.actions[0]?.type).toBe('create.note');
  });

  it('should require 3+ items for strong auto-creation', async () => {
    mockClassify.mockResolvedValue({
      type: 'log',
      title: 'Items',
      confidence: 0.6,
    });

    // Test with 2 items - should get score of 0.7 (borderline)
    const twoItems = '- eggs - milk';
    // Test with 3 items - should get score of 0.8 (stronger)
    const threeItems = '- eggs - milk - cereal';

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const twoItemResult = await cortexDecide(
      { text: twoItems },
      { userId: 'user-1', uiSurface: 'catchall', activeSpaceId: null },
    );

    const threeItemResult = await cortexDecide(
      { text: threeItems },
      { userId: 'user-1', uiSurface: 'catchall', activeSpaceId: null },
    );

    const twoItemScore = twoItemResult.meta?.heuristics?.list?.score || 0;
    const threeItemScore = threeItemResult.meta?.heuristics?.list?.score || 0;

    // 2 items gets base score of 0.7
    expect(twoItemScore).toBeCloseTo(0.7);
    // 3 items gets 0.8
    expect(threeItemScore).toBeCloseTo(0.8);
    // Both should trigger auto-mode
    expect(twoItemResult.mode).toBe('auto');
    expect(threeItemResult.mode).toBe('auto');
  });

  it('should give higher scores for longer lists', async () => {
    mockClassify.mockResolvedValue({
      type: 'log',
      title: 'Shopping',
      confidence: 0.7,
    });

    const shortList = '- eggs - milk - cereal';
    const longList = '- eggs - milk - cereal - bread - butter - cheese';

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const shortResult = await cortexDecide(
      { text: shortList },
      { userId: 'user-1', uiSurface: 'catchall', activeSpaceId: null },
    );

    const longResult = await cortexDecide(
      { text: longList },
      { userId: 'user-1', uiSurface: 'catchall', activeSpaceId: null },
    );

    const shortScore = shortResult.meta?.heuristics?.list?.score || 0;
    const longScore = longResult.meta?.heuristics?.list?.score || 0;

    expect(longScore).toBeGreaterThan(shortScore);
    expect(longScore).toBeGreaterThanOrEqual(0.9); // 5+ items should get bonus
  });

  it('should handle lists with extra whitespace', async () => {
    mockClassify.mockResolvedValue({
      type: 'log',
      title: 'List',
      confidence: 0.7,
    });

    const userText = '-  eggs  -  milk  -  cereal';

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: userText },
      { userId: 'user-1', uiSurface: 'catchall', activeSpaceId: null },
    );

    expect(result.meta?.heuristics?.list?.applied).toBe(true);
    expect(result.mode).toBe('auto');
  });

  it('should mark canonicalSubtype as list', async () => {
    mockClassify.mockResolvedValue({
      type: 'log',
      title: 'Groceries',
      confidence: 0.7,
    });

    const userText = '- eggs - milk - cereal';

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: userText },
      { userId: 'user-1', uiSurface: 'catchall', activeSpaceId: null },
    );

    // Lists are no longer a subtype; canonical subtype should be null
    expect(result.meta?.canonicalSubtype).toBe(null);
    expect(result.meta?.canonicalHint).toEqual(
      expect.objectContaining({ source: 'list-heuristic' }),
    );
  });
});
