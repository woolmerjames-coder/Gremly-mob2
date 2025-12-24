/**
 * useMindDropSubmit SubmitResult Interface Tests
 *
 * Tests that the SubmitResult interface properly exposes confidence,
 * subtype, and dueDate fields for consumer use (e.g., Gremly speech bubble).
 *
 * These are type-level and contract tests - the actual hook behavior is tested
 * in integration tests.
 */

import type { SubmitResult } from '../../hooks/useMindDropSubmit';

describe('SubmitResult interface', () => {
  describe('type shape', () => {
    it('should include confidence field', () => {
      const result: SubmitResult = {
        success: true,
        dropId: 'drop-123',
        entityId: 'entity-456',
        bucket: 'todo',
        confidence: 0.85,
      };

      expect(result.confidence).toBe(0.85);
    });

    it('should include subtype field for log bucket', () => {
      const result: SubmitResult = {
        success: true,
        dropId: 'drop-123',
        entityId: 'entity-456',
        bucket: 'log',
        subtype: 'journal',
      };

      expect(result.subtype).toBe('journal');
    });

    it('should include dueDate field for todo bucket', () => {
      const result: SubmitResult = {
        success: true,
        dropId: 'drop-123',
        entityId: 'entity-456',
        bucket: 'todo',
        dueDate: '2025-12-27',
      };

      expect(result.dueDate).toBe('2025-12-27');
    });

    it('should allow null subtype', () => {
      const result: SubmitResult = {
        success: true,
        dropId: 'drop-123',
        entityId: 'entity-456',
        bucket: 'log',
        subtype: null,
      };

      expect(result.subtype).toBeNull();
    });

    it('should allow null dueDate', () => {
      const result: SubmitResult = {
        success: true,
        dropId: 'drop-123',
        entityId: 'entity-456',
        bucket: 'todo',
        dueDate: null,
      };

      expect(result.dueDate).toBeNull();
    });

    it('should allow undefined optional fields', () => {
      const result: SubmitResult = {
        success: true,
        dropId: 'drop-123',
      };

      expect(result.confidence).toBeUndefined();
      expect(result.subtype).toBeUndefined();
      expect(result.dueDate).toBeUndefined();
    });
  });

  describe('failure result', () => {
    it('should include error on failure', () => {
      const result: SubmitResult = {
        success: false,
        dropId: 'drop-123',
        error: new Error('Test error'),
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('Test error');
    });

    it('should not have entity fields on failure', () => {
      const result: SubmitResult = {
        success: false,
        dropId: 'drop-123',
        error: new Error('Test error'),
      };

      expect(result.entityId).toBeUndefined();
      expect(result.bucket).toBeUndefined();
    });
  });

  describe('bucket types', () => {
    it('should accept todo bucket', () => {
      const result: SubmitResult = {
        success: true,
        dropId: 'drop-123',
        bucket: 'todo',
      };

      expect(result.bucket).toBe('todo');
    });

    it('should accept habit bucket', () => {
      const result: SubmitResult = {
        success: true,
        dropId: 'drop-123',
        bucket: 'habit',
      };

      expect(result.bucket).toBe('habit');
    });

    it('should accept log bucket', () => {
      const result: SubmitResult = {
        success: true,
        dropId: 'drop-123',
        bucket: 'log',
      };

      expect(result.bucket).toBe('log');
    });
  });

  describe('log subtype values', () => {
    it('should accept journal subtype', () => {
      const result: SubmitResult = {
        success: true,
        dropId: 'drop-123',
        bucket: 'log',
        subtype: 'journal',
      };

      expect(result.subtype).toBe('journal');
    });

    it('should accept idea subtype', () => {
      const result: SubmitResult = {
        success: true,
        dropId: 'drop-123',
        bucket: 'log',
        subtype: 'idea',
      };

      expect(result.subtype).toBe('idea');
    });

    it('should accept general subtype', () => {
      const result: SubmitResult = {
        success: true,
        dropId: 'drop-123',
        bucket: 'log',
        subtype: 'general',
      };

      expect(result.subtype).toBe('general');
    });
  });
});

describe('SubmitResult usage for speech bubble', () => {
  it('should provide all data needed for high-confidence todo speech', () => {
    const result: SubmitResult = {
      success: true,
      dropId: 'drop-123',
      entityId: 'todo-456',
      bucket: 'todo',
      confidence: 0.92,
      dueDate: '2025-12-27',
    };

    // Consumer code pattern (like CatchAllNotepad)
    expect(result.success).toBe(true);
    expect(result.bucket).toBe('todo');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.dueDate).toBeTruthy();

    // This would generate: "On it — due Dec 27."
  });

  it('should provide all data needed for log-journal speech', () => {
    const result: SubmitResult = {
      success: true,
      dropId: 'drop-123',
      entityId: 'note-456',
      bucket: 'log',
      confidence: 0.88,
      subtype: 'journal',
    };

    expect(result.success).toBe(true);
    expect(result.bucket).toBe('log');
    expect(result.subtype).toBe('journal');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);

    // This would generate: "Saved to your journal."
  });

  it('should provide data for medium-confidence fallback speech', () => {
    const result: SubmitResult = {
      success: true,
      dropId: 'drop-123',
      entityId: 'note-456',
      bucket: 'log',
      confidence: 0.6,
      subtype: null,
    };

    expect(result.success).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.confidence).toBeLessThan(0.8);

    // This would generate: "Saved as a log. Review in Sweep."
  });

  it('should provide data for low-confidence fallback speech', () => {
    const result: SubmitResult = {
      success: true,
      dropId: 'drop-123',
      entityId: 'note-456',
      bucket: 'log',
      confidence: 0.35,
    };

    expect(result.success).toBe(true);
    expect(result.confidence).toBeLessThan(0.5);

    // This would generate: "Saved. Review in Sweep."
  });
});
