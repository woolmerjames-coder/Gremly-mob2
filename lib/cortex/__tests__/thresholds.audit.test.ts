/**
 * Threshold Consolidation Audit Tests
 *
 * These tests ensure that threshold values remain consistent and haven't
 * accidentally changed. This is the single source of truth for all
 * classification thresholds in the Mind Drop system.
 *
 * If a test fails, it means a threshold value was changed. Make sure this
 * was intentional and update the test expectation accordingly.
 */

import {
  AUTO_TODO,
  AUTO_HABIT,
  AUTO_LOG,
  AUTO_LIST,
  CHIPS_FLOOR,
  CHIPS_CEILING,
  AI_TRIGGER,
  AI_TRUST,
  AI_IGNORE,
  DEFAULT_LOG_GENERAL,
  DEFAULT_ENGINE_CONFIDENCE,
  QUESTION_SUPPRESS_CHIPS,
  IDEA_HEURISTIC_TRIGGER,
  AUTO_THRESHOLD,
  ASK_THRESHOLD,
  THRESHOLDS,
  decideMode,
  decideModeForType,
  isInChipsBand,
  shouldTrustAI,
  shouldIgnoreAI,
} from '../thresholds';

describe('Threshold Consolidation Audit', () => {
  describe('Auto-create thresholds', () => {
    it('AUTO_TODO should be 0.85', () => {
      expect(AUTO_TODO).toBe(0.85);
    });

    it('AUTO_HABIT should be 0.90', () => {
      expect(AUTO_HABIT).toBe(0.9);
    });

    it('AUTO_LOG should be 0.70', () => {
      expect(AUTO_LOG).toBe(0.7);
    });

    it('AUTO_LIST should be 0.70', () => {
      expect(AUTO_LIST).toBe(0.7);
    });
  });

  describe('Chip thresholds', () => {
    it('CHIPS_FLOOR should be 0.55', () => {
      expect(CHIPS_FLOOR).toBe(0.55);
    });

    it('CHIPS_CEILING should be 0.85', () => {
      expect(CHIPS_CEILING).toBe(0.85);
    });
  });

  describe('AI thresholds', () => {
    it('AI_TRIGGER should be 0.70', () => {
      expect(AI_TRIGGER).toBe(0.7);
    });

    it('AI_TRUST should be 0.80', () => {
      expect(AI_TRUST).toBe(0.8);
    });

    it('AI_IGNORE should be 0.40', () => {
      expect(AI_IGNORE).toBe(0.4);
    });
  });

  describe('Default values', () => {
    it('DEFAULT_LOG_GENERAL should be 0.50', () => {
      expect(DEFAULT_LOG_GENERAL).toBe(0.5);
    });

    it('DEFAULT_ENGINE_CONFIDENCE should be 0.85', () => {
      expect(DEFAULT_ENGINE_CONFIDENCE).toBe(0.85);
    });
  });

  describe('Special case thresholds', () => {
    it('QUESTION_SUPPRESS_CHIPS should be 0.90', () => {
      expect(QUESTION_SUPPRESS_CHIPS).toBe(0.9);
    });

    it('IDEA_HEURISTIC_TRIGGER should be 0.50', () => {
      expect(IDEA_HEURISTIC_TRIGGER).toBe(0.5);
    });
  });

  describe('Legacy compatibility', () => {
    it('AUTO_THRESHOLD should equal AUTO_TODO', () => {
      expect(AUTO_THRESHOLD).toBe(AUTO_TODO);
    });

    it('ASK_THRESHOLD should be 0.50', () => {
      expect(ASK_THRESHOLD).toBe(0.5);
    });
  });

  describe('THRESHOLDS object structure', () => {
    it('should have all auto thresholds', () => {
      expect(THRESHOLDS.auto.todo).toBe(AUTO_TODO);
      expect(THRESHOLDS.auto.habit).toBe(AUTO_HABIT);
      expect(THRESHOLDS.auto.log).toBe(AUTO_LOG);
      expect(THRESHOLDS.auto.list).toBe(AUTO_LIST);
    });

    it('should have all chip thresholds', () => {
      expect(THRESHOLDS.chips.floor).toBe(CHIPS_FLOOR);
      expect(THRESHOLDS.chips.ceiling).toBe(CHIPS_CEILING);
    });

    it('should have all AI thresholds', () => {
      expect(THRESHOLDS.ai.trigger).toBe(AI_TRIGGER);
      expect(THRESHOLDS.ai.trust).toBe(AI_TRUST);
      expect(THRESHOLDS.ai.ignore).toBe(AI_IGNORE);
    });

    it('should have all default values', () => {
      expect(THRESHOLDS.defaults.logGeneral).toBe(DEFAULT_LOG_GENERAL);
      expect(THRESHOLDS.defaults.engineConfidence).toBe(DEFAULT_ENGINE_CONFIDENCE);
    });

    it('should have all special case thresholds', () => {
      expect(THRESHOLDS.special.questionSuppressChips).toBe(QUESTION_SUPPRESS_CHIPS);
      expect(THRESHOLDS.special.ideaHeuristicTrigger).toBe(IDEA_HEURISTIC_TRIGGER);
    });
  });

  describe('decideMode function', () => {
    it('should return auto for confidence >= AUTO_TODO', () => {
      expect(decideMode(0.85)).toBe('auto');
      expect(decideMode(0.9)).toBe('auto');
      expect(decideMode(1.0)).toBe('auto');
    });

    it('should return ask for confidence between ASK_THRESHOLD and AUTO_TODO', () => {
      expect(decideMode(0.5)).toBe('ask');
      expect(decideMode(0.65)).toBe('ask');
      expect(decideMode(0.84)).toBe('ask');
    });

    it('should return keep for confidence < ASK_THRESHOLD', () => {
      expect(decideMode(0.0)).toBe('keep');
      expect(decideMode(0.3)).toBe('keep');
      expect(decideMode(0.49)).toBe('keep');
    });

    it('should return keep for undefined/invalid confidence', () => {
      expect(decideMode()).toBe('keep');
      expect(decideMode(undefined)).toBe('keep');
      expect(decideMode(NaN)).toBe('keep');
    });
  });

  describe('decideModeForType function', () => {
    it('should use type-specific thresholds for todos', () => {
      expect(decideModeForType(0.85, 'todo')).toBe('auto');
      expect(decideModeForType(0.84, 'todo')).toBe('ask');
    });

    it('should use type-specific thresholds for habits', () => {
      expect(decideModeForType(0.9, 'habit')).toBe('auto');
      expect(decideModeForType(0.89, 'habit')).toBe('ask');
    });

    it('should use type-specific thresholds for logs', () => {
      expect(decideModeForType(0.7, 'log')).toBe('auto');
      expect(decideModeForType(0.69, 'log')).toBe('ask');
    });

    it('should use type-specific thresholds for lists', () => {
      expect(decideModeForType(0.7, 'list')).toBe('auto');
      expect(decideModeForType(0.69, 'list')).toBe('ask');
    });

    it('should return keep for undefined confidence', () => {
      expect(decideModeForType(undefined, 'todo')).toBe('keep');
    });
  });

  describe('isInChipsBand function', () => {
    it('should return true for confidence in chips band', () => {
      expect(isInChipsBand(0.55)).toBe(true);
      expect(isInChipsBand(0.7)).toBe(true);
      expect(isInChipsBand(0.84)).toBe(true);
    });

    it('should return false for confidence below chips floor', () => {
      expect(isInChipsBand(0.54)).toBe(false);
      expect(isInChipsBand(0.3)).toBe(false);
    });

    it('should return false for confidence at or above chips ceiling', () => {
      expect(isInChipsBand(0.85)).toBe(false);
      expect(isInChipsBand(0.9)).toBe(false);
    });

    it('should return false for undefined confidence', () => {
      expect(isInChipsBand(undefined)).toBe(false);
    });
  });

  describe('shouldTrustAI function', () => {
    it('should return true for confidence >= AI_TRUST', () => {
      expect(shouldTrustAI(0.8)).toBe(true);
      expect(shouldTrustAI(0.9)).toBe(true);
    });

    it('should return false for confidence < AI_TRUST', () => {
      expect(shouldTrustAI(0.79)).toBe(false);
      expect(shouldTrustAI(0.5)).toBe(false);
    });

    it('should return false for undefined confidence', () => {
      expect(shouldTrustAI(undefined)).toBe(false);
    });
  });

  describe('shouldIgnoreAI function', () => {
    it('should return true for confidence < AI_IGNORE', () => {
      expect(shouldIgnoreAI(0.39)).toBe(true);
      expect(shouldIgnoreAI(0.2)).toBe(true);
    });

    it('should return false for confidence >= AI_IGNORE', () => {
      expect(shouldIgnoreAI(0.4)).toBe(false);
      expect(shouldIgnoreAI(0.6)).toBe(false);
    });

    it('should return true for undefined confidence', () => {
      expect(shouldIgnoreAI(undefined)).toBe(true);
    });
  });
});
