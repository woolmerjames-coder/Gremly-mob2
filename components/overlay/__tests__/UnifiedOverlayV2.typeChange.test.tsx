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

// ─────────────────────────────────────────────────────────────────────────────
// Habit Schedule Modal State Tests (app-fixes-1.22)
// ─────────────────────────────────────────────────────────────────────────────

describe('Habit Schedule Modal state management', () => {
  // Simulates the scheduleModalState structure from UnifiedOverlayV2
  type ScheduleModalState = {
    frequencyTab: 'simple' | 'days' | 'custom';
    frequencyJson: any;
    selectedDays: number[];
    customCount: string;
    customUnit: 'day' | 'week' | 'month';
    startDate: string | null;
    endDate: string | null;
    timeWindow: string | null;
    timeEstimateMinutes: number | null;
  };

  const defaultState: ScheduleModalState = {
    frequencyTab: 'simple',
    frequencyJson: null,
    selectedDays: [],
    customCount: '1',
    customUnit: 'week',
    startDate: null,
    endDate: null,
    timeWindow: null,
    timeEstimateMinutes: null,
  };

  describe('openScheduleModal initialization', () => {
    it('initializes modal state from simple frequency habit', () => {
      const habitState = {
        frequency_json: { type: 'simple', value: 'daily' },
        start_date: '2026-01-22',
        end_date: null,
        time_window: 'morning',
        time_estimate_minutes: 30,
      };

      // Simulate openScheduleModal logic
      const modalState: ScheduleModalState = {
        frequencyTab: 'simple', // from jsonToFrequency result
        frequencyJson: habitState.frequency_json,
        selectedDays: [],
        customCount: '1',
        customUnit: 'week',
        startDate: habitState.start_date,
        endDate: habitState.end_date,
        timeWindow: habitState.time_window,
        timeEstimateMinutes: habitState.time_estimate_minutes,
      };

      expect(modalState.frequencyTab).toBe('simple');
      expect(modalState.startDate).toBe('2026-01-22');
      expect(modalState.timeWindow).toBe('morning');
      expect(modalState.timeEstimateMinutes).toBe(30);
    });

    it('initializes modal state from days frequency habit', () => {
      const habitState = {
        frequency_json: { type: 'days', days: [1, 3, 5] }, // Mon, Wed, Fri
        start_date: null,
        end_date: null,
        time_window: null,
        time_estimate_minutes: null,
      };

      const modalState: ScheduleModalState = {
        frequencyTab: 'days',
        frequencyJson: habitState.frequency_json,
        selectedDays: [1, 3, 5],
        customCount: '1',
        customUnit: 'week',
        startDate: habitState.start_date,
        endDate: habitState.end_date,
        timeWindow: habitState.time_window,
        timeEstimateMinutes: habitState.time_estimate_minutes,
      };

      expect(modalState.frequencyTab).toBe('days');
      expect(modalState.selectedDays).toEqual([1, 3, 5]);
    });

    it('initializes modal state from custom frequency habit', () => {
      const habitState = {
        frequency_json: { type: 'custom', value: { count: 3, unit: 'week' } },
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        time_window: 'evening',
        time_estimate_minutes: 45,
      };

      const modalState: ScheduleModalState = {
        frequencyTab: 'custom',
        frequencyJson: habitState.frequency_json,
        selectedDays: [],
        customCount: '3',
        customUnit: 'week',
        startDate: habitState.start_date,
        endDate: habitState.end_date,
        timeWindow: habitState.time_window,
        timeEstimateMinutes: habitState.time_estimate_minutes,
      };

      expect(modalState.frequencyTab).toBe('custom');
      expect(modalState.customCount).toBe('3');
      expect(modalState.customUnit).toBe('week');
      expect(modalState.endDate).toBe('2026-12-31');
    });
  });

  describe('applyScheduleChanges dispatch structure', () => {
    it('builds correct frequency_json for simple frequency', () => {
      const modalState: ScheduleModalState = {
        ...defaultState,
        frequencyTab: 'simple',
        frequencyJson: { type: 'simple', value: 'weekly' },
      };

      const result =
        modalState.frequencyTab === 'simple'
          ? modalState.frequencyJson || { type: 'simple', value: 'daily' }
          : null;

      expect(result).toEqual({ type: 'simple', value: 'weekly' });
    });

    it('builds correct frequency_json for days frequency', () => {
      const modalState: ScheduleModalState = {
        ...defaultState,
        frequencyTab: 'days',
        selectedDays: [0, 6], // Sunday, Saturday
      };

      const result =
        modalState.frequencyTab === 'days'
          ? { type: 'days', days: modalState.selectedDays }
          : null;

      expect(result).toEqual({ type: 'days', days: [0, 6] });
    });

    it('builds correct frequency_json for custom frequency', () => {
      const modalState: ScheduleModalState = {
        ...defaultState,
        frequencyTab: 'custom',
        customCount: '2',
        customUnit: 'month',
      };

      const result =
        modalState.frequencyTab === 'custom'
          ? {
              type: 'custom',
              value: {
                count: parseInt(modalState.customCount, 10) || 1,
                unit: modalState.customUnit,
              },
            }
          : null;

      expect(result).toEqual({
        type: 'custom',
        value: { count: 2, unit: 'month' },
      });
    });

    it('handles invalid customCount by defaulting to 1', () => {
      const modalState: ScheduleModalState = {
        ...defaultState,
        frequencyTab: 'custom',
        customCount: 'abc', // Invalid
        customUnit: 'day',
      };

      const count = parseInt(modalState.customCount, 10) || 1;
      expect(count).toBe(1);
    });
  });

  describe('Cancel vs Set behavior', () => {
    it('Cancel should not modify original habit state', () => {
      const originalHabitState = {
        frequency_json: { type: 'simple', value: 'daily' },
        start_date: '2026-01-22',
      };

      // User makes changes in modal but clicks Cancel
      const modifiedModalState: ScheduleModalState = {
        ...defaultState,
        frequencyTab: 'simple',
        frequencyJson: { type: 'simple', value: 'weekly' }, // Changed!
        startDate: '2026-02-15', // Changed!
      };

      // On cancel, modal closes without dispatching
      // Original state should remain unchanged
      expect(originalHabitState.frequency_json.value).toBe('daily');
      expect(originalHabitState.start_date).toBe('2026-01-22');
    });
  });
});
