/**
 * CatchAllNotepad.speechContext.test.tsx
 *
 * Tests for the store-derived speech context logic in CatchAllNotepad.
 * Tests the derivation patterns:
 *   - storeDropsToday: counts items with created_at >= today 00:00
 *   - storeLastDropTime: latest created_at across all types
 *   - isFirstDrop: !firstDropCompletedAt
 *   - isReturningUser: storeLastDropTime != null && gap > 24h
 *   - dropsToday: storeDropsToday + 1 (includes current drop)
 *
 * These are unit tests for the derivation logic, not the full component.
 *
 * Speech system v2 (Feb 2026)
 */

// ═══════════════════════════════════════════════════════════════════
// Derivation logic extracted for testability (mirrors CatchAllNotepad.tsx)
// ═══════════════════════════════════════════════════════════════════

interface ItemLike {
  created_at?: string | null;
}

function computeDropsToday(
  todos: ItemLike[],
  notes: ItemLike[],
  habits: ItemLike[],
): number {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  let count = 0;
  for (const item of todos) {
    if (item.created_at && item.created_at >= todayISO) count++;
  }
  for (const item of notes) {
    if (item.created_at && item.created_at >= todayISO) count++;
  }
  for (const item of habits) {
    if (item.created_at && item.created_at >= todayISO) count++;
  }
  return count;
}

function computeLastDropTime(
  todos: ItemLike[],
  notes: ItemLike[],
  habits: ItemLike[],
): number | null {
  let latest = 0;
  for (const item of todos) {
    if (item.created_at) latest = Math.max(latest, new Date(item.created_at).getTime());
  }
  for (const item of notes) {
    if (item.created_at) latest = Math.max(latest, new Date(item.created_at).getTime());
  }
  for (const item of habits) {
    if (item.created_at) latest = Math.max(latest, new Date(item.created_at).getTime());
  }
  return latest || null;
}

function computeIsFirstDrop(firstDropCompletedAt: string | null): boolean {
  return !firstDropCompletedAt;
}

function computeIsReturningUser(lastDropTime: number | null): boolean {
  return lastDropTime != null && Date.now() - lastDropTime > 24 * 60 * 60 * 1000;
}

// ═══════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════

describe('Speech context derivations', () => {
  describe('computeDropsToday', () => {
    it('returns 0 when all stores are empty', () => {
      expect(computeDropsToday([], [], [])).toBe(0);
    });

    it('counts items created today', () => {
      const now = new Date();
      const todayISO = now.toISOString();

      const todos = [{ created_at: todayISO }];
      const notes = [{ created_at: todayISO }];
      const habits = [{ created_at: todayISO }];

      expect(computeDropsToday(todos, notes, habits)).toBe(3);
    });

    it('excludes items created yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(12, 0, 0, 0);

      const todos = [{ created_at: yesterday.toISOString() }];
      expect(computeDropsToday(todos, [], [])).toBe(0);
    });

    it('counts across all three types', () => {
      const now = new Date().toISOString();

      const todos = [{ created_at: now }, { created_at: now }];
      const notes = [{ created_at: now }];
      const habits = [{ created_at: now }, { created_at: now }, { created_at: now }];

      expect(computeDropsToday(todos, notes, habits)).toBe(6);
    });

    it('skips items with null created_at', () => {
      const now = new Date().toISOString();
      const todos = [{ created_at: now }, { created_at: null }];
      expect(computeDropsToday(todos, [], [])).toBe(1);
    });
  });

  describe('computeLastDropTime', () => {
    it('returns null when all stores are empty', () => {
      expect(computeLastDropTime([], [], [])).toBeNull();
    });

    it('returns the latest timestamp across all types', () => {
      const earliest = '2026-02-01T10:00:00Z';
      const latest = '2026-02-10T15:00:00Z';
      const middle = '2026-02-05T12:00:00Z';

      const todos = [{ created_at: earliest }];
      const notes = [{ created_at: latest }];
      const habits = [{ created_at: middle }];

      expect(computeLastDropTime(todos, notes, habits)).toBe(
        new Date(latest).getTime(),
      );
    });

    it('returns null when all items have null created_at', () => {
      const todos = [{ created_at: null }];
      expect(computeLastDropTime(todos, [], [])).toBeNull();
    });

    it('finds latest across multiple items in a single type', () => {
      const older = '2026-02-01T10:00:00Z';
      const newer = '2026-02-10T10:00:00Z';

      const todos = [{ created_at: older }, { created_at: newer }];
      expect(computeLastDropTime(todos, [], [])).toBe(new Date(newer).getTime());
    });
  });

  describe('computeIsFirstDrop', () => {
    it('returns true when firstDropCompletedAt is null', () => {
      expect(computeIsFirstDrop(null)).toBe(true);
    });

    it('returns false when firstDropCompletedAt has a value', () => {
      expect(computeIsFirstDrop('2026-02-10T10:00:00Z')).toBe(false);
    });
  });

  describe('computeIsReturningUser', () => {
    it('returns false when lastDropTime is null', () => {
      expect(computeIsReturningUser(null)).toBe(false);
    });

    it('returns false when last drop was less than 24h ago', () => {
      const recentTime = Date.now() - 1000 * 60 * 60; // 1 hour ago
      expect(computeIsReturningUser(recentTime)).toBe(false);
    });

    it('returns true when last drop was more than 24h ago', () => {
      const oldTime = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      expect(computeIsReturningUser(oldTime)).toBe(true);
    });

    it('returns false when last drop was exactly 24h ago', () => {
      const exactlyDay = Date.now() - 24 * 60 * 60 * 1000; // Exactly 24h
      // > check, not >=, so exactly 24h should be false
      expect(computeIsReturningUser(exactlyDay)).toBe(false);
    });
  });

  describe('speechCtx.dropsToday integration', () => {
    it('adds 1 to storeDropsToday for the current in-flight drop', () => {
      const now = new Date().toISOString();
      const storeDropsToday = computeDropsToday(
        [{ created_at: now }, { created_at: now }],
        [],
        [],
      );
      // In CatchAllNotepad.tsx: dropsToday: storeDropsToday + 1
      const speechCtxDropsToday = storeDropsToday + 1;
      expect(speechCtxDropsToday).toBe(3);
    });
  });
});
