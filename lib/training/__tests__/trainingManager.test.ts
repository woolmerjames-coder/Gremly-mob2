// ============================================================
// Training Manager Tests
// ============================================================

import {
  getVisibleLevel,
  getItemCount,
  getItemFraction,
  getProgressStage,
  getProgressLabel,
  getItemConfig,
  getItemsForLevel,
  getContextualItems,
  getRequiredItemIds,
  getRequiredItemCount,
  getCompletedCount,
  isItemVisible,
  checkTrainingProgress,
  getLevelUnlockHint,
  TRAINING_ITEMS,
  TRAINING_LEVELS,
} from '../trainingManager';
import { TRAINING_THRESHOLDS } from '../../constants/soulDocument';
import type { TrainingProgress, TrainingItemId } from '../trainingTypes';
import { EMPTY_TRAINING_PROGRESS } from '../trainingTypes';

// ────────────────────────────────────────────────────────────
// Helper
// ────────────────────────────────────────────────────────────

function progress(overrides: Partial<TrainingProgress> = {}): TrainingProgress {
  return { ...EMPTY_TRAINING_PROGRESS, ...overrides };
}

// ────────────────────────────────────────────────────────────
// Data integrity
// ────────────────────────────────────────────────────────────

describe('Training data integrity', () => {
  test('8 required items, 1 optional (calendar)', () => {
    const required = TRAINING_ITEMS.filter((i) => i.required);
    const optional = TRAINING_ITEMS.filter((i) => !i.required);
    expect(required).toHaveLength(8);
    expect(optional).toHaveLength(1);
    expect(optional[0].id).toBe('calendar');
  });

  test('2 contextual items (journals, lock_ins)', () => {
    const contextual = getContextualItems();
    expect(contextual).toHaveLength(2);
    expect(contextual.map((c) => c.id).sort()).toEqual(['journals', 'lock_ins']);
  });

  test('3 levels with correct items', () => {
    expect(TRAINING_LEVELS).toHaveLength(3);
    expect(TRAINING_LEVELS[0].items).toEqual(['drops', 'sweeps']);
    expect(TRAINING_LEVELS[1].items).toEqual(['briefs', 'habits']);
    expect(TRAINING_LEVELS[2].items).toEqual(['entity_chat', 'space', 'calendar']);
  });

  test('every item has a valid config', () => {
    const allIds: TrainingItemId[] = [
      'drops', 'sweeps', 'briefs', 'habits', 'journals',
      'lock_ins', 'entity_chat', 'space', 'calendar',
    ];
    for (const id of allIds) {
      const config = getItemConfig(id);
      expect(config).toBeDefined();
      expect(config!.label.length).toBeGreaterThan(0);
      expect(config!.description.length).toBeGreaterThan(0);
      expect(config!.threshold).toBeGreaterThan(0);
    }
  });

  test('thresholds match Soul Document v8', () => {
    expect(getItemConfig('drops')!.threshold).toBe(15);
    expect(getItemConfig('sweeps')!.threshold).toBe(5);
    expect(getItemConfig('briefs')!.threshold).toBe(2);
    expect(getItemConfig('habits')!.threshold).toBe(2);
    expect(getItemConfig('journals')!.threshold).toBe(3);
    expect(getItemConfig('lock_ins')!.threshold).toBe(2);
    expect(getItemConfig('entity_chat')!.threshold).toBe(1);
    expect(getItemConfig('space')!.threshold).toBe(1);
    expect(getItemConfig('calendar')!.threshold).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────
// Level visibility
// ────────────────────────────────────────────────────────────

describe('getVisibleLevel', () => {
  test('fresh user sees level 1', () => {
    expect(getVisibleLevel(progress())).toBe(1);
  });

  test('drops alone do not unlock level 2', () => {
    expect(getVisibleLevel(progress({ drops: 7 }))).toBe(1);
  });

  test('first sweep unlocks level 2', () => {
    expect(getVisibleLevel(progress({ sweeps: 1 }))).toBe(2);
  });

  test('first brief unlocks level 3', () => {
    expect(getVisibleLevel(progress({ sweeps: 1, briefs: 1 }))).toBe(3);
  });

  test('8 drops unlocks level 3 (no brief needed)', () => {
    expect(getVisibleLevel(progress({ sweeps: 1, drops: 8 }))).toBe(3);
  });

  test('8 drops without a sweep still only unlocks to level 3', () => {
    // Edge case: user dropped 8 things but never swept
    // Level 2 requires sweeps >= 1, Level 3 requires briefs >= 1 OR drops >= 8
    // Without sweeps, level 2 isn't unlocked, so we'd be at level 1
    // BUT getVisibleLevel checks level 3 first, so 8 drops jumps straight to 3
    expect(getVisibleLevel(progress({ drops: 8 }))).toBe(3);
  });

  test('7 drops does not unlock level 3', () => {
    expect(getVisibleLevel(progress({ sweeps: 1, drops: 7 }))).toBe(2);
  });
});

// ────────────────────────────────────────────────────────────
// Item counts and fractions
// ────────────────────────────────────────────────────────────

describe('getItemCount', () => {
  test('returns correct count for each metric', () => {
    const p = progress({
      drops: 7, sweeps: 3, briefs: 1, habits: 2,
      journals: 1, lockIns: 2, entityChats: 0, spaces: 1,
      calendarConnected: true,
    });
    expect(getItemCount('drops', p)).toBe(7);
    expect(getItemCount('sweeps', p)).toBe(3);
    expect(getItemCount('briefs', p)).toBe(1);
    expect(getItemCount('habits', p)).toBe(2);
    expect(getItemCount('journals', p)).toBe(1);
    expect(getItemCount('lock_ins', p)).toBe(2);
    expect(getItemCount('entity_chat', p)).toBe(0);
    expect(getItemCount('space', p)).toBe(1);
    expect(getItemCount('calendar', p)).toBe(1);
  });

  test('calendar returns 0 when not connected', () => {
    expect(getItemCount('calendar', progress())).toBe(0);
  });
});

describe('getItemFraction', () => {
  test('0 progress = 0 fraction', () => {
    expect(getItemFraction('drops', progress())).toBe(0);
  });

  test('half progress = 0.5 (roughly)', () => {
    // drops threshold is 15, so 7/15 ~ 0.467
    const fraction = getItemFraction('drops', progress({ drops: 7 }));
    expect(fraction).toBeCloseTo(7 / 15, 2);
  });

  test('at threshold = 1.0', () => {
    expect(getItemFraction('drops', progress({ drops: 15 }))).toBe(1);
  });

  test('over threshold still clamps to 1.0', () => {
    expect(getItemFraction('drops', progress({ drops: 20 }))).toBe(1);
  });

  test('single-threshold items (space) complete at 1', () => {
    expect(getItemFraction('space', progress({ spaces: 1 }))).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────
// Progress stages
// ────────────────────────────────────────────────────────────

describe('getProgressStage', () => {
  test('not_started at 0', () => {
    expect(getProgressStage('drops', progress())).toBe('not_started');
  });

  test('just_started at 1 drop (6.7%)', () => {
    expect(getProgressStage('drops', progress({ drops: 1 }))).toBe('just_started');
  });

  test('getting_there at 6 drops (40%)', () => {
    expect(getProgressStage('drops', progress({ drops: 6 }))).toBe('getting_there');
  });

  test('almost_there at 12 drops (80%)', () => {
    expect(getProgressStage('drops', progress({ drops: 12 }))).toBe('almost_there');
  });

  test('complete at 15 drops (100%)', () => {
    expect(getProgressStage('drops', progress({ drops: 15 }))).toBe('complete');
  });

  test('complete at over threshold', () => {
    expect(getProgressStage('drops', progress({ drops: 20 }))).toBe('complete');
  });
});

describe('getProgressLabel', () => {
  test('returns correct labels', () => {
    expect(getProgressLabel('not_started')).toBe('');
    expect(getProgressLabel('just_started')).toBe('Just started');
    expect(getProgressLabel('getting_there')).toBe('Getting there');
    expect(getProgressLabel('almost_there')).toBe('Almost there');
    expect(getProgressLabel('complete')).toBe('Complete');
  });
});

// ────────────────────────────────────────────────────────────
// Item visibility
// ────────────────────────────────────────────────────────────

describe('isItemVisible', () => {
  test('level 1 items visible at level 1', () => {
    expect(isItemVisible('drops', 1)).toBe(true);
    expect(isItemVisible('sweeps', 1)).toBe(true);
  });

  test('level 2 items NOT visible at level 1', () => {
    expect(isItemVisible('briefs', 1)).toBe(false);
    expect(isItemVisible('habits', 1)).toBe(false);
  });

  test('level 2 items visible at level 2', () => {
    expect(isItemVisible('briefs', 2)).toBe(true);
    expect(isItemVisible('habits', 2)).toBe(true);
  });

  test('level 3 items visible at level 3', () => {
    expect(isItemVisible('entity_chat', 3)).toBe(true);
    expect(isItemVisible('space', 3)).toBe(true);
    expect(isItemVisible('calendar', 3)).toBe(true);
  });

  test('contextual items are always visible', () => {
    expect(isItemVisible('journals', 1)).toBe(true);
    expect(isItemVisible('lock_ins', 1)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// Completed count
// ────────────────────────────────────────────────────────────

describe('getCompletedCount / getRequiredItemCount', () => {
  test('8 required items total', () => {
    expect(getRequiredItemCount()).toBe(8);
  });

  test('0 completed when nothing done', () => {
    expect(getCompletedCount([])).toBe(0);
  });

  test('counts only required items', () => {
    // calendar is not required, so it shouldn't count
    expect(getCompletedCount(['drops', 'calendar'])).toBe(1);
  });

  test('all 8 required items counted', () => {
    const all: TrainingItemId[] = [
      'drops', 'sweeps', 'briefs', 'habits',
      'journals', 'lock_ins', 'entity_chat', 'space',
    ];
    expect(getCompletedCount(all)).toBe(8);
  });
});

// ────────────────────────────────────────────────────────────
// checkTrainingProgress — the main function
// ────────────────────────────────────────────────────────────

describe('checkTrainingProgress', () => {
  test('fresh user: nothing completed, no level change, no graduation', () => {
    const result = checkTrainingProgress(progress(), 1, []);
    expect(result.newlyCompleted).toEqual([]);
    expect(result.newLevel).toBeNull();
    expect(result.shouldGraduate).toBe(false);
  });

  test('drops threshold crossed: newly completed', () => {
    const result = checkTrainingProgress(progress({ drops: 15 }), 1, []);
    expect(result.newlyCompleted).toContain('drops');
  });

  test('already completed items not re-flagged', () => {
    const result = checkTrainingProgress(progress({ drops: 15 }), 1, ['drops']);
    expect(result.newlyCompleted).not.toContain('drops');
  });

  test('level 2 unlock detected', () => {
    const result = checkTrainingProgress(progress({ sweeps: 1 }), 1, []);
    expect(result.newLevel).toBe(2);
  });

  test('no level change if already at that level', () => {
    const result = checkTrainingProgress(progress({ sweeps: 1 }), 2, []);
    expect(result.newLevel).toBeNull();
  });

  test('level 3 unlock via briefs', () => {
    const result = checkTrainingProgress(progress({ sweeps: 2, briefs: 1 }), 2, []);
    expect(result.newLevel).toBe(3);
  });

  test('level 3 unlock via drops', () => {
    const result = checkTrainingProgress(progress({ sweeps: 2, drops: 8 }), 2, []);
    expect(result.newLevel).toBe(3);
  });

  test('graduation triggers when all required items complete', () => {
    const fullProgress = progress({
      drops: 15, sweeps: 5, briefs: 2, habits: 2,
      journals: 3, lockIns: 2, entityChats: 1, spaces: 1,
    });
    const result = checkTrainingProgress(fullProgress, 3, []);
    expect(result.shouldGraduate).toBe(true);
    expect(result.newlyCompleted).toHaveLength(8);
  });

  test('graduation does not trigger without all required items', () => {
    const almostDone = progress({
      drops: 15, sweeps: 5, briefs: 2, habits: 2,
      journals: 3, lockIns: 2, entityChats: 1, spaces: 0, // missing space
    });
    const result = checkTrainingProgress(almostDone, 3, []);
    expect(result.shouldGraduate).toBe(false);
  });

  test('graduation works with mix of already completed and newly completed', () => {
    const p = progress({
      drops: 15, sweeps: 5, briefs: 2, habits: 2,
      journals: 3, lockIns: 2, entityChats: 1, spaces: 1,
    });
    const alreadyDone: TrainingItemId[] = ['drops', 'sweeps', 'briefs', 'habits'];
    const result = checkTrainingProgress(p, 3, alreadyDone);
    expect(result.shouldGraduate).toBe(true);
    // Only the items not already completed should be in newlyCompleted
    expect(result.newlyCompleted).toEqual(
      expect.arrayContaining(['journals', 'lock_ins', 'entity_chat', 'space']),
    );
    expect(result.newlyCompleted).not.toContain('drops');
  });

  test('calendar completion does not affect graduation', () => {
    // All required items done, calendar not connected
    const p = progress({
      drops: 15, sweeps: 5, briefs: 2, habits: 2,
      journals: 3, lockIns: 2, entityChats: 1, spaces: 1,
      calendarConnected: false,
    });
    const result = checkTrainingProgress(p, 3, []);
    expect(result.shouldGraduate).toBe(true);
  });

  test('multiple things can happen at once (completion + level unlock)', () => {
    // User does first sweep: completes no items (threshold is 5), but unlocks level 2
    const p = progress({ drops: 3, sweeps: 1 });
    const result = checkTrainingProgress(p, 1, []);
    expect(result.newLevel).toBe(2);
    expect(result.newlyCompleted).toEqual([]); // No thresholds crossed yet
  });
});

// ────────────────────────────────────────────────────────────
// Helper functions
// ────────────────────────────────────────────────────────────

describe('getItemsForLevel', () => {
  test('level 1 has 2 items', () => {
    expect(getItemsForLevel(1)).toHaveLength(2);
  });

  test('level 2 has 2 items', () => {
    expect(getItemsForLevel(2)).toHaveLength(2);
  });

  test('level 3 has 3 items (including optional calendar)', () => {
    expect(getItemsForLevel(3)).toHaveLength(3);
  });

  test('contextual items are excluded from level lists', () => {
    const all = [...getItemsForLevel(1), ...getItemsForLevel(2), ...getItemsForLevel(3)];
    expect(all.find((i) => i.id === 'journals')).toBeUndefined();
    expect(all.find((i) => i.id === 'lock_ins')).toBeUndefined();
  });
});

describe('getLevelUnlockHint', () => {
  test('level 2 mentions sweep', () => {
    expect(getLevelUnlockHint(2)).toContain('Sweep');
  });

  test('level 3 mentions brief or drops', () => {
    const hint = getLevelUnlockHint(3);
    expect(hint).toContain('Morning Brief');
    expect(hint).toContain('8');
  });
});
