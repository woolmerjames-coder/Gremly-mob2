/**
 * Unit tests for saveable cooldown management
 */

import {
  CooldownState as _CooldownState,
  createEmptyCooldownState,
  isInCooldown,
  getCooldownReason,
  recordSaveShown,
  recordSaveDismissed,
  recordSaveTapped,
  resetCooldownState,
  COOLDOWN_AFTER_SHOWN,
  COOLDOWN_AFTER_DISMISSED,
  COOLDOWN_AFTER_TAPPED,
} from '../../lib/chat/saveableCooldown';

describe('saveableCooldown', () => {
  describe('constants', () => {
    test('COOLDOWN_AFTER_SHOWN is 2', () => {
      expect(COOLDOWN_AFTER_SHOWN).toBe(2);
    });

    test('COOLDOWN_AFTER_DISMISSED is 3', () => {
      expect(COOLDOWN_AFTER_DISMISSED).toBe(3);
    });

    test('COOLDOWN_AFTER_TAPPED is 0', () => {
      expect(COOLDOWN_AFTER_TAPPED).toBe(0);
    });
  });

  describe('createEmptyCooldownState', () => {
    test('returns empty object', () => {
      const state = createEmptyCooldownState();
      expect(state).toEqual({});
    });

    test('returns new object each time', () => {
      const state1 = createEmptyCooldownState();
      const state2 = createEmptyCooldownState();
      expect(state1).not.toBe(state2);
    });
  });

  describe('isInCooldown', () => {
    test('returns false for empty state', () => {
      const state = createEmptyCooldownState();
      expect(isInCooldown(state, 5)).toBe(false);
    });

    test('showing Save alone does NOT trigger cooldown (updated behavior)', () => {
      // NEW BEHAVIOR: Just showing Save button doesn't trigger cooldown
      // Cooldown only applies after dismissal
      const state = recordSaveShown(createEmptyCooldownState(), 5);
      expect(isInCooldown(state, 5)).toBe(false); // No cooldown just for showing
      expect(isInCooldown(state, 6)).toBe(false);
      expect(isInCooldown(state, 7)).toBe(false);
    });

    test('returns true within COOLDOWN_AFTER_DISMISSED window', () => {
      const state = recordSaveDismissed(createEmptyCooldownState(), 5);
      expect(isInCooldown(state, 5)).toBe(true); // 0 turns later
      expect(isInCooldown(state, 6)).toBe(true); // 1 turn later
      expect(isInCooldown(state, 7)).toBe(true); // 2 turns later
      expect(isInCooldown(state, 8)).toBe(false); // 3 turns later (cooldown = 3)
    });

    test('only dismissed triggers cooldown, not just shown', () => {
      const shownState = recordSaveShown(createEmptyCooldownState(), 5);
      const dismissedState = recordSaveDismissed(createEmptyCooldownState(), 5);

      // Shown alone: no cooldown
      expect(isInCooldown(shownState, 5)).toBe(false);
      expect(isInCooldown(shownState, 7)).toBe(false);

      // Dismissed: cooldown active
      expect(isInCooldown(dismissedState, 5)).toBe(true);
      expect(isInCooldown(dismissedState, 7)).toBe(true);
    });

    test('tapping does not trigger cooldown', () => {
      const state = recordSaveTapped(createEmptyCooldownState(), 5);
      expect(isInCooldown(state, 5)).toBe(false);
      expect(isInCooldown(state, 6)).toBe(false);
    });

    test('handles both shown and dismissed in same state', () => {
      let state = createEmptyCooldownState();
      state = recordSaveShown(state, 3);
      state = recordSaveDismissed(state, 5);

      // At turn 6: dismissed cooldown still active (only 1 turn passed)
      expect(isInCooldown(state, 6)).toBe(true);

      // At turn 8: dismissed cooldown expired (3 turns)
      expect(isInCooldown(state, 8)).toBe(false);
    });
  });

  describe('getCooldownReason', () => {
    test('returns null when not in cooldown', () => {
      const state = createEmptyCooldownState();
      expect(getCooldownReason(state, 5)).toBeNull();
    });

    test('returns reason when in cooldown after shown', () => {
      const state = recordSaveShown(createEmptyCooldownState(), 5);
      const reason = getCooldownReason(state, 6);
      expect(reason).toContain('shown');
      expect(reason).toContain('1 turn');
    });

    test('returns reason when in cooldown after dismissed', () => {
      const state = recordSaveDismissed(createEmptyCooldownState(), 5);
      const reason = getCooldownReason(state, 6);
      expect(reason).toContain('dismissed');
      expect(reason).toContain('1 turn');
    });

    test('returns null after cooldown expires', () => {
      const state = recordSaveShown(createEmptyCooldownState(), 5);
      expect(getCooldownReason(state, 7)).toBeNull(); // 2 turns later
    });

    test('handles plural turns correctly', () => {
      const state = recordSaveDismissed(createEmptyCooldownState(), 5);
      const reason = getCooldownReason(state, 7);
      expect(reason).toContain('2 turns');
    });
  });

  describe('pure functions', () => {
    test('recordSaveShown returns new object', () => {
      const original = createEmptyCooldownState();
      const updated = recordSaveShown(original, 5);
      expect(updated).not.toBe(original);
      expect(original.lastSaveShownAtTurn).toBeUndefined();
      expect(updated.lastSaveShownAtTurn).toBe(5);
    });

    test('recordSaveDismissed returns new object', () => {
      const original = createEmptyCooldownState();
      const updated = recordSaveDismissed(original, 5);
      expect(updated).not.toBe(original);
      expect(original.lastSaveDismissedAtTurn).toBeUndefined();
      expect(updated.lastSaveDismissedAtTurn).toBe(5);
    });

    test('recordSaveTapped returns new object', () => {
      const original = createEmptyCooldownState();
      const updated = recordSaveTapped(original, 5);
      expect(updated).not.toBe(original);
      expect(original.lastSaveTappedAtTurn).toBeUndefined();
      expect(updated.lastSaveTappedAtTurn).toBe(5);
    });

    test('functions preserve existing state', () => {
      let state = createEmptyCooldownState();
      state = recordSaveShown(state, 3);
      state = recordSaveDismissed(state, 5);
      state = recordSaveTapped(state, 7);

      expect(state.lastSaveShownAtTurn).toBe(3);
      expect(state.lastSaveDismissedAtTurn).toBe(5);
      expect(state.lastSaveTappedAtTurn).toBe(7);
    });
  });

  describe('resetCooldownState', () => {
    test('returns empty state', () => {
      const state = resetCooldownState();
      expect(state).toEqual({});
    });

    test('clears previous state when reassigned', () => {
      let state = createEmptyCooldownState();
      state = recordSaveShown(state, 5);
      state = recordSaveDismissed(state, 6);

      // Reset
      state = resetCooldownState();

      expect(state.lastSaveShownAtTurn).toBeUndefined();
      expect(state.lastSaveDismissedAtTurn).toBeUndefined();
      expect(isInCooldown(state, 6)).toBe(false);
    });
  });

  describe('real-world scenarios', () => {
    test('Save shown alone does NOT trigger cooldown (user must dismiss)', () => {
      let state = createEmptyCooldownState();

      // Turn 1: Save shown - no cooldown from just showing
      state = recordSaveShown(state, 1);
      expect(isInCooldown(state, 1)).toBe(false);

      // Turn 2: Still no cooldown
      expect(isInCooldown(state, 2)).toBe(false);

      // Turn 3: Still no cooldown
      expect(isInCooldown(state, 3)).toBe(false);
    });

    test('Save shown → user dismisses → longer cooldown', () => {
      let state = createEmptyCooldownState();

      // Turn 1: Save shown
      state = recordSaveShown(state, 1);

      // Turn 2: User dismisses
      state = recordSaveDismissed(state, 2);

      // Turn 3-4: Still in dismissed cooldown
      expect(isInCooldown(state, 3)).toBe(true);
      expect(isInCooldown(state, 4)).toBe(true);

      // Turn 5: Finally can show again
      expect(isInCooldown(state, 5)).toBe(false);
    });

    test('Save shown → user taps → can show again immediately', () => {
      let state = createEmptyCooldownState();

      // Turn 1: Save shown
      state = recordSaveShown(state, 1);

      // Turn 2: User taps (positive engagement)
      state = recordSaveTapped(state, 2);

      // Turn 3: Shown cooldown still applies (tapping doesn't override)
      // But we're now past the shown cooldown window
      expect(isInCooldown(state, 3)).toBe(false);
    });
  });
});
