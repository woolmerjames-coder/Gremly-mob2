// Mock env before importing modules
jest.mock('../../lib/env', () => ({
  env: {
    cortex: {
      timeoutMs: 2500,
      classifyCatchAll: true,
      optimistic: true,
    },
  },
}));

// Mock the engine to return controlled responses
jest.mock('../../cortex/createEngine', () => ({
  createCortexEngine: jest.fn(() => ({
    classify: jest.fn(async () => ({
      type: 'note',
      subtype: 'list',
      text: 'test item',
      confidence: 0.9, // High confidence to trigger 'auto' mode
      aiPlaced: true,
      whyString: 'Shopping list item detected',
    })),
  })),
}));

import { runConversationPipeline } from '../../lib/cortex/pipelines/conversation';
import { cortexDecide } from '../../lib/cortex/cortexDecide';

describe('Space Chat rules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('transforms auto mode to ask mode', async () => {
    const mockContext = {
      lane: 'space_chat' as const,
      userId: 'test',
      spaceId: 'test-space',
      uiSurface: 'chat' as const,
    };

    // First, verify that raw cortexDecide would return auto mode
    const { createCortexEngine } = require('../../cortex/createEngine');

    createCortexEngine.mockReturnValue({
      classify: jest.fn().mockResolvedValue({
        type: 'note',
        subtype: 'list',
        text: 'test item',
        confidence: 0.9,
        aiPlaced: true,
        whyString: 'Shopping list item detected',
      }),
    });

    const rawResult = await cortexDecide({ text: 'test' }, mockContext);
    console.log('Raw cortexDecide result:', rawResult);

    // Now test that conversation pipeline transforms it
    const pipelineResult = await runConversationPipeline({ text: 'test' }, mockContext);
    console.log('Pipeline result:', pipelineResult);

    expect(pipelineResult.mode).toBe('ask');
  });

  it('suppresses catch-all explanation when engine fails', async () => {
    const mockContext = {
      lane: 'space_chat' as const,
      userId: 'test',
      spaceId: 'test-space',
      uiSurface: 'chat' as const,
    };

    const { createCortexEngine } = require('../../cortex/createEngine');

    // Mock engine to throw an error to trigger catch-all explanation
    createCortexEngine.mockReturnValue({
      classify: jest.fn().mockRejectedValue(new Error('Engine error')),
    });

    const result = await runConversationPipeline({ text: 'test' }, mockContext);

    expect(result.actions).toEqual([]);
    expect(result.explanation).toBe('');
    expect(result.mode).toBe('reply'); // Engine error → empty explanation → small-talk reply
    expect(result.replyText).toBeDefined(); // Small-talk should be triggered
    expect(result.meta?.kind).toBe('smalltalk');
  });
});
