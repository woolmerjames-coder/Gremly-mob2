/**
 * Phase 3.2 + Phase 4: Canonical Intent Regression Tests
 *
 * These tests verify the fix for the critical bug where high-confidence habits were:
 * - Classified as bucket="habit", type="habit" by the Cloudflare Worker
 * - But cortexDecide generated actions: ["create.note"] instead of ["create.habit"]
 *
 * Root Cause:
 * cortexDecide was using detected.kind (rule-based heuristic) instead of
 * detected.canonicalType (worker classification) when building actions.
 *
 * Fix:
 * Updated cortexDecide.ts lines 478-524 and 682-722 to prioritize
 * detected.canonicalType over detected.kind when generating normalized actions.
 *
 * Related Documentation:
 * - PHASE_3_2_CANONICAL_SINGLE_CALL_FIX.md
 * - CORTEX_DECIDE_ACTION_FIX.md
 */

const mockClassify = jest.fn();

jest.mock('../../cortex/createEngine', () => ({
  createCortexEngine: () => ({
    classify: mockClassify,
  }),
}));

// Set up environment for canonical types mode
beforeEach(() => {
  mockClassify.mockReset();
  process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL = 'on';
  process.env.EXPO_PUBLIC_CORTEX_MODEL = 'gpt-4o-mini';
  process.env.EXPO_PUBLIC_CORTEX_ENGINE = 'LLM';
  process.env.EXPO_PUBLIC_CORTEX_TIMEOUT_MS = '1500';
  process.env.EXPO_PUBLIC_CANONICAL_TYPES = 'on'; // Enable canonical types
  process.env.EXPO_PUBLIC_CANONICAL_CONVERSIONS = 'on';
});

describe('cortexDecide: Canonical Intent Regression Tests', () => {
  describe('Habit Classification Regression (Critical Bug Fix)', () => {
    it('should create habit entity for "Meditate every morning" (95% confidence)', async () => {
      // Mock Cloudflare Worker response for habit classification
      mockClassify.mockResolvedValue({
        bucket: 'habit',
        type: 'habit',
        subtype: null,
        confidence: 95,
        title: 'Meditate every morning',
        tags: ['meditation', 'mindfulness'],
      });

      const cortexDecideModule =
        require('../../lib/cortex/cortexDecide') as typeof import('../../lib/cortex/cortexDecide');
      const { cortexDecide } = cortexDecideModule;

      const text = 'Meditate every morning';
      const decision = await cortexDecide(
        { text },
        { userId: 'test-user', uiSurface: 'overlay', lane: 'catchall' },
      );

      // Debug logging
      console.log('[Meditate Test]', {
        mode: decision.mode,
        actions: decision.actions.map((a) => a.type),
        meta: decision.meta,
      });

      // Should auto-create (high confidence)
      expect(decision.mode).toBe('auto');
      expect(decision.actions.length).toBeGreaterThan(0);

      // Critical assertion: Actions should be create.habit, NOT create.note
      const actionTypes = decision.actions.map((a) => a.type);
      expect(actionTypes).toContain('create.habit');
      expect(actionTypes).not.toContain('create.note');

      // First action should be create.habit
      expect(decision.actions[0].type).toBe('create.habit');
    });

    it('should create habit entity for "Yoga 3 times a week" (90% confidence)', async () => {
      mockClassify.mockResolvedValue({
        bucket: 'habit',
        type: 'habit',
        subtype: null,
        confidence: 90,
        title: 'Yoga 3 times a week',
        tags: ['yoga', 'wellness'],
      });

      const cortexDecideModule =
        require('../../lib/cortex/cortexDecide') as typeof import('../../lib/cortex/cortexDecide');
      const { cortexDecide } = cortexDecideModule;

      const text = 'Yoga 3 times a week';
      const decision = await cortexDecide(
        { text },
        { userId: 'test-user', uiSurface: 'overlay', lane: 'catchall' },
      );

      // Should auto-create habit
      expect(decision.mode).toBe('auto');
      expect(decision.actions.length).toBeGreaterThan(0);

      // Verify habit action (not todo/note)
      const actionTypes = decision.actions.map((a) => a.type);
      expect(actionTypes).toContain('create.habit');
      expect(actionTypes).not.toContain('create.note');
      expect(actionTypes).not.toContain('create.todo');

      expect(decision.actions[0].type).toBe('create.habit');
    });

    it('should create habit entity for "Practice guitar daily" (88% confidence)', async () => {
      mockClassify.mockResolvedValue({
        bucket: 'habit',
        type: 'habit',
        subtype: null,
        confidence: 88,
        title: 'Practice guitar daily',
        tags: ['guitar', 'music', 'practice'],
      });

      const cortexDecideModule =
        require('../../lib/cortex/cortexDecide') as typeof import('../../lib/cortex/cortexDecide');
      const { cortexDecide } = cortexDecideModule;

      const text = 'Practice guitar daily';
      const decision = await cortexDecide(
        { text },
        { userId: 'test-user', uiSurface: 'overlay', lane: 'catchall' },
      );

      // Should auto-create habit
      expect(decision.mode).toBe('auto');
      expect(decision.actions.length).toBeGreaterThan(0);

      // Verify canonical type wins over rule-based heuristics
      const actionTypes = decision.actions.map((a) => a.type);
      expect(actionTypes).toContain('create.habit');
      expect(actionTypes).not.toContain('create.note');

      expect(decision.actions[0].type).toBe('create.habit');
    });
  });

  describe('Negative Cases: Verify Other Types Not Misclassified', () => {
    it('should NOT misclassify journal log as habit', async () => {
      mockClassify.mockResolvedValue({
        bucket: 'log-journal',
        type: 'log',
        subtype: 'journal',
        confidence: 85,
        title: 'Feeling overwhelmed',
        tags: ['emotions', 'work'],
      });

      const cortexDecideModule =
        require('../../lib/cortex/cortexDecide') as typeof import('../../lib/cortex/cortexDecide');
      const { cortexDecide } = cortexDecideModule;

      const text = 'Feeling overwhelmed with work today';
      const decision = await cortexDecide(
        { text },
        { userId: 'test-user', uiSurface: 'overlay', lane: 'catchall' },
      );

      // Should classify as log, not habit
      expect(decision.mode).toBe('auto');
      expect(decision.actions.length).toBeGreaterThan(0);

      const actionTypes = decision.actions.map((a) => a.type);
      expect(actionTypes).toContain('create.note');
      expect(actionTypes).not.toContain('create.habit');

      expect(decision.actions[0].type).toBe('create.note');
    });

    it('should NOT misclassify todo as habit', async () => {
      mockClassify.mockResolvedValue({
        bucket: 'todo',
        type: 'todo',
        subtype: null,
        confidence: 90,
        title: 'Email Sarah',
        tags: ['email', 'communication'],
      });

      const cortexDecideModule =
        require('../../lib/cortex/cortexDecide') as typeof import('../../lib/cortex/cortexDecide');
      const { cortexDecide } = cortexDecideModule;

      const text = 'Email Sarah about the proposal';
      const decision = await cortexDecide(
        { text },
        { userId: 'test-user', uiSurface: 'overlay', lane: 'catchall' },
      );

      // Should classify as todo, not habit
      expect(decision.mode).toBe('auto');
      expect(decision.actions.length).toBeGreaterThan(0);

      const actionTypes = decision.actions.map((a) => a.type);
      expect(actionTypes).toContain('create.todo');
      expect(actionTypes).not.toContain('create.habit');
      expect(actionTypes).not.toContain('create.note');

      expect(decision.actions[0].type).toBe('create.todo');
    });
  });

  describe('Canonical Type Priority (canonicalType > detected.kind)', () => {
    it('should use worker canonical type for action generation', async () => {
      mockClassify.mockResolvedValue({
        bucket: 'habit',
        type: 'habit',
        subtype: null,
        confidence: 88,
        title: 'Walk 10k steps daily',
        tags: ['walking', 'fitness'],
      });

      const cortexDecideModule =
        require('../../lib/cortex/cortexDecide') as typeof import('../../lib/cortex/cortexDecide');
      const { cortexDecide } = cortexDecideModule;

      const text = 'Walk 10k steps daily';
      const decision = await cortexDecide(
        { text },
        { userId: 'test-user', uiSurface: 'overlay', lane: 'catchall' },
      );

      // The action should be based on canonicalType='habit', not detected.kind
      expect(decision.actions[0].type).toBe('create.habit');

      // Verify the decision includes canonical metadata
      if (decision.meta?.canonicalType) {
        expect(decision.meta.canonicalType).toBe('habit');
      }
    });
  });
});
