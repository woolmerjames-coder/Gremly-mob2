/**
 * useMindDropSubmit SubmitResult Interface Tests
 *
 * Tests the SubmitResult interface. Since stage 11 of the Mind Drop rethink it
 * carries no guessed kind: the classifier sorts the drop after the tap.
 *
 * These are type-level and contract tests - the actual hook behavior is tested
 * in integration tests.
 */

import type { SubmitResult, SubmitContext } from '../../hooks/useMindDropSubmit';

describe('SubmitResult interface', () => {
  it('carries the drop id and, after a drop, whether it crossed the fed line', () => {
    const result: SubmitResult = { success: true, dropId: 'drop-123', justCrossedFed: false };
    expect(result.success).toBe(true);
    expect(result.dropId).toBe('drop-123');
    expect(result.justCrossedFed).toBe(false);
  });

  it('carries the error on failure', () => {
    const result: SubmitResult = {
      success: false,
      dropId: 'drop-123',
      error: new Error('Test error'),
    };
    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('Test error');
    expect(result.entityId).toBeUndefined();
  });

  it('allows a due date', () => {
    const result: SubmitResult = { success: true, dropId: 'drop-123', dueDate: null };
    expect(result.dueDate).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SubmitContext interface - dueDayOverride field
// ─────────────────────────────────────────────────────────────────────────────

describe('SubmitContext interface', () => {
  describe('dueDayOverride field', () => {
    it('accepts dueDayOverride as a string date', () => {
      const context: SubmitContext = {
        source: 'today',
        dueDayOverride: '2026-02-10',
      };

      expect(context.dueDayOverride).toBe('2026-02-10');
    });

    it('accepts dueDayOverride as null (explicit no-override)', () => {
      const context: SubmitContext = {
        source: 'today',
        dueDayOverride: null,
      };

      expect(context.dueDayOverride).toBeNull();
    });

    it('allows omitting dueDayOverride (defaults to undefined)', () => {
      const context: SubmitContext = {
        source: 'minddrop',
      };

      expect(context.dueDayOverride).toBeUndefined();
    });

    it('coexists with other context fields', () => {
      const context: SubmitContext = {
        source: 'today',
        spaceId: 'space-123',
        dueDayOverride: '2026-03-15',
        dropId: 'drop-456',
      };

      expect(context.source).toBe('today');
      expect(context.spaceId).toBe('space-123');
      expect(context.dueDayOverride).toBe('2026-03-15');
      expect(context.dropId).toBe('drop-456');
    });
  });
});
