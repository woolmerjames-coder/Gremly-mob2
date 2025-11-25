/**
 * Phase 4 Decision Engine Tests
 *
 * Tests the centralized Mind Drop decision logic that controls:
 * - Auto-create vs show chips
 * - Chip ordering by probable kind
 * - Gibberish detection
 * - Unsorted handling
 *
 * These tests validate the MASTER CLASSIFIER SPEC:
 * - bucket ∈ ["todo","habit","log-journal","log-idea","log-general","unsorted"]
 * - type ∈ ["todo","habit","log","ignore"]
 * - subtype ∈ ["journal","idea","general",null]
 * - Auto-create thresholds: todo/habit >= 70%, log >= 60%
 */

import { decideMindDropAction, getChipOptions } from '../decisionEngine';
import type { CanonicalIntentResult } from '../../cortex/intents/canonicalIntent';

describe('Phase 4 Decision Engine', () => {
  describe('Auto-create: Confident todos (>= 70%)', () => {
    it('should auto-create todo with 90% confidence', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'todo',
        type: 'todo',
        confidence: 0.9,
        suppressChips: true,
        allowAutoCreate: true,
        logSubtype: null,
        probableKind: 'todo',
        reasoning: 'Worker classified as todo (confidence: 90%)',
      };

      const decision = decideMindDropAction({
        canonicalIntent,
        text: 'Email accountant about Q4 taxes',
      });

      expect(decision.autoCreate).toBe(true);
      expect(decision.showChips).toBe(false);
      expect(decision.overlayAutoOpen).toBe(false); // Phase 2E: never auto-open
      expect(decision.entityType).toBe('todo');
      expect(decision.probableKind).toBe('todo');
      expect(decision.reason).toBe('confident_todo_90');
    });

    it('should auto-create todo at exactly 70% threshold', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'todo',
        type: 'todo',
        confidence: 0.7,
        suppressChips: true,
        allowAutoCreate: true,
        logSubtype: null,
        probableKind: 'todo',
        reasoning: 'Worker classified as todo',
      };

      const decision = decideMindDropAction({
        canonicalIntent,
        text: 'Buy milk',
      });

      expect(decision.autoCreate).toBe(true);
      expect(decision.showChips).toBe(false);
    });

    it('should show chips for todo at 69% confidence (below threshold)', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'todo',
        type: 'todo',
        confidence: 0.69,
        suppressChips: false, // Below threshold
        allowAutoCreate: false,
        logSubtype: null,
        probableKind: 'todo',
        reasoning: 'Worker classified as todo (medium confidence)',
      };

      const decision = decideMindDropAction({
        canonicalIntent,
        text: 'Maybe call Sarah later',
      });

      expect(decision.autoCreate).toBe(false);
      expect(decision.showChips).toBe(true);
      expect(decision.entityType).toBe('todo');
      expect(decision.probableKind).toBe('todo');
      expect(decision.reason).toBe('ambiguous_todo_69');
    });

    it('should NOT auto-create if suppressChips is false (regardless of confidence)', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'todo',
        type: 'todo',
        confidence: 0.95, // High confidence
        suppressChips: false, // But chips not suppressed (proto-task, ambiguous, etc)
        allowAutoCreate: false,
        logSubtype: null,
        probableKind: 'todo',
        reasoning: 'Proto-task needs clarification',
      };

      const decision = decideMindDropAction({
        canonicalIntent,
        text: 'I should maybe think about emailing Sarah',
      });

      expect(decision.autoCreate).toBe(false);
      expect(decision.showChips).toBe(true);
      expect(decision.reason).toBe('ambiguous_todo_95');
    });
  });

  describe('Auto-create: Confident habits (>= 70%)', () => {
    it('should auto-create habit with 95% confidence', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'habit',
        type: 'habit',
        confidence: 0.95,
        suppressChips: true,
        allowAutoCreate: true,
        logSubtype: null,
        probableKind: 'habit',
        reasoning: 'Worker classified as habit',
      };

      const decision = decideMindDropAction({
        canonicalIntent,
        text: 'Run 5km every Saturday morning',
      });

      expect(decision.autoCreate).toBe(true);
      expect(decision.showChips).toBe(false);
      expect(decision.overlayAutoOpen).toBe(false);
      expect(decision.entityType).toBe('habit');
      expect(decision.probableKind).toBe('habit');
      expect(decision.reason).toBe('confident_habit_95');
    });

    it('should show chips for habit at 65% confidence', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'habit',
        type: 'habit',
        confidence: 0.65,
        suppressChips: false,
        allowAutoCreate: false,
        logSubtype: null,
        probableKind: 'habit',
        reasoning: 'Worker classified as habit (medium confidence)',
      };

      const decision = decideMindDropAction({
        canonicalIntent,
        text: 'Try to meditate more often',
      });

      expect(decision.autoCreate).toBe(false);
      expect(decision.showChips).toBe(true);
      expect(decision.entityType).toBe('habit');
      expect(decision.reason).toBe('ambiguous_habit_65');
    });
  });

  describe('Auto-create: Confident logs (>= 60%)', () => {
    it('should auto-create journal log with 90% confidence', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'log-journal',
        type: 'log',
        confidence: 0.9,
        suppressChips: true,
        allowAutoCreate: true,
        logSubtype: 'journal',
        probableKind: 'log',
        reasoning: 'Worker classified as log-journal',
      };

      const decision = decideMindDropAction({
        canonicalIntent,
        text: "I'm really nervous about my performance review tomorrow",
      });

      expect(decision.autoCreate).toBe(true);
      expect(decision.showChips).toBe(false);
      expect(decision.overlayAutoOpen).toBe(false);
      expect(decision.entityType).toBe('log');
      expect(decision.logSubtype).toBe('journal');
      expect(decision.probableKind).toBe('log');
      expect(decision.reason).toBe('confident_log_journal_90');
    });

    it('should auto-create idea log with 85% confidence', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'log-idea',
        type: 'log',
        confidence: 0.85,
        suppressChips: true,
        allowAutoCreate: true,
        logSubtype: 'idea',
        probableKind: 'log',
        reasoning: 'Worker classified as log-idea',
      };

      const decision = decideMindDropAction({
        canonicalIntent,
        text: 'What if we built a feature that auto-sorts emails by urgency?',
      });

      expect(decision.autoCreate).toBe(true);
      expect(decision.showChips).toBe(false);
      expect(decision.entityType).toBe('log');
      expect(decision.logSubtype).toBe('idea');
      expect(decision.reason).toBe('confident_log_idea_85');
    });

    it('should auto-create general log with 75% confidence', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'log-general',
        type: 'log',
        confidence: 0.75,
        suppressChips: true,
        allowAutoCreate: true,
        logSubtype: 'general',
        probableKind: 'log',
        reasoning: 'Worker classified as log-general',
      };

      const decision = decideMindDropAction({
        canonicalIntent,
        text: 'The weather is beautiful today',
      });

      expect(decision.autoCreate).toBe(true);
      expect(decision.showChips).toBe(false);
      expect(decision.entityType).toBe('log');
      expect(decision.logSubtype).toBe('general');
      expect(decision.reason).toBe('confident_log_general_75');
    });

    it('should auto-create log at exactly 60% threshold', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'log-general',
        type: 'log',
        confidence: 0.6,
        suppressChips: true,
        allowAutoCreate: true,
        logSubtype: 'general',
        probableKind: 'log',
        reasoning: 'Worker classified as log-general',
      };

      const decision = decideMindDropAction({
        canonicalIntent,
        text: 'Random thought',
      });

      expect(decision.autoCreate).toBe(true);
      expect(decision.showChips).toBe(false);
    });

    it('should show chips for log at 59% confidence (below threshold)', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'log-general',
        type: 'log',
        confidence: 0.59,
        suppressChips: false,
        allowAutoCreate: false,
        logSubtype: 'general',
        probableKind: 'log',
        reasoning: 'Worker classified as log-general (low confidence)',
      };

      const decision = decideMindDropAction({
        canonicalIntent,
        text: 'Something vague',
      });

      expect(decision.autoCreate).toBe(false);
      expect(decision.showChips).toBe(true);
      expect(decision.reason).toBe('ambiguous_log_general_59');
    });
  });

  describe('Ambiguous cases: Show chips', () => {
    it('should show chips for medium-confidence log-general (45%)', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'log-general',
        type: 'log',
        confidence: 0.45,
        suppressChips: false,
        allowAutoCreate: false,
        logSubtype: 'general',
        probableKind: 'log',
        reasoning: 'Worker classified as log-general (ambiguous)',
      };

      const decision = decideMindDropAction({
        canonicalIntent,
        text: 'Thinking about dinner plans with Sarah Friday',
      });

      expect(decision.autoCreate).toBe(false);
      expect(decision.showChips).toBe(true);
      expect(decision.overlayAutoOpen).toBe(false);
      expect(decision.entityType).toBe('log');
      expect(decision.logSubtype).toBe('general');
      expect(decision.probableKind).toBe('log');
      expect(decision.reason).toBe('ambiguous_log_general_45');
    });
  });

  describe('Unsorted: Gibberish detection', () => {
    it('should ignore true gibberish (no letters)', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'unsorted',
        type: 'ignore',
        confidence: 0.05,
        suppressChips: true,
        allowAutoCreate: false,
        logSubtype: null,
        probableKind: 'none',
        reasoning: 'Worker classified as unsorted (gibberish)',
      };

      const decision = decideMindDropAction({
        canonicalIntent,
        text: '!!!',
      });

      expect(decision.autoCreate).toBe(false);
      expect(decision.showChips).toBe(false); // No chips for true gibberish
      expect(decision.entityType).toBe('ignore');
      expect(decision.reason).toBe('gibberish_no_letters');
    });

    it('should ignore gibberish with < 2 letters', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'unsorted',
        type: 'ignore',
        confidence: 0.1,
        suppressChips: true,
        allowAutoCreate: false,
        logSubtype: null,
        probableKind: 'none',
        reasoning: 'Worker classified as unsorted',
      };

      const decision = decideMindDropAction({
        canonicalIntent,
        text: 'a123456789',
      });

      expect(decision.autoCreate).toBe(false);
      expect(decision.showChips).toBe(false);
      expect(decision.reason).toBe('gibberish_no_letters');
    });

    it('should ignore gibberish with mostly non-alphanumeric (> 80%)', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'unsorted',
        type: 'ignore',
        confidence: 0.05,
        suppressChips: true,
        allowAutoCreate: false,
        logSubtype: null,
        probableKind: 'none',
        reasoning: 'Worker classified as unsorted',
      };

      const decision = decideMindDropAction({
        canonicalIntent,
        text: '!@#$%^&*()_+abc',
      });

      expect(decision.autoCreate).toBe(false);
      expect(decision.showChips).toBe(false);
      expect(decision.reason).toBe('gibberish_no_letters');
    });

    it('should show chips for meaningful text classified as unsorted', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'unsorted',
        type: 'ignore',
        confidence: 0.15,
        suppressChips: true,
        allowAutoCreate: false,
        logSubtype: null,
        probableKind: 'none',
        reasoning: 'Worker classified as unsorted',
      };

      const decision = decideMindDropAction({
        canonicalIntent,
        text: 'umbrella',
      });

      expect(decision.autoCreate).toBe(false);
      expect(decision.showChips).toBe(true); // Meaningful text, show chips
      expect(decision.entityType).toBe('log'); // Default to log
      expect(decision.logSubtype).toBe('general');
      expect(decision.probableKind).toBe('log');
      expect(decision.reason).toBe('unsorted_but_meaningful');
    });

    it('should show chips for sentence classified as unsorted', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'unsorted',
        type: 'ignore',
        confidence: 0.2,
        suppressChips: true,
        allowAutoCreate: false,
        logSubtype: null,
        probableKind: 'none',
        reasoning: 'Worker classified as unsorted',
      };

      const decision = decideMindDropAction({
        canonicalIntent,
        text: 'This is a complete sentence with actual words',
      });

      expect(decision.autoCreate).toBe(false);
      expect(decision.showChips).toBe(true);
      expect(decision.entityType).toBe('log');
      expect(decision.reason).toBe('unsorted_but_meaningful');
    });
  });

  describe('Fallback: Unknown bucket', () => {
    it('should show chips with log default for unknown bucket', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'unknown-bucket',
        type: 'log',
        confidence: 0.5,
        suppressChips: false,
        allowAutoCreate: false,
        logSubtype: null,
        probableKind: 'log',
        reasoning: 'Unknown bucket',
      };

      const decision = decideMindDropAction({
        canonicalIntent,
        text: 'Some text',
      });

      expect(decision.autoCreate).toBe(false);
      expect(decision.showChips).toBe(true);
      expect(decision.entityType).toBe('log');
      expect(decision.logSubtype).toBe('general');
      expect(decision.probableKind).toBe('log');
      expect(decision.reason).toBe('unknown_bucket_unknown-bucket');
    });
  });

  describe('Chip ordering by probable kind', () => {
    it('should order chips with todo first when probableKind is todo', () => {
      const chips = getChipOptions('todo');

      expect(chips).toHaveLength(3);
      expect(chips[0].kind).toBe('todo');
      expect(chips[0].label).toBe('Add to To-Do List');
      expect(chips[0].emphasized).toBe(true);
      expect(chips[1].kind).toBe('log');
      expect(chips[2].kind).toBe('habit');
    });

    it('should order chips with habit first when probableKind is habit', () => {
      const chips = getChipOptions('habit');

      expect(chips).toHaveLength(3);
      expect(chips[0].kind).toBe('habit');
      expect(chips[0].label).toBe('Start a Habit');
      expect(chips[0].emphasized).toBe(true);
      expect(chips[1].kind).toBe('todo');
      expect(chips[2].kind).toBe('log');
    });

    it('should order chips with log first when probableKind is log', () => {
      const chips = getChipOptions('log');

      expect(chips).toHaveLength(3);
      expect(chips[0].kind).toBe('log');
      expect(chips[0].label).toBe('Just Save It');
      expect(chips[0].emphasized).toBe(true);
      expect(chips[1].kind).toBe('todo');
      expect(chips[2].kind).toBe('habit');
    });

    it('should use default order when probableKind is none', () => {
      const chips = getChipOptions('none');

      expect(chips).toHaveLength(3);
      expect(chips[0].kind).toBe('todo');
      expect(chips[0].emphasized).toBe(false);
      expect(chips[1].kind).toBe('log');
      expect(chips[2].kind).toBe('habit');
    });
  });

  describe('Custom thresholds', () => {
    it('should use custom todo threshold', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'todo',
        type: 'todo',
        confidence: 0.75,
        suppressChips: true,
        allowAutoCreate: true,
        logSubtype: null,
        probableKind: 'todo',
        reasoning: 'Worker classified as todo',
      };

      // Default threshold is 0.7, so 0.75 should auto-create
      const decision1 = decideMindDropAction({
        canonicalIntent,
        text: 'Buy milk',
      });
      expect(decision1.autoCreate).toBe(true);

      // With custom threshold of 0.8, 0.75 should show chips
      const decision2 = decideMindDropAction({
        canonicalIntent,
        text: 'Buy milk',
        thresholds: { todo: 0.8 },
      });
      expect(decision2.autoCreate).toBe(false);
      expect(decision2.showChips).toBe(true);
    });

    it('should use custom log threshold', () => {
      const canonicalIntent: CanonicalIntentResult = {
        bucket: 'log-general',
        type: 'log',
        confidence: 0.65,
        suppressChips: true,
        allowAutoCreate: true,
        logSubtype: 'general',
        probableKind: 'log',
        reasoning: 'Worker classified as log-general',
      };

      // Default threshold is 0.6, so 0.65 should auto-create
      const decision1 = decideMindDropAction({
        canonicalIntent,
        text: 'Random thought',
      });
      expect(decision1.autoCreate).toBe(true);

      // With custom threshold of 0.7, 0.65 should show chips
      const decision2 = decideMindDropAction({
        canonicalIntent,
        text: 'Random thought',
        thresholds: { log: 0.7 },
      });
      expect(decision2.autoCreate).toBe(false);
      expect(decision2.showChips).toBe(true);
    });
  });
});
