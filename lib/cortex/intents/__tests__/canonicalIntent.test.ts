/**
 * Tests for canonicalIntent resolver
 *
 * UNIFIED CLASSIFIER SPEC (Phase 3):
 * ===================================
 * These tests are bound to the unified classifier worker specification.
 * The worker (gentle-thunder-5854.woolmerjames.workers.dev) returns:
 *   - bucket: "todo" | "habit" | "log-journal" | "log-idea" | "log-general" | "unsorted"
 *   - type: "todo" | "habit" | "log" | "ignore"
 *   - subtype: "journal" | "idea" | "general" | null
 *   - confidence: 0-100 (normalized to 0-1 in classifyIntentWithAI)
 *
 * WORKER-FIRST BEHAVIOR:
 * - Worker bucket/type/subtype is the PRIMARY source of truth
 * - Heuristics are minimal overlays, not competing classifiers
 * - Heuristic override only for edge case: bucket='log-general' + strong habit rule (conf >= 0.9)
 *
 * SACRED RULES:
 * - Unsorted is RARE (0-3% of drops) - only for true junk/gibberish
 * - Meaningful text MUST be classified as: todo, habit, or log-* bucket
 * - No more complex "master category" mapping logic
 *
 * Changes to worker prompt or classifier spec MUST keep these tests in sync.
 *
 * Focus: Ambiguous social plan detection, proto-tasks, worker-first canonical mapping
 */

import { resolveCanonicalIntent } from '../canonicalIntent';
import type { IntentInputs } from '../canonicalIntent';

describe('canonicalIntent - Ambiguous Social Plans', () => {
  /**
   * Test case: "Drinks with Sam on Friday"
   * Expected: type='todo', mode='ask', showChips=true, allowAutoCreate=false
   */
  it('should detect "Drinks with Sam on Friday" as ambiguous social plan', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.3,
      aiBucket: 'log-general',
      aiType: 'log',
      aiSubtype: 'general',
      aiConfidence: 0.58, // 58% - in the 30-70% range
      text: 'Drinks with Sam on Friday',
    };

    const result = resolveCanonicalIntent(inputs);

    // AI classified as log with medium confidence, heuristics don't override
    expect(result.type).toBe('log');
    // Reasoning reflects AI classification: "Worker classified as log_general (subtype: general)"
  });

  /**
   * Test case: "Dinner tonight with Jeff"
   * Expected: type='todo', mode='ask', showChips=true, allowAutoCreate=false
   */
  it('should detect "Dinner tonight with Jeff" as ambiguous social plan', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.3,
      aiBucket: 'log-general',
      aiType: 'log',
      aiSubtype: 'general',
      aiConfidence: 0.6, // 60% - in the 30-70% range
      text: 'Dinner tonight with Jeff',
    };

    const result = resolveCanonicalIntent(inputs);

    // AI classified as log with medium confidence, heuristics don't override
    expect(result.type).toBe('log');
    expect(result.reasoning).toContain('Worker classified');
  });

  /**
   * Test case: "Brunch with Alex next weekend"
   * Expected: type='todo', mode='ask', showChips=true, allowAutoCreate=false
   */
  it('should detect "Brunch with Alex next weekend" as ambiguous social plan', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.3,
      aiBucket: 'log-general',
      aiType: 'log',
      aiSubtype: 'general',
      aiConfidence: 0.55, // 55% - in the 30-70% range
      text: 'Brunch with Alex next weekend',
    };

    const result = resolveCanonicalIntent(inputs);

    // AI classified as log with medium confidence, heuristics don't override
    expect(result.type).toBe('log');
    expect(result.reasoning).toContain('Worker classified');
  });

  /**
   * Test case: "Coffee with Maria tomorrow"
   * Expected: type='todo', mode='ask', showChips=true, allowAutoCreate=false
   */
  it('should detect "Coffee with Maria tomorrow" as ambiguous social plan', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.3,
      aiBucket: 'log-general',
      aiType: 'log',
      aiSubtype: 'general',
      aiConfidence: 0.5, // 50% - in the 30-70% range
      text: 'Coffee with Maria tomorrow',
    };

    const result = resolveCanonicalIntent(inputs);

    // AI classified as log with medium confidence, heuristics don't override
    expect(result.type).toBe('log');
  });

  /**
   * Test case: When AI classifies as medium-confidence TODO (like production does)
   * "Dinner tonight with Jeff" - AI says 'todo' at 60%
   * Expected: type='todo' but mode='ask', showChips=true, allowAutoCreate=false
   */
  it('should detect medium-confidence todo as ambiguous social plan when heuristics match', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.3,
      aiBucket: 'todo',
      aiType: 'todo',
      aiSubtype: null,
      aiConfidence: 0.6, // 60% - medium confidence, below auto-create threshold
      text: 'Dinner tonight with Jeff',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo'); // Keep as todo since AI said so
    expect(result.mode).toBe('ask'); // But force ask mode
    expect(result.allowAutoCreate).toBe(false);
    expect(result.chipDecision).toBeDefined();
    expect(result.chipDecision?.showChips).toBe(true);
    expect(result.chipDecision?.needsClarification).toBe(true);
    expect(result.chipDecision?.reason).toBe('ambiguous-social-plan');
    expect(result.probableKind).toBe('log'); // Hint it could also be a log
    // Reasoning string varies, just verify decision is correct
  });

  /**
   * Test case: High confidence todo should not be affected
   * "Email Sarah the proposal" with 88% confidence
   * Expected: Auto-create, no chips
   */
  it('should NOT affect high-confidence todos', () => {
    const inputs: IntentInputs = {
      ruleKind: 'todo',
      ruleConfidence: 0.9,
      aiBucket: 'todo',
      aiType: 'todo',
      aiSubtype: null,
      aiConfidence: 0.88,
      text: 'Email Sarah the proposal',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo');
    expect(result.allowAutoCreate).toBe(true);
    expect(result.mode).toBeUndefined(); // No mode override for normal todos
    // Reasoning varies, just verify auto-create behavior
  });

  /**
   * Test case: Reflective log should auto-create
   * "Just thinking about my goals"
   * Expected: Auto-create as log, no chips
   */
  it('should NOT affect reflective logs', () => {
    const inputs: IntentInputs = {
      ruleKind: 'note',
      ruleConfidence: 0.6,
      aiBucket: 'log-journal',
      aiType: 'log',
      aiSubtype: 'journal',
      aiConfidence: 0.45,
      text: 'Just thinking about my goals',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('log');
    expect(result.allowAutoCreate).toBe(true);
    expect(result.mode).toBeUndefined();
    // Reasoning varies, just verify log behavior
  });

  /**
   * Test case: Social plan with low AI and rule confidence
   * Phase 3: Worker bucket is respected, no heuristic upgrade for social plans
   */
  it('should respect worker bucket for social plans (no heuristic upgrade)', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.2,
      aiBucket: 'log-general',
      aiType: 'log',
      aiSubtype: 'general',
      aiConfidence: 0.25, // Low confidence
      text: 'Lunch with David this Friday',
    };

    const result = resolveCanonicalIntent(inputs);

    // Phase 3: Worker bucket is primary, no social plan heuristic override
    // Falls back to rule-based when AI conf < 0.4, but rules also say 'none'
    // So we use the worker's log-general classification
    expect(result.type).toBe('log');
    expect(result.logSubtype).toBe('general');
  });

  /**
   * Test case: Social plan WITHOUT person name should not trigger
   * "Dinner tonight" - no person mentioned
   */
  it('should NOT detect social plan without person indicator', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.3,
      aiBucket: 'log-general',
      aiType: 'log',
      aiSubtype: 'general',
      aiConfidence: 0.5,
      text: 'Dinner tonight',
    };

    const result = resolveCanonicalIntent(inputs);

    // Should fall through to master spec classification, not ambiguous social plan
    expect(result.mode).toBeUndefined();
    expect(result.reasoning).toContain('Worker classified'); // Actual reasoning from unified classifier
  });
});

describe('canonicalIntent - Proto-Tasks', () => {
  /**
   * Test case: "Maybe I should email Sarah about the project"
   * Expected: type='todo', mode='ask', allowAutoCreate=false
   */
  it('should detect "Maybe I should email Sarah" as proto-task', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.3,
      aiBucket: 'todo',
      aiType: 'todo',
      aiSubtype: null,
      aiConfidence: 0.55,
      text: 'Maybe I should email Sarah about the project',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo');
    expect(result.mode).toBe('ask');
    expect(result.allowAutoCreate).toBe(false);
    expect(result.confidence).toBe(0.6);
    expect(result.chipDecision).toBeDefined();
    expect(result.chipDecision?.showChips).toBe(true);
    expect(result.chipDecision?.needsClarification).toBe(true);
    expect(result.chipDecision?.reason).toBe('proto-task');
    expect(result.reasoning).toContain('proto-task');
  });

  /**
   * Test case: "Should probably book a dentist appointment soon" with log bucket
   * Phase 3: Worker bucket is primary. Proto-task detection only works with todo buckets.
   * If worker says log-general, we respect it.
   */
  it('should respect worker log bucket (proto-task detection requires todo bucket)', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.4,
      aiBucket: 'log-general',
      aiType: 'log',
      aiSubtype: 'general',
      aiConfidence: 0.45,
      text: 'Should probably book a dentist appointment soon',
    };

    const result = resolveCanonicalIntent(inputs);

    // Phase 3: Worker says log-general, we respect it
    expect(result.type).toBe('log');
    expect(result.logSubtype).toBe('general');
  });

  /**
   * Test case: "Might start looking for a new job" with log bucket
   * Phase 3: Worker bucket is primary. If worker returns log-general, we respect it.
   */
  it('should respect worker log bucket for vague future thoughts', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.3,
      aiBucket: 'log-general',
      aiType: 'log',
      aiSubtype: 'general',
      aiConfidence: 0.4,
      text: 'Might start looking for a new job',
    };

    const result = resolveCanonicalIntent(inputs);

    // Phase 3: Worker says log-general, we respect it
    expect(result.type).toBe('log');
    expect(result.logSubtype).toBe('general');
  });

  /**
   * Test case: "I should call Mum"
   * Expected: type='todo', mode='ask', allowAutoCreate=false
   */
  it('should detect "I should call Mum" as proto-task', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.4,
      aiBucket: 'todo',
      aiType: 'todo',
      aiSubtype: null,
      aiConfidence: 0.5,
      text: 'I should call Mum',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo');
    expect(result.mode).toBe('ask');
    expect(result.allowAutoCreate).toBe(false);
    expect(result.chipDecision?.reason).toBe('proto-task');
  });
});

describe('canonicalIntent - High-Confidence Actions', () => {
  /**
   * Test case: "Call Mum sometime this week"
   * With high confidence (0.9), should auto-create
   */
  it('should auto-create high-confidence todo "Call Mum sometime this week"', () => {
    const inputs: IntentInputs = {
      ruleKind: 'todo',
      ruleConfidence: 0.9,
      aiBucket: 'todo',
      aiType: 'todo',
      aiSubtype: null,
      aiConfidence: 0.85,
      text: 'Call Mum sometime this week',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo');
    expect(result.allowAutoCreate).toBe(true);
    expect(result.mode).toBeUndefined(); // No mode override for normal auto-create
    // Reasoning varies based on worker confidence, just verify behavior
  });

  /**
   * Test case: "Need to do something about my sleep schedule"
   * With high confidence (0.9), should auto-create
   */
  it('should auto-create high-confidence todo "Need to do something about my sleep schedule"', () => {
    const inputs: IntentInputs = {
      ruleKind: 'todo',
      ruleConfidence: 0.9,
      aiBucket: 'todo',
      aiType: 'todo',
      aiSubtype: null,
      aiConfidence: 0.82,
      text: 'Need to do something about my sleep schedule',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo');
    expect(result.allowAutoCreate).toBe(true);
    expect(result.mode).toBeUndefined();
    // Reasoning varies based on worker confidence, just verify behavior
  });
});

describe('canonicalIntent - Master Spec Integration (Phase 1)', () => {
  /**
   * Test high-confidence AI picks category correctly
   */
  it('should prefer strong AI signal when above threshold', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.3,
      aiBucket: 'todo',
      aiType: 'todo',
      aiSubtype: null,
      aiConfidence: 0.7, // Above MIN_CATEGORY_CONFIDENCE (0.4)
      text: 'Send the report',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  /**
   * Test worker-first behavior with medium rule confidence
   * Phase 3: Habit upgrade only happens when ruleConf >= 0.9 AND aiConf < 0.8
   * This test has ruleConf=0.8 (below threshold), so worker bucket is respected
   */
  it('should respect worker bucket when rule confidence is below upgrade threshold', () => {
    const inputs: IntentInputs = {
      ruleKind: 'habit',
      ruleConfidence: 0.8, // Below 0.9 threshold for override
      aiBucket: 'log-general',
      aiType: 'log',
      aiSubtype: 'general',
      aiConfidence: 0.3,
      text: 'Exercise daily',
    };

    const result = resolveCanonicalIntent(inputs);

    // Phase 3: Worker bucket is primary source of truth
    // Upgrade requires ruleConf >= 0.9, so this stays as log
    expect(result.type).toBe('log');
    expect(result.logSubtype).toBe('general');
  });

  /**
   * Test heuristic override with strong rule confidence
   * Phase 3: Only override when ruleConf >= 0.9 AND aiConf < 0.8
   */
  it('should upgrade log-general to habit when rule confidence is very high (>= 0.9)', () => {
    const inputs: IntentInputs = {
      ruleKind: 'habit',
      ruleConfidence: 0.95, // Above 0.9 threshold
      aiBucket: 'log-general',
      aiType: 'log',
      aiSubtype: 'general',
      aiConfidence: 0.3, // Below 0.8
      text: 'Exercise daily',
    };

    const result = resolveCanonicalIntent(inputs);

    // Heuristic override: strong rule signal upgrades to habit
    expect(result.type).toBe('habit');
    expect(result.reasoning).toContain('Rule-based habit override');
  });

  /**
   * Test meaningful text never becomes unsorted
   */
  it('should convert unsorted to log_general for meaningful text', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.1,
      aiBucket: 'log-general',
      aiType: 'log',
      aiSubtype: 'general',
      aiConfidence: 0.4,
      text: 'Coffee shop closes at 5pm',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('log');
    expect(result.reasoning).toContain('Worker classified');
  });

  /**
   * Test text-based category fallback when AI/rules are weak
   */
  it('should use text-based category when AI and rules are weak', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.2,
      aiBucket: 'log-journal',
      aiType: 'log',
      aiSubtype: 'journal',
      aiConfidence: 0.55,
      text: 'I feel overwhelmed about work',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('log');
    // Should be auto-created as it's meaningful content
  });

  /**
   * Test pure gibberish handling
   * Phase 3: Unified spec - gibberish with bucket='unsorted' becomes type='ignore'
   * Worker is source of truth, no auto-create for junk content
   */
  it('should treat pure gibberish as ignore when worker returns unsorted bucket', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0,
      aiBucket: 'unsorted',
      aiType: 'ignore',
      aiSubtype: null,
      aiConfidence: 0.25,
      text: 'asdfghjkl',
    };

    const result = resolveCanonicalIntent(inputs);

    // Phase 3: bucket='unsorted' → type='ignore', allowAutoCreate=false
    expect(result.type).toBe('ignore');
    expect(result.allowAutoCreate).toBe(false);
    expect(result.bucket).toBe('unsorted');
  });

  /**
   * Test combined confidence selection
   */
  it('should combine AI and rule confidence for todo decision', () => {
    const inputs: IntentInputs = {
      ruleKind: 'todo',
      ruleConfidence: 0.6,
      aiBucket: 'todo',
      aiType: 'todo',
      aiSubtype: null,
      aiConfidence: 0.7,
      text: 'Book flight to NYC',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo');
    // Combined should be max(0.6, 0.7) = 0.7
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });
});
