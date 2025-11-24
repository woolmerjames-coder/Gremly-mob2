/**
 * Tests for Mind Drop canonical intent resolution
 *
 * Verifies that canonical intent correctly classifies different text types.
 * This tests CLASSIFICATION LOGIC, not chip display.
 *
 * Chip display is now simplified: chips show based on final entity type from Stage A,
 * not on confidence scores or suppression flags.
 */

import { resolveCanonicalIntent } from '../lib/cortex/intents/canonicalIntent';

describe('Mind Drop Canonical Intent Resolution', () => {
  describe('Clear reflective logs', () => {
    it('should classify "Just thinking about maybe starting a side hustle someday" as log', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'note',
        ruleConfidence: 0.45,
        aiCategory: 'log',
        aiConfidence: 0.45, // 0-1 scale
        text: 'Just thinking about maybe starting a side hustle someday',
      });

      expect(result.type).toBe('log');
      expect(result.suppressChips).toBe(false); // suppressChips deprecated - chips based on entity type
      expect(result.allowAutoCreate).toBe(true); // Reflection boost: auto-create
      expect(result.reasoning).toContain('Reflection'); // Should trigger reflection boost

      // The key: this should be treated as a log
      expect(result.type).not.toBe('ignore');
    });

    it('should auto-classify "Wondering if I should change careers" as log', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'note',
        ruleConfidence: 0.5,
        aiCategory: 'log',
        aiConfidence: 0.4,
        text: 'Wondering if I should change careers',
      });

      expect(result.type).toBe('log');
      expect(result.suppressChips).toBe(false); // suppressChips deprecated
    });

    it('should auto-classify "Had a really productive conversation with Alex today" as log', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'note',
        ruleConfidence: 0.6,
        aiCategory: 'log',
        aiConfidence: 0.55,
        text: 'Had a really productive conversation with Alex today',
      });

      expect(result.type).toBe('log');
      expect(result.suppressChips).toBe(false);
    });
  });

  describe('Ambiguous cases', () => {
    it('should classify ambiguous "Maybe I should finally email my accountant" as todo', () => {
      // This is ambiguous - could be a todo or just a thought
      const result = resolveCanonicalIntent({
        ruleKind: 'todo',
        ruleConfidence: 0.65,
        aiCategory: 'todo',
        aiConfidence: 0.6,
        text: 'Maybe I should finally email my accountant',
      });

      // Should be todo, but not auto-create due to "maybe" vagueness
      expect(result.type).toBe('todo');
      expect(result.allowAutoCreate).toBe(false);
      expect(result.suppressChips).toBe(false); // suppressChips deprecated
    });

    it('should classify medium-confidence todo correctly', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'todo',
        ruleConfidence: 0.7,
        aiCategory: 'todo',
        aiConfidence: 0.65,
        text: 'Email Sarah about the project',
      });

      expect(result.type).toBe('todo');
      expect(result.allowAutoCreate).toBe(false); // Below 0.85 threshold
      expect(result.suppressChips).toBe(false); // suppressChips deprecated
    });
  });

  describe('Reflection safety override', () => {
    it('should convert low-confidence ignore to log for reflection text', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'none',
        ruleConfidence: 0,
        aiCategory: 'ignore',
        aiConfidence: 0.3,
        text: 'Just thinking about maybe starting a side hustle someday',
      });

      expect(result.type).toBe('log');
      expect(result.reasoning).toContain('Reflection safety');
    });

    it('should preserve high-confidence ignore even with reflection keywords', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'none',
        ruleConfidence: 0,
        aiCategory: 'ignore',
        aiConfidence: 0.85,
        text: 'Just thinking this app is broken',
      });

      expect(result.type).toBe('ignore');
      expect(result.suppressChips).toBe(true);
    });
  });
});
