/**
 * Tests for high-confidence todo classification
 * Ensures clear action items are NOT downgraded to logs by engine confidence
 */

const mockClassify = jest.fn();

jest.mock('../../../cortex/createEngine', () => ({
  createCortexEngine: () => ({
    classify: mockClassify,
  }),
}));

describe('cortexDecide - High-Confidence Todo Preservation', () => {
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

  it('should auto-create todo for "Complete the now page updates" even if engine says log', async () => {
    // Engine incorrectly classifies as log with high confidence
    mockClassify.mockResolvedValue({
      type: 'log',
      title: 'Complete the now page updates',
      confidence: 0.75,
    });

    const todoText = 'Complete the now page updates';

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: todoText },
      { userId: 'user-1', uiSurface: 'catchall', activeSpaceId: null },
    );

    // Should auto-create as todo, NOT log
    expect(result.mode).toBe('auto');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.type).toBe('create.todo');
    expect(result.mindDropDecision?.probableKind).toBe('todo');
  });

  it('should auto-create todo for "Finish the API integration" even if engine says log', async () => {
    // Engine incorrectly classifies as log with high confidence
    mockClassify.mockResolvedValue({
      type: 'log',
      title: 'Finish the API integration',
      confidence: 0.8,
    });

    const todoText = 'Finish the API integration';

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: todoText },
      { userId: 'user-2', uiSurface: 'catchall', activeSpaceId: null },
    );

    // Should auto-create as todo, NOT log
    expect(result.mode).toBe('auto');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.type).toBe('create.todo');
  });

  it('should auto-create todo for "Send the invoice to client" even if engine says log', async () => {
    // Engine incorrectly classifies as log with high confidence
    mockClassify.mockResolvedValue({
      type: 'log',
      title: 'Send the invoice to client',
      confidence: 0.72,
    });

    const todoText = 'Send the invoice to client';

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: todoText },
      { userId: 'user-3', uiSurface: 'catchall', activeSpaceId: null },
    );

    // Should auto-create as todo, NOT log
    expect(result.mode).toBe('auto');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.type).toBe('create.todo');
  });

  it('should auto-create todo for "Review the documentation" even if engine says log', async () => {
    // Engine incorrectly classifies as log with high confidence
    mockClassify.mockResolvedValue({
      type: 'log',
      title: 'Review the documentation',
      confidence: 0.85,
    });

    const todoText = 'Review the documentation';

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: todoText },
      { userId: 'user-4', uiSurface: 'catchall', activeSpaceId: null },
    );

    // Should auto-create as todo, NOT log
    expect(result.mode).toBe('auto');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.type).toBe('create.todo');
  });

  it('should still respect engine classification for true logs', async () => {
    // Engine correctly classifies as log with high confidence
    mockClassify.mockResolvedValue({
      type: 'log',
      title: "Just realized I'm tired today",
      confidence: 0.9,
    });

    const logText = "Just realized I'm tired today";

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: logText },
      { userId: 'user-5', uiSurface: 'catchall', activeSpaceId: null },
    );

    // Should create as log since canonical intent agrees
    expect(result.mode).toBe('auto');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.type).toBe('create.note');
  });

  it('should respect engine todo classification when both agree', async () => {
    // Engine correctly classifies as todo with high confidence
    mockClassify.mockResolvedValue({
      type: 'todo',
      title: 'Complete the now page updates',
      confidence: 0.92,
    });

    const todoText = 'Complete the now page updates';

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: todoText },
      { userId: 'user-6', uiSurface: 'catchall', activeSpaceId: null },
    );

    // Should auto-create as todo
    expect(result.mode).toBe('auto');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.type).toBe('create.todo');
  });
});
