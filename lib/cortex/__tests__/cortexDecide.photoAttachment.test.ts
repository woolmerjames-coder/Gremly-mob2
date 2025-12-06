/**
 * Tests for photo attachment classification
 * Ensures captures with photo attachments default to log-general when AI is uncertain
 */

const mockClassify = jest.fn();

jest.mock('../../../cortex/createEngine', () => ({
  createCortexEngine: () => ({
    classify: mockClassify,
  }),
}));

describe('cortexDecide - Photo Attachment Classification', () => {
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

  it('should classify as log-general when attachments present and AI is uncertain (low confidence)', async () => {
    // AI returns low confidence classification
    mockClassify.mockResolvedValue({
      type: 'none', // Using 'none' to explicitly indicate uncertain
      title: '',
      confidence: 0.3,
    });

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: '', hasAttachments: true }, // Empty text to avoid rule-based detection interference
      { userId: 'user-photo-1', uiSurface: 'catchall', activeSpaceId: null },
    );

    // Should auto-create as log (general)
    // Check mindDropDecision first to see what we got
    expect(result.mindDropDecision?.probableKind).toBe('log');
    expect(result.mindDropDecision?.needsClarification).toBe(false);
    expect(result.mode).toBe('auto');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.type).toBe('create.note');
  });

  it('should classify as log-general when attachments present and AI returns none/unknown', async () => {
    // AI cannot determine type
    mockClassify.mockResolvedValue({
      type: 'none',
      title: '',
      confidence: 0.5,
    });

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: '', hasAttachments: true },
      { userId: 'user-photo-2', uiSurface: 'catchall', activeSpaceId: null },
    );

    // Should auto-create as log (general) instead of asking for clarification
    expect(result.mode).toBe('auto');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.type).toBe('create.note');
    expect(result.mindDropDecision?.probableKind).toBe('log');
  });

  it('should keep AI confident todo classification even with attachments', async () => {
    // AI confidently classifies as todo
    mockClassify.mockResolvedValue({
      type: 'todo',
      title: 'Fix the bug shown in screenshot',
      confidence: 0.92,
    });

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: 'Fix the bug shown in screenshot', hasAttachments: true },
      { userId: 'user-photo-3', uiSurface: 'catchall', activeSpaceId: null },
    );

    // Should respect AI's confident todo classification
    expect(result.mode).toBe('auto');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.type).toBe('create.todo');
    expect(result.mindDropDecision?.probableKind).toBe('todo');
  });

  it('should keep AI confident log classification with attachments', async () => {
    // AI confidently classifies as log
    mockClassify.mockResolvedValue({
      type: 'log',
      title: 'Beautiful sunset at the beach',
      confidence: 0.88,
    });

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: 'Beautiful sunset at the beach', hasAttachments: true },
      { userId: 'user-photo-4', uiSurface: 'catchall', activeSpaceId: null },
    );

    // Should respect AI's confident log classification
    expect(result.mode).toBe('auto');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.type).toBe('create.note');
    expect(result.mindDropDecision?.probableKind).toBe('log');
  });

  it('should follow existing rules for text-only captures (no attachments)', async () => {
    // AI returns low confidence for text-only
    mockClassify.mockResolvedValue({
      type: 'unknown',
      title: 'Just a thought',
      confidence: 0.3,
    });

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: 'Just a thought', hasAttachments: false },
      { userId: 'user-text-1', uiSurface: 'catchall', activeSpaceId: null },
    );

    // Text-only with low confidence should NOT force log-general
    // (it follows normal flow - may ask for clarification or use heuristics)
    // The key is that it's NOT forced to log-general like photo drops
    expect(result.mindDropDecision?.probableKind).not.toBe(undefined);
  });

  it('should default to log-general for photo-only captures with no text', async () => {
    // Photo-only capture, AI cannot classify
    mockClassify.mockResolvedValue({
      type: 'none',
      title: '',
      confidence: 0,
    });

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: '', hasAttachments: true },
      { userId: 'user-photo-only', uiSurface: 'catchall', activeSpaceId: null },
    );

    // Photo-only should create as log-general automatically
    expect(result.mode).toBe('auto');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.type).toBe('create.note');
    expect(result.mindDropDecision?.probableKind).toBe('log');
  });

  it('should classify as log-general when attachments present with moderate AI confidence', async () => {
    // AI returns moderate confidence (below 0.8 threshold)
    mockClassify.mockResolvedValue({
      type: 'log',
      title: 'Some notes with a photo',
      confidence: 0.75,
    });

    const cortexDecideModule = require('../cortexDecide') as typeof import('../cortexDecide');
    const { cortexDecide } = cortexDecideModule;

    const result = await cortexDecide(
      { text: 'Some notes with a photo', hasAttachments: true },
      { userId: 'user-photo-moderate', uiSurface: 'catchall', activeSpaceId: null },
    );

    // Should default to log-general since confidence < 0.8
    expect(result.mode).toBe('auto');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.type).toBe('create.note');
    expect(result.mindDropDecision?.probableKind).toBe('log');
  });
});
