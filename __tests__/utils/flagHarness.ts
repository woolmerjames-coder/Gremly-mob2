/**
 * flagHarness - tiny helpers for feature-flagged screen tests.
 *
 * Usage pattern (must be called BEFORE requiring the screen under test):
 *
 *   import { mockMindDropFlag, mockRepoHook, mockAuthHook } from '../utils/flagHarness';
 *   mockMindDropFlag(true); // or false
 *   mockRepoHook();
 *   mockAuthHook({ userId: 'test-user' });
 *   const Screen = require('../../app/screens/CatchAllNotepad').default;
 *
 * Notes:
 * - Uses jest.doMock so it must run before importing the target module.
 * - Keeps mocks minimal and stable (plain functions instead of jest.fn) to avoid resetMocks interactions.
 */

export function mockMindDropFlag(enabled: boolean) {
  const featureFlagsPath = require.resolve('@/src/config/featureFlags');
  jest.doMock(featureFlagsPath, () => ({
    __esModule: true,
    MIND_DROP_V2: enabled,
    whenEnabled: (flag: boolean, on: () => any, off: () => any) => (flag ? on() : off()),
  }));
}

export function mockRepoHook(overrides?: Record<string, unknown>) {
  const repoProviderPath = require.resolve('../../providers/RepoProvider');
  jest.doMock(repoProviderPath, () => ({
    __esModule: true,
    useRepo: () => ({ ...(overrides || {}) }),
  }));
}

export function mockAuthHook(overrides?: { userId?: string }) {
  const authProviderPath = require.resolve('../../providers/AuthProvider');
  jest.doMock(authProviderPath, () => ({
    __esModule: true,
    useAuth: () => ({ userId: overrides?.userId ?? 'test-user' }),
  }));
}
