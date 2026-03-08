/**
 * Tests for workers/cortex/context/dcoContext.js
 *
 * Covers getDcoContext: KV caching, Supabase fallback, null handling.
 */

import { getDcoContext } from '../dcoContext.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mock env
// ─────────────────────────────────────────────────────────────────────────────

function makeEnv(overrides = {}) {
  return {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_KEY: 'test-service-key',
    CONTEXT_CACHE: {
      get: jest.fn().mockResolvedValue(null),
      put: jest.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

const sampleDco = {
  life_moment: 'hosting family',
  tone: 'focused',
  today_focus: ['Write report', 'Call dentist'],
  named_anchors: [{ label: 'Sarah', type: 'person', source: 'drop' }],
  active_today: { overdue_todos: 2, habit_streak_risk: ['Meditate'], upcoming_in_7d: [] },
  brief_headline: 'Big day ahead',
  generated_at: '2025-12-15T06:00:00Z',
};

// ─────────────────────────────────────────────────────────────────────────────
// Mock fetch
// ─────────────────────────────────────────────────────────────────────────────

const originalFetch = global.fetch;
const mockFetch = jest.fn();

beforeEach(() => {
  global.fetch = mockFetch;
  mockFetch.mockReset();
});

afterAll(() => {
  global.fetch = originalFetch;
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getDcoContext', () => {
  it('returns null when userId is falsy', async () => {
    const result = await getDcoContext(null, makeEnv());
    expect(result).toBeNull();
  });

  it('returns null when userId is empty string', async () => {
    const result = await getDcoContext('', makeEnv());
    expect(result).toBeNull();
  });

  it('returns cached data on KV hit', async () => {
    const cachedData = {
      lifeMoment: 'hosting family',
      tone: 'focused',
      todayFocus: ['Report'],
      namedAnchors: [],
      activeToday: null,
      briefHeadline: 'Hello',
      generatedAt: '2025-12-15T06:00:00Z',
    };

    const env = makeEnv({
      CONTEXT_CACHE: {
        get: jest.fn().mockResolvedValue(JSON.stringify(cachedData)),
        put: jest.fn(),
      },
    });

    const result = await getDcoContext('user-123', env);

    expect(result).toEqual(cachedData);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches from Supabase on KV miss', async () => {
    const env = makeEnv();

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ dco: sampleDco }]),
    });

    const result = await getDcoContext('user-123', env);

    expect(result).toBeTruthy();
    expect(result.lifeMoment).toBe('hosting family');
    expect(result.tone).toBe('focused');
    expect(result.briefHeadline).toBe('Big day ahead');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('caches result in KV with 2hr TTL after Supabase fetch', async () => {
    const env = makeEnv();

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ dco: sampleDco }]),
    });

    await getDcoContext('user-123', env);

    expect(env.CONTEXT_CACHE.put).toHaveBeenCalledWith('dco-context:user-123', expect.any(String), {
      expirationTtl: 7200,
    });
  });

  it('returns null when Supabase returns empty array', async () => {
    const env = makeEnv();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const result = await getDcoContext('user-123', env);
    expect(result).toBeNull();
  });

  it('returns null on Supabase error', async () => {
    const env = makeEnv();
    mockFetch.mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
    });

    const result = await getDcoContext('user-123', env);
    expect(result).toBeNull();
  });

  it('returns null on fetch exception', async () => {
    const env = makeEnv();
    mockFetch.mockRejectedValue(new Error('Network failure'));

    const result = await getDcoContext('user-123', env);
    expect(result).toBeNull();
  });

  it('works without CONTEXT_CACHE (no KV binding)', async () => {
    const env = makeEnv({ CONTEXT_CACHE: null });

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ dco: sampleDco }]),
    });

    const result = await getDcoContext('user-123', env);
    expect(result).toBeTruthy();
    expect(result.tone).toBe('focused');
  });

  it('maps DCO fields to camelCase output', async () => {
    const env = makeEnv();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ dco: sampleDco }]),
    });

    const result = await getDcoContext('user-123', env);

    expect(result).toEqual({
      lifeMoment: 'hosting family',
      tone: 'focused',
      todayFocus: ['Write report', 'Call dentist'],
      namedAnchors: [{ label: 'Sarah', type: 'person', source: 'drop' }],
      activeToday: sampleDco.active_today,
      briefHeadline: 'Big day ahead',
      generatedAt: '2025-12-15T06:00:00Z',
    });
  });
});
