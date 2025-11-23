/**
 * Mind Drop Classification Report Test
 *
 * Automated test that feeds sample Mind Drop texts through the canonical intent pipeline
 * and generates a table showing how each text is classified.
 *
 * This helps verify:
 * - Clear todos/habits auto-create without chips
 * - Reflective logs don't trigger chips
 * - Canonical resolver behaves consistently
 *
 * Run with: npm test -- minddrop-classification-report.test.ts
 */

import { detectIntent } from '../lib/cortex/intents/detectIntent';
import { resolveCanonicalIntent } from '../lib/cortex/intents/canonicalIntent';
import type { IntentKind } from '../lib/cortex/intents/types';

// Test samples with expected canonical types
const samples = [
  // Clear todos
  { text: 'Buy milk tomorrow morning', expectedCanonical: 'todo' },
  { text: 'Email Sarah the proposal', expectedCanonical: 'todo' },
  { text: 'Book dentist appointment next week', expectedCanonical: 'todo' },
  { text: 'Pay electricity bill tonight', expectedCanonical: 'todo' },
  { text: 'Pick up my prescription at CVS', expectedCanonical: 'todo' },

  // Clear habits
  { text: 'Run 3 times a week', expectedCanonical: 'habit' },
  { text: 'Meditate daily at 7am', expectedCanonical: 'habit' },
  { text: 'Drink more water every day', expectedCanonical: 'habit' },
  { text: 'Stretch before bed each night', expectedCanonical: 'habit' },
  { text: 'Read 10 pages every morning', expectedCanonical: 'habit' },

  // Logs / notes
  { text: 'Just thinking about maybe starting a side hustle someday', expectedCanonical: 'log' },
  { text: 'Today was stressful but I handled it better than usual', expectedCanonical: 'log' },
  { text: 'I talked to Alex about our upcoming trip', expectedCanonical: 'log' },
  { text: 'Brainstorming ideas for next year goals', expectedCanonical: 'log' },
  { text: 'Reflected on my week and what worked well', expectedCanonical: 'log' },

  // Edge / ambiguous
  { text: 'Meeting with John about launch', expectedCanonical: 'log' },
  { text: 'Dinner tonight with Jeff', expectedCanonical: 'log' },

  // Meta / ignore-ish
  { text: 'hmm not sure what I meant by that', expectedCanonical: 'log' },
  { text: 'idk', expectedCanonical: 'log' },
  { text: 'just thinking out loud', expectedCanonical: 'log' },
];

// Mock AI classification map (deterministic for testing)
const mockAIMap: Record<string, { category: string; confidence: number }> = {
  // Todos
  'Buy milk tomorrow morning': { category: 'todo', confidence: 92 },
  'Email Sarah the proposal': { category: 'todo', confidence: 88 },
  'Book dentist appointment next week': { category: 'todo', confidence: 90 },
  'Pay electricity bill tonight': { category: 'todo', confidence: 91 },
  'Pick up my prescription at CVS': { category: 'todo', confidence: 89 },

  // Habits
  'Run 3 times a week': { category: 'habit', confidence: 95 },
  'Meditate daily at 7am': { category: 'habit', confidence: 93 },
  'Drink more water every day': { category: 'habit', confidence: 88 },
  'Stretch before bed each night': { category: 'habit', confidence: 90 },
  'Read 10 pages every morning': { category: 'habit', confidence: 92 },

  // Logs
  'Just thinking about maybe starting a side hustle someday': { category: 'log', confidence: 45 },
  'Today was stressful but I handled it better than usual': { category: 'log', confidence: 72 },
  'I talked to Alex about our upcoming trip': { category: 'log', confidence: 68 },
  'Brainstorming ideas for next year goals': { category: 'log', confidence: 55 },
  'Reflected on my week and what worked well': { category: 'log', confidence: 70 },

  // Edge cases
  'Meeting with John about launch': { category: 'log', confidence: 62 },
  'Dinner tonight with Jeff': { category: 'log', confidence: 58 },

  // Meta
  'hmm not sure what I meant by that': { category: 'ignore', confidence: 40 },
  idk: { category: 'ignore', confidence: 35 },
  'just thinking out loud': { category: 'log', confidence: 48 },
};

// Helper to get mocked AI classification
function getMockedAI(text: string): { category: string; confidence: number } {
  return mockAIMap[text] || { category: 'log', confidence: 35 };
}

// Map canonical type to action
function canonicalToAction(canonicalType: string): string[] {
  switch (canonicalType) {
    case 'todo':
      return ['create.todo'];
    case 'habit':
      return ['create.habit'];
    case 'log':
      return ['create.note'];
    case 'meta':
      return [];
    case 'ignore':
      return [];
    default:
      return ['create.note'];
  }
}

// Determine if chips should show based on canonical intent result
function shouldShowChips(
  canonicalType: string,
  confidence: number,
  allowAutoCreate: boolean,
  suppressChips: boolean,
): boolean {
  // Never show chips if suppressed (meta-comments)
  if (suppressChips) return false;

  // Auto-create means no chips needed
  if (allowAutoCreate) return false;

  // For todos/habits with medium confidence (not auto-create but not ignore), show chips
  if (
    (canonicalType === 'todo' || canonicalType === 'habit') &&
    confidence >= 0.4 &&
    confidence < 0.85
  ) {
    return true;
  }

  // For logs with very low confidence, might show chips
  if (canonicalType === 'log' && confidence < 0.4) {
    return true;
  }

  // Default: no chips for clear logs
  return false;
}

interface ClassificationResult {
  text: string;
  ruleKind: IntentKind;
  aiCategory: string;
  aiConfidence: number;
  canonicalKind: string;
  canonicalConfidence: number;
  allowAutoCreate: boolean;
  finalActions: string[];
  willShowChips: boolean;
  reasoning: string;
}

describe('Mind Drop Classification Report', () => {
  it('should generate classification table for all samples', () => {
    const results: ClassificationResult[] = [];

    for (const sample of samples) {
      const { text } = sample;

      // Step 1: Rule-based detection
      const ruleResult = detectIntent(text);
      const ruleKind = ruleResult.kind;
      const ruleConfidence = ruleResult.confidence;

      // Step 2: Mock AI classification
      const aiResult = getMockedAI(text);
      const aiCategory = aiResult.category;
      const aiConfidence = aiResult.confidence / 100; // Normalize to 0-1 scale

      // Step 3: Canonical resolution
      const canonical = resolveCanonicalIntent({
        ruleKind,
        ruleConfidence,
        aiCategory,
        aiConfidence,
        text,
      });

      // Step 4: Determine actions and chip display
      const finalActions = canonicalToAction(canonical.type);
      const willShowChips = shouldShowChips(
        canonical.type,
        canonical.confidence,
        canonical.allowAutoCreate,
        canonical.suppressChips,
      );

      results.push({
        text: text.length > 50 ? text.slice(0, 47) + '...' : text,
        ruleKind,
        aiCategory,
        aiConfidence: Math.round(aiConfidence * 100), // Show as percentage
        canonicalKind: canonical.type,
        canonicalConfidence: Math.round(canonical.confidence * 100),
        allowAutoCreate: canonical.allowAutoCreate,
        finalActions,
        willShowChips,
        reasoning: canonical.reasoning.slice(0, 40) + '...',
      });
    }

    // Print table for visual inspection
    console.log('\n📊 Mind Drop Classification Report\n');
    console.table(
      results.map((r) => ({
        Text: r.text,
        Rule: r.ruleKind,
        'AI Cat': r.aiCategory,
        'AI %': r.aiConfidence,
        Canonical: r.canonicalKind,
        'Can %': r.canonicalConfidence,
        'Auto?': r.allowAutoCreate ? '✓' : '✗',
        Actions: r.finalActions.join(', '),
        'Chips?': r.willShowChips ? '⚠️ YES' : '✓ NO',
      })),
    );

    console.log('\n📈 Summary Statistics:\n');
    const stats = {
      total: results.length,
      byCanonical: {} as Record<string, number>,
      autoCreate: results.filter((r) => r.allowAutoCreate).length,
      showChips: results.filter((r) => r.willShowChips).length,
    };

    results.forEach((r) => {
      stats.byCanonical[r.canonicalKind] = (stats.byCanonical[r.canonicalKind] || 0) + 1;
    });

    console.log(`Total samples: ${stats.total}`);
    console.log(`By canonical type:`, stats.byCanonical);
    console.log(`Auto-create: ${stats.autoCreate}/${stats.total}`);
    console.log(`Chips shown: ${stats.showChips}/${stats.total}`);
    console.log('');

    // Assertions: Verify core behavior
    const todoResults = results.filter(
      (r) =>
        r.text.includes('Buy milk') ||
        r.text.includes('Email Sarah') ||
        r.text.includes('Book dentist') ||
        r.text.includes('Pay electricity') ||
        r.text.includes('Pick up'),
    );
    const habitResults = results.filter(
      (r) =>
        r.text.includes('Run 3') ||
        r.text.includes('Meditate') ||
        r.text.includes('Drink more') ||
        r.text.includes('Stretch') ||
        r.text.includes('Read 10'),
    );

    // Test: All clear todos should be canonical "todo"
    todoResults.forEach((result) => {
      expect(result.canonicalKind).toBe('todo');
      expect(result.willShowChips).toBe(false);
      expect(result.finalActions).toContain('create.todo');
    });

    // Test: All clear habits should be canonical "habit"
    habitResults.forEach((result) => {
      expect(result.canonicalKind).toBe('habit');
      expect(result.willShowChips).toBe(false);
      expect(result.finalActions).toContain('create.habit');
    });

    // Test: Side hustle should be canonical "log", not ignore/meta
    const sideHustleResult = results.find((r) => r.text.includes('thinking about maybe starting'));
    expect(sideHustleResult).toBeDefined();
    expect(sideHustleResult!.canonicalKind).toBe('log');
    expect(sideHustleResult!.canonicalKind).not.toBe('ignore');
    expect(sideHustleResult!.canonicalKind).not.toBe('meta');
    expect(sideHustleResult!.willShowChips).toBe(false);
    expect(sideHustleResult!.finalActions).toContain('create.note');

    // Test: All log examples should be canonical "log"
    const logSamples = [
      'Today was stressful',
      'talked to Alex',
      'Brainstorming ideas',
      'Reflected on my week',
      'just thinking out loud',
    ];

    logSamples.forEach((snippet) => {
      const logResult = results.find((r) => r.text.includes(snippet));
      if (logResult) {
        expect(logResult.canonicalKind).toBe('log');
      }
    });

    // Test: No chips should be shown for clear logs
    const clearLogs = results.filter(
      (r) =>
        r.canonicalKind === 'log' &&
        (r.aiConfidence >= 60 || r.text.includes('side hustle') || r.text.includes('stressful')),
    );
    clearLogs.forEach((result) => {
      expect(result.willShowChips).toBe(false);
    });

    console.log('✅ All assertions passed!\n');
  });

  it('should handle reflection safety rule for "side hustle" case', () => {
    const text = 'Just thinking about maybe starting a side hustle someday';

    // Rule-based detection
    const ruleResult = detectIntent(text);

    // Mock AI (low confidence ignore or log)
    const aiResult = getMockedAI(text);
    const aiConfidence = aiResult.confidence / 100;

    // Canonical resolution
    const canonical = resolveCanonicalIntent({
      ruleKind: ruleResult.kind,
      ruleConfidence: ruleResult.confidence,
      aiCategory: aiResult.category,
      aiConfidence,
      text,
    });

    // Verify reflective log rule kicked in
    expect(canonical.type).toBe('log');
    expect(canonical.type).not.toBe('ignore');
    expect(canonical.suppressChips).toBe(false);
    expect(canonical.allowAutoCreate).toBe(true); // Auto-create reflective logs

    // Should not show chips for clear reflective log
    const willShowChips = shouldShowChips(
      canonical.type,
      canonical.confidence,
      canonical.allowAutoCreate,
      canonical.suppressChips,
    );
    expect(willShowChips).toBe(false);

    console.log('✅ Reflection safety test passed for "side hustle" example\n');
  });

  it('should auto-create high-confidence todos without chips', () => {
    const highConfidenceTodos = [
      'Buy milk tomorrow morning',
      'Email Sarah the proposal',
      'Pay electricity bill tonight',
    ];

    highConfidenceTodos.forEach((text) => {
      const ruleResult = detectIntent(text);
      const aiResult = getMockedAI(text);
      const aiConfidence = aiResult.confidence / 100;

      const canonical = resolveCanonicalIntent({
        ruleKind: ruleResult.kind,
        ruleConfidence: ruleResult.confidence,
        aiCategory: aiResult.category,
        aiConfidence,
        text,
      });

      expect(canonical.type).toBe('todo');
      expect(canonical.allowAutoCreate).toBe(true);
      expect(canonical.suppressChips).toBe(false);

      const willShowChips = shouldShowChips(
        canonical.type,
        canonical.confidence,
        canonical.allowAutoCreate,
        canonical.suppressChips,
      );
      expect(willShowChips).toBe(false);
    });

    console.log('✅ High-confidence todo auto-create test passed\n');
  });

  it('should auto-create high-confidence habits without chips', () => {
    const highConfidenceHabits = [
      'Run 3 times a week',
      'Meditate daily at 7am',
      'Read 10 pages every morning',
    ];

    highConfidenceHabits.forEach((text) => {
      const ruleResult = detectIntent(text);
      const aiResult = getMockedAI(text);
      const aiConfidence = aiResult.confidence / 100;

      const canonical = resolveCanonicalIntent({
        ruleKind: ruleResult.kind,
        ruleConfidence: ruleResult.confidence,
        aiCategory: aiResult.category,
        aiConfidence,
        text,
      });

      expect(canonical.type).toBe('habit');
      expect(canonical.allowAutoCreate).toBe(true);
      expect(canonical.suppressChips).toBe(false);

      const willShowChips = shouldShowChips(
        canonical.type,
        canonical.confidence,
        canonical.allowAutoCreate,
        canonical.suppressChips,
      );
      expect(willShowChips).toBe(false);
    });

    console.log('✅ High-confidence habit auto-create test passed\n');
  });
});
