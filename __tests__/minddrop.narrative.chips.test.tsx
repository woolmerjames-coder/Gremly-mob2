/**
 * Tests for Mind Drop narrative chip suppression
 *
 * Verifies that canonical intent prevents forced chips for clear logs.
 * Clear reflective text should auto-log without chips.
 * Ambiguous text should show chips for clarification.
 */

import { resolveCanonicalIntent } from '../lib/cortex/intents/canonicalIntent';

describe('Mind Drop Narrative Chip Suppression', () => {
  describe('Clear reflective logs - NO chips', () => {
    it('should NOT show chips for "Just thinking about maybe starting a side hustle someday"', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'note',
        ruleConfidence: 0.45,
        aiCategory: 'log',
        aiConfidence: 0.45, // 0-1 scale
        text: 'Just thinking about maybe starting a side hustle someday',
      });

      expect(result.type).toBe('log');
      expect(result.suppressChips).toBe(false); // Don't suppress, but auto-create
      expect(result.allowAutoCreate).toBe(false); // Low confidence, but still log

      // The key: this should be treated as a log, not trigger narrative chips
      expect(result.type).not.toBe('ignore');
    });

    it('should auto-log "Wondering if I should change careers"', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'note',
        ruleConfidence: 0.5,
        aiCategory: 'log',
        aiConfidence: 0.4,
        text: 'Wondering if I should change careers',
      });

      expect(result.type).toBe('log');
      expect(result.suppressChips).toBe(false);
    });

    it('should auto-log "Had a really productive conversation with Alex today"', () => {
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

  describe('Ambiguous cases - SHOW chips', () => {
    it('should show chips for "Maybe I should finally email my accountant" (todo vs log)', () => {
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
      expect(result.suppressChips).toBe(false);
    });

    it('should show chips for medium-confidence todo', () => {
      const result = resolveCanonicalIntent({
        ruleKind: 'todo',
        ruleConfidence: 0.7,
        aiCategory: 'todo',
        aiConfidence: 0.65,
        text: 'Email Sarah about the project',
      });

      expect(result.type).toBe('todo');
      expect(result.allowAutoCreate).toBe(false); // Below 0.85 threshold
      expect(result.suppressChips).toBe(false); // Should show chips
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
