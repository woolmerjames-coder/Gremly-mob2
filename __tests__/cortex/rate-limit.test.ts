/**
 * Rate Limiter Test - Phase 6.5
 * Verifies that the rate limiter triggers fallback when limit is exceeded
 */

import type { CortexInput } from '../../cortex/ICortexEngine';

// Mock the entire module to isolate engine creation per test
jest.mock('../../cortex/openAiEngine');
jest.mock('../../cortex/heuristicEngine');

describe('Cortex Rate Limiter', () => {
  let mockOpenAIClassify: jest.Mock;
  let mockHeuristicClassify: jest.Mock;
  let createEngine: () => any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Set up test environment
    process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL = 'true';
    process.env.EXPO_PUBLIC_CORTEX_ENGINE = 'LLM';
    process.env.EXPO_PUBLIC_OPENAI_API_KEY = 'test-key-123';
    process.env.EXPO_PUBLIC_CORTEX_RATE_WINDOW_S = '1'; // 1 second window
    process.env.EXPO_PUBLIC_CORTEX_RATE_MAX = '3'; // Max 3 requests
    process.env.EXPO_PUBLIC_DEBUG_CORTEX = 'false';

    // Mock OpenAI responses
    mockOpenAIClassify = jest.fn().mockResolvedValue({
      type: 'note',
      subtype: 'catchall',
      aiPlaced: true,
      whyString: 'LLM response',
    });

    // Mock Heuristic responses
    mockHeuristicClassify = jest.fn().mockResolvedValue({
      type: 'note',
      subtype: 'catchall',
      aiPlaced: false,
      whyString: 'Heuristic fallback',
    });

    // Mock the modules
    jest.doMock('../../cortex/openAiEngine', () => ({
      OpenAiEngine: jest.fn().mockImplementation(() => ({
        classify: mockOpenAIClassify,
      })),
    }));

    jest.doMock('../../cortex/heuristicEngine', () => ({
      heuristicEngine: {
        classify: mockHeuristicClassify,
      },
    }));

    // Import createEngine fresh for each test
    const { createCortexEngine } = require('../../cortex/createEngine');
    createEngine = createCortexEngine;
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL;
    delete process.env.EXPO_PUBLIC_CORTEX_ENGINE;
    delete process.env.EXPO_PUBLIC_OPENAI_API_KEY;
    delete process.env.EXPO_PUBLIC_CORTEX_RATE_WINDOW_S;
    delete process.env.EXPO_PUBLIC_CORTEX_RATE_MAX;
    delete process.env.EXPO_PUBLIC_DEBUG_CORTEX;
  });

  it('falls back to heuristic when rate limit is exceeded', async () => {
    const engine = createEngine();
    const testInput: CortexInput = {
      text: 'Test input for rate limiting',
      spaceId: null,
    };

    const results: any[] = [];

    // Make MAX + 1 requests rapidly
    for (let i = 0; i < 4; i++) {
      const result = await engine.classify(testInput);
      results.push(result);
    }

    // First 3 should use OpenAI (rate limit allows)
    expect(results[0].whyString).toBe('LLM response');
    expect(results[1].whyString).toBe('LLM response');
    expect(results[2].whyString).toBe('LLM response');
    expect(mockOpenAIClassify).toHaveBeenCalledTimes(3);

    // 4th should fall back to heuristic (rate limited)
    expect(results[3].whyString).toBe('Heuristic fallback');
    expect(results[3].aiPlaced).toBe(false);
    expect(mockHeuristicClassify).toHaveBeenCalledTimes(1);
  });

  it('allows requests again after window expires', async () => {
    const engine = createEngine();
    const testInput: CortexInput = {
      text: 'Test input for rate window reset',
      spaceId: null,
    };

    // Make 3 requests (max)
    await engine.classify(testInput);
    await engine.classify(testInput);
    await engine.classify(testInput);

    expect(mockOpenAIClassify).toHaveBeenCalledTimes(3);

    // Wait for window to expire (1 second + buffer)
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Should be able to make request again
    const result = await engine.classify(testInput);
    expect(result.whyString).toBe('LLM response');
    expect(mockOpenAIClassify).toHaveBeenCalledTimes(4); // 3 + 1 more
  }, 15000);

  it('does not rate limit when limiter is disabled', async () => {
    // Set rate max to 0 (disables limiter)
    process.env.EXPO_PUBLIC_CORTEX_RATE_MAX = '0';

    // Recreate engine with new env
    jest.resetModules();
    const { createCortexEngine } = require('../../cortex/createEngine');
    const engine = createCortexEngine();

    const testInput: CortexInput = {
      text: 'Test input for disabled limiter',
      spaceId: null,
    };

    // Make many requests
    const results: any[] = [];
    for (let i = 0; i < 10; i++) {
      const result = await engine.classify(testInput);
      results.push(result);
    }

    // All should use OpenAI (no rate limiting)
    results.forEach((result) => {
      expect(result.whyString).toBe('LLM response');
    });

    // OpenAI should have been called 10 times
    expect(mockOpenAIClassify).toHaveBeenCalledTimes(10);
  });
});
