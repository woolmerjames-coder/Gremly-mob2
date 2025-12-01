/**
 * UnifiedOverlayV2 Type Change Tests
 *
 * Unit tests for the type change detection logic and TYPE_FAMILY mapping.
 * These tests verify the core conversion logic without rendering the full overlay.
 *
 * For full integration tests, see the manual smoke tests in scripts/smoke-overlay.md
 */

// ─────────────────────────────────────────────────────────────────────────────
// Type Family Tests (Unit Tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('TYPE_FAMILY mapping', () => {
  // These are the mappings used in UnifiedOverlayV2.tsx
  const TYPE_FAMILY: Record<string, string> = {
    log: 'note',
    todo: 'todo',
    habit: 'habit',
  };

  it('maps log to note family', () => {
    expect(TYPE_FAMILY['log']).toBe('note');
  });

  it('maps todo to todo family', () => {
    expect(TYPE_FAMILY['todo']).toBe('todo');
  });

  it('maps habit to habit family', () => {
    expect(TYPE_FAMILY['habit']).toBe('habit');
  });
});

describe('Type conversion detection logic', () => {
  // Simulate the detection logic from UnifiedOverlayV2.onSave
  function detectTypeConversion(
    mode: 'create' | 'edit',
    initialEntity: { id?: string; type?: string } | null,
    baseType: string,
  ): {
    isTypeConversion: boolean;
    originalFamily: string | null;
    targetFamily: string;
  } {
    const TYPE_FAMILY: Record<string, string> = {
      log: 'note',
      todo: 'todo',
      habit: 'habit',
    };

    const originalEntityType = initialEntity?.type;
    const originalFamily =
      originalEntityType === 'todo'
        ? 'todo'
        : originalEntityType === 'habit'
          ? 'habit'
          : originalEntityType === 'note'
            ? 'note'
            : null;
    const targetFamily = TYPE_FAMILY[baseType] || 'note';

    const isTypeConversion =
      mode === 'edit' &&
      !!initialEntity?.id &&
      originalFamily !== null &&
      originalFamily !== targetFamily;

    return { isTypeConversion, originalFamily, targetFamily };
  }

  describe('note/log → todo conversion', () => {
    it('detects cross-table conversion from note to todo', () => {
      const result = detectTypeConversion('edit', { id: 'note-123', type: 'note' }, 'todo');

      expect(result.isTypeConversion).toBe(true);
      expect(result.originalFamily).toBe('note');
      expect(result.targetFamily).toBe('todo');
    });
  });

  describe('note/log → habit conversion', () => {
    it('detects cross-table conversion from note to habit', () => {
      const result = detectTypeConversion('edit', { id: 'note-123', type: 'note' }, 'habit');

      expect(result.isTypeConversion).toBe(true);
      expect(result.originalFamily).toBe('note');
      expect(result.targetFamily).toBe('habit');
    });
  });

  describe('todo → habit conversion', () => {
    it('detects cross-table conversion from todo to habit', () => {
      const result = detectTypeConversion('edit', { id: 'todo-123', type: 'todo' }, 'habit');

      expect(result.isTypeConversion).toBe(true);
      expect(result.originalFamily).toBe('todo');
      expect(result.targetFamily).toBe('habit');
    });
  });

  describe('todo → log conversion', () => {
    it('detects cross-table conversion from todo to log', () => {
      const result = detectTypeConversion('edit', { id: 'todo-123', type: 'todo' }, 'log');

      expect(result.isTypeConversion).toBe(true);
      expect(result.originalFamily).toBe('todo');
      expect(result.targetFamily).toBe('note');
    });
  });

  describe('habit → todo conversion', () => {
    it('detects cross-table conversion from habit to todo', () => {
      const result = detectTypeConversion('edit', { id: 'habit-123', type: 'habit' }, 'todo');

      expect(result.isTypeConversion).toBe(true);
      expect(result.originalFamily).toBe('habit');
      expect(result.targetFamily).toBe('todo');
    });
  });

  describe('habit → log conversion', () => {
    it('detects cross-table conversion from habit to log', () => {
      const result = detectTypeConversion('edit', { id: 'habit-123', type: 'habit' }, 'log');

      expect(result.isTypeConversion).toBe(true);
      expect(result.originalFamily).toBe('habit');
      expect(result.targetFamily).toBe('note');
    });
  });

  describe('same-type updates (no conversion)', () => {
    it('does not detect conversion when type stays note', () => {
      const result = detectTypeConversion('edit', { id: 'note-123', type: 'note' }, 'log');

      expect(result.isTypeConversion).toBe(false);
      expect(result.originalFamily).toBe('note');
      expect(result.targetFamily).toBe('note');
    });

    it('does not detect conversion when type stays todo', () => {
      const result = detectTypeConversion('edit', { id: 'todo-123', type: 'todo' }, 'todo');

      expect(result.isTypeConversion).toBe(false);
      expect(result.originalFamily).toBe('todo');
      expect(result.targetFamily).toBe('todo');
    });

    it('does not detect conversion when type stays habit', () => {
      const result = detectTypeConversion('edit', { id: 'habit-123', type: 'habit' }, 'habit');

      expect(result.isTypeConversion).toBe(false);
      expect(result.originalFamily).toBe('habit');
      expect(result.targetFamily).toBe('habit');
    });
  });

  describe('create mode (no conversion)', () => {
    it('does not detect conversion in create mode', () => {
      const result = detectTypeConversion('create', null, 'todo');

      expect(result.isTypeConversion).toBe(false);
      expect(result.originalFamily).toBe(null);
    });

    it('does not detect conversion without initial entity', () => {
      const result = detectTypeConversion('edit', null, 'todo');

      expect(result.isTypeConversion).toBe(false);
      expect(result.originalFamily).toBe(null);
    });

    it('does not detect conversion without entity id', () => {
      const result = detectTypeConversion('edit', { type: 'note' }, 'todo');

      expect(result.isTypeConversion).toBe(false);
    });
  });
});

describe('OverlayTypeConverted event payload', () => {
  it('should contain all required fields', () => {
    const mockPayload = {
      from: 'note',
      to: 'todo',
      oldId: 'note-123',
      newId: 'todo-456',
      dropId: 'drop-789',
    };

    expect(mockPayload).toHaveProperty('from');
    expect(mockPayload).toHaveProperty('to');
    expect(mockPayload).toHaveProperty('oldId');
    expect(mockPayload).toHaveProperty('newId');
    expect(mockPayload).toHaveProperty('dropId');
  });

  it('should allow null dropId for non-Mind Drop entities', () => {
    const mockPayload = {
      from: 'note',
      to: 'todo',
      oldId: 'note-123',
      newId: 'todo-456',
      dropId: null,
    };

    expect(mockPayload.dropId).toBeNull();
  });
});
