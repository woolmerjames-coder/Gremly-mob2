/**
 * Tests for canonicalIntent resolver
 * Focus: Ambiguous social plan detection
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
      aiCategory: 'log',
      aiConfidence: 0.58, // 58% - in the 30-70% range
      text: 'Drinks with Sam on Friday',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo'); // Changed from 'log' to 'todo' per user requirements
    expect(result.mode).toBe('ask');
    expect(result.allowAutoCreate).toBe(false);
    expect(result.chipDecision).toBeDefined();
    expect(result.chipDecision?.showChips).toBe(true);
    expect(result.chipDecision?.needsClarification).toBe(true);
    expect(result.chipDecision?.reason).toBe('simple-social-event'); // Changed from 'ambiguous-social-plan'
    expect(result.reasoning).toContain('social event');
  });

  /**
   * Test case: "Dinner tonight with Jeff"
   * Expected: type='todo', mode='ask', showChips=true, allowAutoCreate=false
   */
  it('should detect "Dinner tonight with Jeff" as ambiguous social plan', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.3,
      aiCategory: 'log',
      aiConfidence: 0.6, // 60% - in the 30-70% range
      text: 'Dinner tonight with Jeff',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo'); // Changed from 'log' to 'todo' per user requirements
    expect(result.mode).toBe('ask');
    expect(result.allowAutoCreate).toBe(false);
    expect(result.chipDecision).toBeDefined();
    expect(result.chipDecision?.showChips).toBe(true);
    expect(result.chipDecision?.needsClarification).toBe(true);
    expect(result.chipDecision?.reason).toBe('simple-social-event'); // Changed from 'ambiguous-social-plan'
    expect(result.reasoning).toContain('social event');
  });

  /**
   * Test case: "Brunch with Alex next weekend"
   * Expected: type='todo', mode='ask', showChips=true, allowAutoCreate=false
   */
  it('should detect "Brunch with Alex next weekend" as ambiguous social plan', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.3,
      aiCategory: 'log',
      aiConfidence: 0.55, // 55% - in the 30-70% range
      text: 'Brunch with Alex next weekend',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo'); // Changed from 'log' to 'todo' per user requirements
    expect(result.mode).toBe('ask');
    expect(result.allowAutoCreate).toBe(false);
    expect(result.chipDecision).toBeDefined();
    expect(result.chipDecision?.showChips).toBe(true);
    expect(result.chipDecision?.needsClarification).toBe(true);
    expect(result.chipDecision?.reason).toBe('simple-social-event'); // Changed from 'ambiguous-social-plan'
    expect(result.reasoning).toContain('social event');
  });

  /**
   * Test case: "Coffee with Maria tomorrow"
   * Expected: type='todo', mode='ask', showChips=true, allowAutoCreate=false
   */
  it('should detect "Coffee with Maria tomorrow" as ambiguous social plan', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.3,
      aiCategory: 'log',
      aiConfidence: 0.5, // 50% - in the 30-70% range
      text: 'Coffee with Maria tomorrow',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo'); // Changed from 'log' to 'todo' per user requirements
    expect(result.mode).toBe('ask');
    expect(result.allowAutoCreate).toBe(false);
    expect(result.chipDecision).toBeDefined();
    expect(result.chipDecision?.showChips).toBe(true);
    expect(result.chipDecision?.needsClarification).toBe(true);
    expect(result.chipDecision?.reason).toBe('simple-social-event'); // Changed from 'ambiguous-social-plan'
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
      aiCategory: 'todo', // AI thinks it's a todo
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
    expect(result.reasoning).toContain('Ambiguous social plan');
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
      aiCategory: 'todo',
      aiConfidence: 0.88,
      text: 'Email Sarah the proposal',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo');
    expect(result.allowAutoCreate).toBe(true);
    expect(result.mode).toBeUndefined(); // No mode override for normal todos
    expect(result.reasoning).toContain('High-confidence todo');
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
      aiCategory: 'log',
      aiConfidence: 0.45,
      text: 'Just thinking about my goals',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('log');
    expect(result.allowAutoCreate).toBe(true);
    expect(result.mode).toBeUndefined();
    expect(result.reasoning).toContain('Reflection');
  });

  /**
   * Test case: Social plan without AI confidence in range should still trigger
   * if it has the heuristic markers
   */
  it('should detect social plan via heuristics even with low AI confidence', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.2,
      aiCategory: 'log',
      aiConfidence: 0.25, // Below 30% threshold
      text: 'Lunch with David this Friday',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo'); // Changed from 'log' to 'todo' per user requirements
    expect(result.mode).toBe('ask');
    expect(result.allowAutoCreate).toBe(false);
    expect(result.chipDecision?.showChips).toBe(true);
    expect(result.chipDecision?.needsClarification).toBe(true);
  });

  /**
   * Test case: Social plan WITHOUT person name should not trigger
   * "Dinner tonight" - no person mentioned
   */
  it('should NOT detect social plan without person indicator', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.3,
      aiCategory: 'log',
      aiConfidence: 0.5,
      text: 'Dinner tonight',
    };

    const result = resolveCanonicalIntent(inputs);

    // Should fall through to master spec classification, not ambiguous social plan
    expect(result.mode).toBeUndefined();
    expect(result.reasoning).toContain('Master spec'); // Changed from 'Default fallback' to 'Master spec'
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
      aiCategory: 'todo',
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
   * Test case: "Should probably book a dentist appointment soon"
   * Expected: type='todo', mode='ask', allowAutoCreate=false
   */
  it('should detect "Should probably book a dentist appointment" as proto-task', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.4,
      aiCategory: 'log',
      aiConfidence: 0.45,
      text: 'Should probably book a dentist appointment soon',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo');
    expect(result.mode).toBe('ask');
    expect(result.allowAutoCreate).toBe(false);
    expect(result.chipDecision?.reason).toBe('proto-task');
  });

  /**
   * Test case: "Might start looking for a new job"
   * Expected: type='todo', mode='ask', allowAutoCreate=false
   */
  it('should detect "Might start looking for a new job" as proto-task', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.3,
      aiCategory: 'log',
      aiConfidence: 0.4,
      text: 'Might start looking for a new job',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo');
    expect(result.mode).toBe('ask');
    expect(result.allowAutoCreate).toBe(false);
    expect(result.chipDecision?.reason).toBe('proto-task');
  });

  /**
   * Test case: "I should call Mum"
   * Expected: type='todo', mode='ask', allowAutoCreate=false
   */
  it('should detect "I should call Mum" as proto-task', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.4,
      aiCategory: 'todo',
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
      aiCategory: 'todo',
      aiConfidence: 0.85,
      text: 'Call Mum sometime this week',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo');
    expect(result.allowAutoCreate).toBe(true);
    expect(result.mode).toBeUndefined(); // No mode override for normal auto-create
    expect(result.reasoning).toContain('High-confidence todo');
  });

  /**
   * Test case: "Need to do something about my sleep schedule"
   * With high confidence (0.9), should auto-create
   */
  it('should auto-create high-confidence todo "Need to do something about my sleep schedule"', () => {
    const inputs: IntentInputs = {
      ruleKind: 'todo',
      ruleConfidence: 0.9,
      aiCategory: 'todo',
      aiConfidence: 0.82,
      text: 'Need to do something about my sleep schedule',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo');
    expect(result.allowAutoCreate).toBe(true);
    expect(result.mode).toBeUndefined();
    expect(result.reasoning).toContain('High-confidence todo');
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
      aiCategory: 'todo',
      aiConfidence: 0.7, // Above MIN_CATEGORY_CONFIDENCE (0.4)
      text: 'Send the report',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  /**
   * Test strong rule result with low AI confidence
   */
  it('should prefer strong rule result when AI is low', () => {
    const inputs: IntentInputs = {
      ruleKind: 'habit',
      ruleConfidence: 0.8,
      aiCategory: 'log',
      aiConfidence: 0.3,
      text: 'Exercise daily',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('habit');
  });

  /**
   * Test meaningful text never becomes unsorted
   */
  it('should convert unsorted to log_general for meaningful text', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.1,
      aiCategory: null,
      aiConfidence: 0,
      text: 'Coffee shop closes at 5pm',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('log');
    expect(result.reasoning).toContain('Master spec');
  });

  /**
   * Test text-based category fallback when AI/rules are weak
   */
  it('should use text-based category when AI and rules are weak', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0.2,
      aiCategory: null,
      aiConfidence: 0,
      text: 'I feel overwhelmed about work',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('log');
    // Should be auto-created as it's meaningful content
  });

  /**
   * Test gibberish detection
   */
  it('should treat pure gibberish as unsorted but still convert to log', () => {
    const inputs: IntentInputs = {
      ruleKind: 'none',
      ruleConfidence: 0,
      aiCategory: null,
      aiConfidence: 0,
      text: 'asdfghjkl',
    };

    const result = resolveCanonicalIntent(inputs);

    // Even gibberish should be log (not ignore) per master spec bias
    expect(result.type).toBe('log');
  });

  /**
   * Test combined confidence selection
   */
  it('should combine AI and rule confidence for todo decision', () => {
    const inputs: IntentInputs = {
      ruleKind: 'todo',
      ruleConfidence: 0.6,
      aiCategory: 'todo',
      aiConfidence: 0.7,
      text: 'Book flight to NYC',
    };

    const result = resolveCanonicalIntent(inputs);

    expect(result.type).toBe('todo');
    // Combined should be max(0.6, 0.7) = 0.7
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });
});
