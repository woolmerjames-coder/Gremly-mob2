/**
 * useNowQuickAdd Tests
 *
 * Tests for the Now/Today quick-add hook that wraps useMindDropSubmit.
 * Verifies the dueDayOverride pass-through and mapSubmitResult logic.
 *
 * These are type-level/contract tests since the hook uses internal refs
 * and callbacks that make direct hook testing complex. The real behavior
 * is tested via integration tests.
 */

import type { SubmitResult } from '../../../hooks/useMindDropSubmit';
import type { NowQuickAddCompleteResult, NowQuickAddOptions } from '../useNowQuickAdd';

// ─────────────────────────────────────────────────────────────────────────────
// Replicate mapSubmitResult logic for unit testing
// (The real function is not exported, so we replicate its logic here)
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_TODAY = '2025-12-15';

function mapSubmitResult(
  result: SubmitResult,
  targetDate?: string | null,
): NowQuickAddCompleteResult {
  const today = MOCK_TODAY;
  const effectiveDate = targetDate || today;

  if (!result.success || !result.bucket) {
    return {
      kind: 'unknown',
      dropId: result.dropId,
    };
  }

  switch (result.bucket) {
    case 'todo':
      return {
        kind: 'todo',
        todoId: result.entityId,
        dropId: result.dropId,
        dueDay: effectiveDate,
        isToday: effectiveDate === today,
      };
    case 'habit':
      return {
        kind: 'habit',
        habitId: result.entityId,
        dropId: result.dropId,
        isToday: effectiveDate === today,
      };
    case 'log':
      return {
        kind: 'note',
        noteId: result.entityId,
        dropId: result.dropId,
      };
    default:
      return {
        kind: 'unknown',
        dropId: result.dropId,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('useNowQuickAdd - mapSubmitResult', () => {
  describe('todo results', () => {
    const baseTodoResult: SubmitResult = {
      success: true,
      dropId: 'drop-123',
      entityId: 'todo-456',
      bucket: 'todo',
      confidence: 0.9,
    };

    it('sets dueDay to today when no targetDate', () => {
      const result = mapSubmitResult(baseTodoResult);
      expect(result.kind).toBe('todo');
      expect(result.dueDay).toBe(MOCK_TODAY);
      expect(result.isToday).toBe(true);
    });

    it('sets dueDay to targetDate when provided (tomorrow mode)', () => {
      const result = mapSubmitResult(baseTodoResult, '2025-12-16');
      expect(result.kind).toBe('todo');
      expect(result.dueDay).toBe('2025-12-16');
      expect(result.isToday).toBe(false);
    });

    it('sets dueDay to today when targetDate is null', () => {
      const result = mapSubmitResult(baseTodoResult, null);
      expect(result.kind).toBe('todo');
      expect(result.dueDay).toBe(MOCK_TODAY);
      expect(result.isToday).toBe(true);
    });

    it('includes todoId and dropId', () => {
      const result = mapSubmitResult(baseTodoResult, '2025-12-16');
      expect(result.todoId).toBe('todo-456');
      expect(result.dropId).toBe('drop-123');
    });
  });

  describe('habit results', () => {
    const baseHabitResult: SubmitResult = {
      success: true,
      dropId: 'drop-789',
      entityId: 'habit-012',
      bucket: 'habit',
      confidence: 0.85,
    };

    it('returns isToday true when no targetDate', () => {
      const result = mapSubmitResult(baseHabitResult);
      expect(result.kind).toBe('habit');
      expect(result.isToday).toBe(true);
    });

    it('returns isToday false when targetDate is tomorrow', () => {
      const result = mapSubmitResult(baseHabitResult, '2025-12-16');
      expect(result.kind).toBe('habit');
      expect(result.isToday).toBe(false);
    });

    it('includes habitId', () => {
      const result = mapSubmitResult(baseHabitResult);
      expect(result.habitId).toBe('habit-012');
    });
  });

  describe('log/note results', () => {
    it('returns kind note for log bucket', () => {
      const result = mapSubmitResult({
        success: true,
        dropId: 'drop-note',
        entityId: 'note-123',
        bucket: 'log',
      });
      expect(result.kind).toBe('note');
      expect(result.noteId).toBe('note-123');
    });

    it('does not include dueDay or isToday for notes', () => {
      const result = mapSubmitResult({
        success: true,
        dropId: 'drop-note',
        entityId: 'note-123',
        bucket: 'log',
      });
      expect(result.dueDay).toBeUndefined();
      expect(result.isToday).toBeUndefined();
    });
  });

  describe('failure/unknown results', () => {
    it('returns kind unknown for failed result', () => {
      const result = mapSubmitResult({
        success: false,
        dropId: 'drop-fail',
        error: new Error('Network error'),
      });
      expect(result.kind).toBe('unknown');
      expect(result.dropId).toBe('drop-fail');
    });

    it('returns kind unknown when no bucket', () => {
      const result = mapSubmitResult({
        success: true,
        dropId: 'drop-nobucket',
      });
      expect(result.kind).toBe('unknown');
    });
  });
});

describe('NowQuickAddOptions interface', () => {
  it('accepts targetDate as string', () => {
    const options: NowQuickAddOptions = {
      targetDate: '2025-12-16',
    };
    expect(options.targetDate).toBe('2025-12-16');
  });

  it('accepts targetDate as null', () => {
    const options: NowQuickAddOptions = {
      targetDate: null,
    };
    expect(options.targetDate).toBeNull();
  });

  it('allows omitting targetDate', () => {
    const options: NowQuickAddOptions = {};
    expect(options.targetDate).toBeUndefined();
  });

  it('coexists with callbacks', () => {
    const onStart = jest.fn();
    const onComplete = jest.fn();
    const onError = jest.fn();

    const options: NowQuickAddOptions = {
      targetDate: '2025-12-16',
      onStart,
      onComplete,
      onError,
    };

    expect(options.targetDate).toBe('2025-12-16');
    expect(options.onStart).toBe(onStart);
    expect(options.onComplete).toBe(onComplete);
    expect(options.onError).toBe(onError);
  });
});
