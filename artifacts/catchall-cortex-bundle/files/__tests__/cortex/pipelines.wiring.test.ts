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

// Mock the engine to avoid external dependencies
jest.mock('../../cortex/createEngine', () => ({
  createCortexEngine: jest.fn(() => ({
    classify: jest.fn(async () => ({
      intent: 'create.todo',
      confidence: 0.9,
      entities: { title: 'test' },
    })),
  })),
}));

import { cortexRoute, laneToPipeline } from '../../lib/cortex/router';

describe('pipeline wiring (no behavior change)', () => {
  it('classification lane routes correctly', async () => {
    const res = await cortexRoute(
      { text: 'x' },
      { lane: 'catchall', userId: 'test', uiSurface: 'overlay' },
    );
    expect(res).toBeDefined();
    expect(laneToPipeline('catchall')).toBe('classification');
  });

  it('conversation lane routes correctly', async () => {
    const res = await cortexRoute(
      { text: 'y' },
      { lane: 'space_chat', userId: 'test', spaceId: 'test-space', uiSurface: 'chat' },
    );
    expect(res).toBeDefined();
    expect(laneToPipeline('space_chat')).toBe('conversation');
  });

  it('system lane routes correctly', async () => {
    const res = await cortexRoute(
      { text: 'z' },
      { lane: 'system', userId: 'test', uiSurface: 'hub' },
    );
    expect(res).toBeDefined();
    expect(laneToPipeline('system')).toBe('system');
  });
});
