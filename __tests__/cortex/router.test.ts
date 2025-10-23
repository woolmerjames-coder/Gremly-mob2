// Mock env before importing router
jest.mock('../../lib/env', () => ({
  env: {
    cortex: {
      timeoutMs: 2500,
      classifyCatchAll: true,
      optimistic: true,
    },
  },
}));

import { laneToPipeline } from '../../lib/cortex/router';

describe('laneToPipeline', () => {
  it('maps catchall -> classification', () => {
    expect(laneToPipeline('catchall')).toBe('classification');
  });
  it('maps space_chat -> conversation', () => {
    expect(laneToPipeline('space_chat')).toBe('conversation');
  });
  it('maps system -> system', () => {
    expect(laneToPipeline('system')).toBe('system');
  });
});
