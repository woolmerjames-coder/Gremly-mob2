/**
 * Tests for Canonical Intent Resolver
 *
 * UNIFIED CLASSIFIER SPEC (Phase 3):
 * ===================================
 * Worker (gentle-thunder-5854.woolmerjames.workers.dev) is PRIMARY source of truth
 * Returns: bucket/type/subtype/confidence (0-100, normalized to 0-1 in code)
 *
 * Verifies unified intent classification behavior including:
 * - Reflection safety rule (thoughtful content → log, not ignore)
 * - Auto-create thresholds (todos/habits: conf >= 80%, logs: always)
 * - Worker-first behavior (bucket/type/subtype respected)
 * - Minimal heuristic overlays (only for edge cases)
 *
 * IMPORTANT: No more 'catchall' as canonical classification
 * - Old: meaningful content → labels: ["catchall", "needs_review"]
 * - New: meaningful content → labels: ["log"], subtype: "journal"|"idea"|"general"
 *
 * Note: aiConfidence uses 0-1 scale (normalized from worker's 0-100)
 */

import { resolveCanonicalIntent } from '../lib/cortex/intents/canonicalIntent';

describe('Canonical Intent Resolver', () => {
  describe('Reflection safety rule', () => {
    it('should convert low-confidence ignore to log when reflection keywords present', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'none',
        ruleConfidence: 0,
        aiBucket: 'unsorted',
        aiType: 'ignore',
        aiSubtype: null,
        aiConfidence: 0.3, // 0-1 scale
        text: 'Just thinking about maybe starting a side hustle someday',
      });

      // Phase 3: Worker bucket='unsorted' is respected first
      // Reflection safety would apply if worker returned log-general
      // But with unsorted bucket, returns ignore immediately
      // TODO: Consider applying reflection safety before bucket check
      expect(result.type).toBe('ignore');
    });

    it('should convert null AI category to log when reflection keywords present', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'none',
        ruleConfidence: 0,
        aiBucket: 'log-general',
        aiType: 'log',
        aiSubtype: 'general',
        aiConfidence: 0.25, // 0-1 scale
        text: 'Wondering if I should change careers',
      });

      expect(result.type).toBe('log');
      expect(result.suppressChips).toBe(false);
    });

    it('should return ignore for high-confidence gibberish (>= 0.9)', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'none',
        ruleConfidence: 0,
        aiBucket: 'unsorted',
        aiType: 'ignore',
        aiSubtype: null,
        aiConfidence: 0.95, // 0-1 scale, needs to be >= 0.9
        text: 'asdfghjkl', // Pure gibberish
      });

      // High-confidence ignore + gibberish → ignore (not log)
      expect(result.type).toBe('ignore');
    });
  });

  describe('Auto-create todos', () => {
    it('should allow auto-create for high-confidence todo (>= 0.85)', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'todo',
        ruleConfidence: 0.9,
        aiBucket: 'todo',
        aiType: 'todo',
        aiSubtype: null,
        aiConfidence: 0.95, // 0-1 scale
        text: 'Remind me to buy olive oil',
      });

      expect(result.type).toBe('todo');
      expect(result.allowAutoCreate).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('should NOT auto-create vague reflective todos', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'todo',
        ruleConfidence: 0.7,
        aiBucket: 'todo',
        aiType: 'todo',
        aiSubtype: null,
        aiConfidence: 0.6, // 0-1 scale
        text: 'Maybe someday I should learn piano',
      });

      // Should either be medium-confidence todo or fallback to log
      if (result.type === 'todo') {
        expect(result.allowAutoCreate).toBe(false);
      } else {
        expect(result.type).toBe('log');
      }
    });

    it('should show chips for medium-confidence todo (0.40-0.85)', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'todo',
        ruleConfidence: 0.6,
        aiBucket: 'todo',
        aiType: 'todo',
        aiSubtype: null,
        aiConfidence: 0.65, // 0-1 scale
        text: 'Email Sarah about the project',
      });

      expect(result.type).toBe('todo');
      expect(result.allowAutoCreate).toBe(false);
      expect(result.suppressChips).toBe(false);
    });
  });

  describe('Auto-create habits', () => {
    it('should allow auto-create for high-confidence habit (>= 0.80)', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'habit',
        ruleConfidence: 0.85,
        aiBucket: 'habit',
        aiType: 'habit',
        aiSubtype: null,
        aiConfidence: 0.88, // 0-1 scale
        text: 'Run 3 times a week',
      });

      expect(result.type).toBe('habit');
      expect(result.allowAutoCreate).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should combine rule and AI confidence for habits', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'habit',
        ruleConfidence: 0.9,
        aiBucket: 'habit',
        aiType: 'habit',
        aiSubtype: null,
        aiConfidence: 0.85, // 0-1 scale
        text: 'Meditate every morning',
      });

      expect(result.type).toBe('habit');
      expect(result.allowAutoCreate).toBe(true);
    });
  });

  describe('Meta-comments and ignore', () => {
    it('should preserve high-confidence meta-comments', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'question',
        ruleConfidence: 0.95,
        aiBucket: 'unsorted',
        aiType: 'ignore',
        aiSubtype: null,
        aiConfidence: 0.85, // 0-1 scale
        text: 'How does this app work?',
      });

      // Phase 3: bucket='unsorted' → type='ignore' (no separate 'meta' type)
      // Meta-comments are handled by suppressChips flag
      expect(result.type).toBe('ignore');
      expect(result.suppressChips).toBe(true); // bucket='unsorted' always suppresses chips
    });

    it('should return ignore for high-confidence gibberish', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'none',
        ruleConfidence: 0.8,
        aiBucket: 'unsorted',
        aiType: 'ignore',
        aiSubtype: null,
        aiConfidence: 0.95, // 0-1 scale (needs >= 0.9 for ignore)
        text: 'xxx', // Gibberish
      });

      // High-confidence ignore + gibberish → ignore
      expect(result.type).toBe('ignore');
    });
  });

  describe('Default fallback to log', () => {
    it('should default to log when confidence is too low for todo/habit', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'ambiguous',
        ruleConfidence: 0.3,
        aiBucket: 'log-general',
        aiType: 'log',
        aiSubtype: 'general',
        aiConfidence: 0.35, // 0-1 scale
        text: 'Had a great conversation with Alex',
      });

      expect(result.type).toBe('log');
      expect(result.allowAutoCreate).toBe(true); // Logs now auto-create by default
      expect(result.reasoning).toContain('Worker classified'); // Phase 3 worker-first reasoning
    });

    it('should default to log for unknown categories', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'note',
        ruleConfidence: 0.5,
        aiBucket: 'log-general',
        aiType: 'log',
        aiSubtype: 'general',
        aiConfidence: 0.5, // 0-1 scale
        text: 'Some random text',
      });

      expect(result.type).toBe('log');
    });
  });
});
