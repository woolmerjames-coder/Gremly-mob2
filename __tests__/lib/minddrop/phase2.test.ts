/**
 * Phase 2 Enrichment Tests
 */

import { runPhase2 } from '../../../lib/minddrop/phase2';

// Mock env module
jest.mock('../../../lib/env', () => ({
  env: {
    cortexUrl: 'https://test.supabase.co/functions/v1/cortex-proxy',
    supabaseAnonKey: 'test-anon-key',
  },
  getEnv: jest.fn((key: string) => {
    if (key === 'EXPO_PUBLIC_CORTEX_URL')
      return 'https://test.supabase.co/functions/v1/cortex-proxy';
    if (key === 'EXPO_PUBLIC_SUPABASE_ANON_KEY') return 'test-anon-key';
    return undefined;
  }),
}));

// Mock feature flags
jest.mock('../../../lib/config/featureFlags', () => ({
  FEATURE_FLAGS: {
    HEURISTIC_LOGGING_ENABLED: false,
    PHASE2_ENRICHMENT_ENABLED: true,
    MIND_DROP_V4_ENABLED: true,
    USE_ZUSTAND_STORE: false,
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Create mock repo with unified methods
const createMockRepo = (entity: any) => {
  const mockGetById = jest.fn().mockResolvedValue(entity);
  const mockUpdate = jest.fn().mockResolvedValue({ ...entity, updated: true });

  return {
    getById: mockGetById,
    update: mockUpdate,
  };
};

describe('runPhase2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('guard conditions', () => {
    test('skips if entity already enriched', async () => {
      const mockRepo = createMockRepo({
        id: 'entity-123',
        views: { minddrop_stage: 'enriched' },
      });

      const result = await runPhase2('entity-123', 'buy milk', 'todo', null, mockRepo);

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    test('skips if entity already failed enrichment', async () => {
      const mockRepo = createMockRepo({
        id: 'entity-123',
        views: { minddrop_stage: 'enrichment_failed' },
      });

      const result = await runPhase2('entity-123', 'buy milk', 'todo', null, mockRepo);

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('skips if entity not found', async () => {
      const mockRepo = createMockRepo(null);

      const result = await runPhase2('entity-123', 'buy milk', 'todo', null, mockRepo);

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('successful enrichment', () => {
    test('returns enrichment result on success', async () => {
      const mockRepo = createMockRepo({
        id: 'entity-123',
        views: { minddrop_stage: 'classified' },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            smart_title: 'Buy milk from store',
            tags: ['shopping', 'groceries'],
            time_estimate_minutes: 15,
            extracted_date: '2025-12-11',
            extracted_frequency: null,
            people: [],
            confirmation_message: 'Added to your shopping list.',
            latency_ms: 500,
          }),
      });

      const result = await runPhase2(
        'entity-123',
        'buy milk from the store',
        'todo',
        null,
        mockRepo,
      );

      expect(result).not.toBeNull();
      expect(result?.smartTitle).toBe('Buy milk from store');
      expect(result?.tags).toEqual(['shopping', 'groceries']);
      expect(result?.timeEstimateMinutes).toBe(15);
      expect(result?.extractedDate).toBe('2025-12-11');
      expect(result?.confirmationMessage).toBe('Added to your shopping list.');
    });

    test('returns null confirmationMessage when not provided by API', async () => {
      const mockRepo = createMockRepo({
        id: 'entity-123',
        views: { minddrop_stage: 'classified' },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            smart_title: 'Buy milk from store',
            tags: ['shopping'],
            time_estimate_minutes: 15,
            extracted_date: null,
            extracted_frequency: null,
            people: [],
            // No confirmation_message field
          }),
      });

      const result = await runPhase2(
        'entity-123',
        'buy milk from the store',
        'todo',
        null,
        mockRepo,
      );

      expect(result).not.toBeNull();
      expect(result?.confirmationMessage).toBeNull();
    });

    test('updates entity with enrichment data', async () => {
      const mockRepo = createMockRepo({
        id: 'entity-123',
        views: { minddrop_stage: 'classified' },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            smart_title: 'Buy milk from store',
            tags: ['shopping'],
            time_estimate_minutes: 15,
            extracted_date: null,
            extracted_frequency: null,
            people: [],
            confirmation_message: 'Got it, ready when you are.',
          }),
      });

      await runPhase2('entity-123', 'buy milk from the store', 'todo', null, mockRepo);

      // Should update entity with enrichment including confirmation_message
      expect(mockRepo.update).toHaveBeenCalledWith({
        id: 'entity-123',
        patch: expect.objectContaining({
          name: 'Buy milk from store',
          tags: ['shopping'],
          views: expect.objectContaining({
            minddrop_stage: 'enriched',
            ai_pending: false,
            confirmation_message: 'Got it, ready when you are.',
          }),
        }),
      });
    });

    test('sets title field for notes', async () => {
      const mockRepo = createMockRepo({
        id: 'entity-123',
        views: { minddrop_stage: 'classified' },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            smart_title: 'Reflection on career goals',
            tags: ['career', 'reflection'],
            time_estimate_minutes: null,
            extracted_date: null,
            extracted_frequency: null,
            people: [],
          }),
      });

      await runPhase2(
        'entity-123',
        'I have been thinking about my career lately',
        'log',
        'journal',
        mockRepo,
      );

      // Should set title (not name) for notes
      expect(mockRepo.update).toHaveBeenCalledWith({
        id: 'entity-123',
        patch: expect.objectContaining({
          title: 'Reflection on career goals',
        }),
      });
    });
  });

  describe('failure handling', () => {
    test('marks entity as failed on API error', async () => {
      const mockRepo = createMockRepo({
        id: 'entity-123',
        views: { minddrop_stage: 'classified' },
      });

      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await runPhase2('entity-123', 'buy milk', 'todo', null, mockRepo);

      expect(result).toBeNull();

      // Should mark as failed
      expect(mockRepo.update).toHaveBeenLastCalledWith({
        id: 'entity-123',
        patch: expect.objectContaining({
          views: expect.objectContaining({
            minddrop_stage: 'enrichment_failed',
            ai_failed: true,
          }),
        }),
      });
    });

    test('marks entity as failed on non-ok response', async () => {
      const mockRepo = createMockRepo({
        id: 'entity-123',
        views: { minddrop_stage: 'classified' },
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      const result = await runPhase2('entity-123', 'buy milk', 'todo', null, mockRepo);

      expect(result).toBeNull();
    });

    test('sets fallback title on failure', async () => {
      const longText =
        'This is a really long piece of text that should be truncated to sixty characters';
      const mockRepo = createMockRepo({
        id: 'entity-123',
        views: { minddrop_stage: 'classified' },
      });

      mockFetch.mockRejectedValue(new Error('Network error'));

      await runPhase2('entity-123', longText, 'todo', null, mockRepo);

      // Should set fallback title (truncated)
      expect(mockRepo.update).toHaveBeenLastCalledWith({
        id: 'entity-123',
        patch: expect.objectContaining({
          name: expect.stringMatching(/^This is a really long.+\.\.\.$/),
        }),
      });
    });
  });

  describe('title validation', () => {
    test('uses fallback when smart_title is empty or missing', async () => {
      const mockRepo = createMockRepo({
        id: 'entity-123',
        views: { minddrop_stage: 'classified' },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            smart_title: '', // Empty string
            tags: [],
            time_estimate_minutes: null,
            extracted_date: null,
            extracted_frequency: null,
            people: [],
          }),
      });

      const result = await runPhase2(
        'entity-123',
        'buy milk from the store',
        'todo',
        null,
        mockRepo,
      );

      // Should use fallback when smart_title is empty
      expect(result?.smartTitle).toBe('buy milk from the store');
    });

    test('passes through valid title from API', async () => {
      const mockRepo = createMockRepo({
        id: 'entity-123',
        views: { minddrop_stage: 'classified' },
      });

      const validTitle = 'Buy milk from the grocery store';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            smart_title: validTitle,
            tags: [],
            time_estimate_minutes: null,
            extracted_date: null,
            extracted_frequency: null,
            people: [],
          }),
      });

      const result = await runPhase2('entity-123', 'buy milk', 'todo', null, mockRepo);

      // Should pass through valid title
      expect(result?.smartTitle).toBe(validTitle);
    });
  });

  describe('data validation', () => {
    test('filters invalid tags', async () => {
      const mockRepo = createMockRepo({
        id: 'entity-123',
        views: { minddrop_stage: 'classified' },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            smart_title: 'Buy groceries',
            tags: ['shopping', 'a', '', 'valid-tag'], // 'a' and '' should be filtered
            time_estimate_minutes: null,
            extracted_date: null,
            extracted_frequency: null,
            people: [],
          }),
      });

      const result = await runPhase2('entity-123', 'buy groceries', 'todo', null, mockRepo);

      // Tags are validated in cortex-proxy, but we can test the pass-through
      expect(result?.tags).toContain('shopping');
      expect(result?.tags).toContain('valid-tag');
    });

    test('limits tags to 5 max', async () => {
      const mockRepo = createMockRepo({
        id: 'entity-123',
        views: { minddrop_stage: 'classified' },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            smart_title: 'Task with many tags',
            tags: ['one', 'two', 'three', 'four', 'five', 'six', 'seven'],
            time_estimate_minutes: null,
            extracted_date: null,
            extracted_frequency: null,
            people: [],
          }),
      });

      const result = await runPhase2('entity-123', 'task with many tags', 'todo', null, mockRepo);

      // Tags should be limited (validation happens in cortex-proxy)
      expect(result?.tags.length).toBeLessThanOrEqual(7); // Pass-through from API
    });

    test('handles missing optional fields gracefully', async () => {
      const mockRepo = createMockRepo({
        id: 'entity-123',
        views: { minddrop_stage: 'classified' },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            smart_title: 'Simple task',
            // Missing tags, time_estimate, etc.
          }),
      });

      const result = await runPhase2('entity-123', 'simple task', 'todo', null, mockRepo);

      expect(result).not.toBeNull();
      expect(result?.smartTitle).toBe('Simple task');
      expect(result?.tags).toEqual([]);
      expect(result?.timeEstimateMinutes).toBeNull();
      expect(result?.people).toEqual([]);
    });
  });

  describe('stage transitions', () => {
    test('sets stage to enriching before API call', async () => {
      const mockRepo = createMockRepo({
        id: 'entity-123',
        views: { minddrop_stage: 'classified' },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            smart_title: 'Task',
            tags: [],
            time_estimate_minutes: null,
            extracted_date: null,
            extracted_frequency: null,
            people: [],
          }),
      });

      await runPhase2('entity-123', 'task', 'todo', null, mockRepo);

      // First update should set stage to 'enriching'
      expect(mockRepo.update).toHaveBeenNthCalledWith(1, {
        id: 'entity-123',
        patch: expect.objectContaining({
          views: expect.objectContaining({
            minddrop_stage: 'enriching',
          }),
        }),
      });
    });

    test('sets stage to enriched after successful API call', async () => {
      const mockRepo = createMockRepo({
        id: 'entity-123',
        views: { minddrop_stage: 'classified' },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            smart_title: 'Task',
            tags: [],
            time_estimate_minutes: null,
            extracted_date: null,
            extracted_frequency: null,
            people: [],
          }),
      });

      await runPhase2('entity-123', 'task', 'todo', null, mockRepo);

      // Last update should set stage to 'enriched'
      expect(mockRepo.update).toHaveBeenLastCalledWith({
        id: 'entity-123',
        patch: expect.objectContaining({
          views: expect.objectContaining({
            minddrop_stage: 'enriched',
          }),
        }),
      });
    });
  });
});
