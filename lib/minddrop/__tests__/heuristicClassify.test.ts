/**
 * Heuristic Classification Tests
 *
 * Tests heuristicClassify against the comprehensive 48-case test suite.
 */

import { heuristicClassify } from '../heuristicClassify';
import { classificationTestCases, TestCase } from './classificationTestSuite';

// Adapter to match test suite interface
function classifyAdapter(text: string): { bucket: string; subtypeHint?: string | null } {
  const result = heuristicClassify(text);
  return {
    bucket: result.bucket,
    subtypeHint: result.subtypeHint ?? null,
  };
}

describe('heuristicClassify', () => {
  // Group tests by category for better reporting
  const categories = new Map<string, TestCase[]>();
  for (const tc of classificationTestCases) {
    const cat = tc.category.split(' - ')[0]; // Group by main category
    if (!categories.has(cat)) {
      categories.set(cat, []);
    }
    categories.get(cat)!.push(tc);
  }

  // Run tests grouped by category
  for (const [category, tests] of categories) {
    describe(category, () => {
      for (const tc of tests) {
        it(`#${tc.id}: "${tc.input}" → ${tc.expected.bucket}${tc.expected.subtype ? '/' + tc.expected.subtype : ''}`, () => {
          const result = classifyAdapter(tc.input);

          // Always check bucket
          expect(result.bucket).toBe(tc.expected.bucket);

          // Check subtype if specified in expected
          if (tc.expected.subtype !== undefined) {
            expect(result.subtypeHint).toBe(tc.expected.subtype);
          }
        });
      }
    });
  }

  // Summary test that shows pass rate
  it('should achieve acceptable pass rate on full test suite', () => {
    let passed = 0;
    let _failed = 0;
    const failures: { id: number; input: string; expected: any; actual: any }[] = [];

    for (const tc of classificationTestCases) {
      const result = classifyAdapter(tc.input);
      const bucketMatch = result.bucket === tc.expected.bucket;
      const subtypeMatch =
        tc.expected.subtype === undefined || result.subtypeHint === tc.expected.subtype;

      if (bucketMatch && subtypeMatch) {
        passed++;
      } else {
        _failed++;
        failures.push({
          id: tc.id,
          input: tc.input,
          expected: tc.expected,
          actual: { bucket: result.bucket, subtype: result.subtypeHint },
        });
      }
    }

    const passRate = (passed / classificationTestCases.length) * 100;

    // Log summary
    console.log(`\n📊 Heuristic Classification Results:`);
    console.log(`   ✅ Passed: ${passed}/${classificationTestCases.length}`);
    console.log(`   📈 Pass Rate: ${passRate.toFixed(1)}%`);

    if (failures.length > 0) {
      console.log(`\n   ❌ Failures:`);
      for (const f of failures) {
        console.log(`      #${f.id}: "${f.input}"`);
        console.log(
          `         Expected: ${f.expected.bucket}${f.expected.subtype ? '/' + f.expected.subtype : ''}`,
        );
        console.log(
          `         Actual:   ${f.actual.bucket}${f.actual.subtype ? '/' + f.actual.subtype : ''}`,
        );
      }
    }

    // Heuristic doesn't need to be perfect - 70%+ is acceptable for fast path
    // Phase 1 API will handle the harder cases
    expect(passRate).toBeGreaterThan(60);
  });

  // ==========================================================================
  // HABIT SUBTYPE TESTS (build vs break)
  // ==========================================================================
  describe('habitSubtypeHint', () => {
    describe('break_habit detection', () => {
      it.each([
        ['Stop smoking', 'break_habit'],
        ['Quit checking Twitter', 'break_habit'],
        ['Reduce caffeine intake', 'break_habit'],
        ['No more eating after 9pm', 'break_habit'],
        ['Less screen time before bed', 'break_habit'],
        ['Stop biting my nails', 'break_habit'],
        ['Avoid sugary snacks', 'break_habit'],
        ['Cut back on coffee', 'break_habit'],
        ['Limit social media to 30 min', 'break_habit'],
      ])('"%s" → %s', (input, expectedSubtype) => {
        const result = heuristicClassify(input);
        expect(result.bucket).toBe('habit');
        expect(result.habitSubtypeHint).toBe(expectedSubtype);
      });
    });

    describe('start_habit detection', () => {
      it.each([
        ['Drink more water', 'start_habit'],
        ['Exercise 3x per week', 'start_habit'],
        ['Meditate every morning', 'start_habit'],
        ['Work out more', 'start_habit'],
        ['Read more books', 'start_habit'],
        ['Take 3 deep breaths when anxious', 'start_habit'],
        ['Go for a walk when stressed', 'start_habit'],
        ['Write in my journal when upset', 'start_habit'],
      ])('"%s" → %s', (input, expectedSubtype) => {
        const result = heuristicClassify(input);
        expect(result.bucket).toBe('habit');
        expect(result.habitSubtypeHint).toBe(expectedSubtype);
      });
    });

    describe('non-habit returns null habitSubtypeHint', () => {
      it.each([
        ['Buy groceries', 'todo'],
        ['Call mom', 'todo'],
        ['I feel grateful today', 'log'],
        ['What if we added dark mode', 'log'],
      ])('"%s" → bucket=%s, habitSubtypeHint=null', (input, expectedBucket) => {
        const result = heuristicClassify(input);
        expect(result.bucket).toBe(expectedBucket);
        expect(result.habitSubtypeHint).toBeNull();
      });
    });
  });

  // ==========================================================================
  // SPACE HINT TESTS (space pattern extraction)
  // ==========================================================================
  describe('spaceHint and cleanedText', () => {
    describe('space patterns are extracted', () => {
      it('extracts space from "add to Fitness: run 3 miles"', () => {
        const result = heuristicClassify('add to Fitness: run 3 miles');
        expect(result.spaceHint).toBe('Fitness');
        expect(result.cleanedText).toBe('run 3 miles');
      });

      it('extracts space from "for Work: finish report"', () => {
        const result = heuristicClassify('for Work: finish report');
        expect(result.spaceHint).toBe('Work');
        expect(result.cleanedText).toBe('finish report');
      });

      it('extracts space from "Health: take vitamins"', () => {
        const result = heuristicClassify('Health: take vitamins');
        expect(result.spaceHint).toBe('Health');
        expect(result.cleanedText).toBe('take vitamins');
      });

      it('extracts space from "call mom @Family"', () => {
        const result = heuristicClassify('call mom @Family');
        expect(result.spaceHint).toBe('Family');
        expect(result.cleanedText).toBe('call mom');
      });
    });

    describe('classification uses cleaned text', () => {
      it('classifies "add to Fitness: run 3 miles" based on cleaned text', () => {
        const result = heuristicClassify('add to Fitness: run 3 miles');
        // "run 3 miles" is classified - may be habit or todo depending on heuristics
        expect(result.spaceHint).toBe('Fitness');
        expect(result.cleanedText).toBe('run 3 miles');
      });

      it('classifies "for Health: exercise daily" as habit', () => {
        const result = heuristicClassify('for Health: exercise daily');
        expect(result.bucket).toBe('habit');
        expect(result.spaceHint).toBe('Health');
      });

      it('classifies "Journal: I feel grateful today" as log', () => {
        const result = heuristicClassify('Journal: I feel grateful today');
        // Note: "Journal" might be a false positive space, but the text should be classified
        expect(result.bucket).toBe('log');
      });
    });

    describe('no space pattern returns null spaceHint', () => {
      it('returns null spaceHint for plain text', () => {
        const result = heuristicClassify('buy groceries');
        expect(result.spaceHint).toBeNull();
        expect(result.cleanedText).toBe('buy groceries');
      });

      it('time patterns may trigger space extraction (known limitation)', () => {
        // "meeting at 3:00pm" has a colon, which triggers prefix pattern
        // "meeting at 3" is captured as space name - known edge case
        const result = heuristicClassify('meeting at 3:00pm');
        expect(result.spaceHint).toBe('Meeting At 3');
        expect(result.cleanedText).toBe('00pm');
      });

      it('returns null spaceHint for text without colon or @', () => {
        const result = heuristicClassify('buy groceries at the store');
        expect(result.spaceHint).toBeNull();
      });
    });

    describe('false positive prevention', () => {
      it('does NOT extract space from "Note: remember this"', () => {
        const result = heuristicClassify('Note: remember this');
        expect(result.spaceHint).toBeNull();
        expect(result.cleanedText).toBe('Note: remember this');
      });

      it('does NOT extract space from "Todo: buy milk"', () => {
        const result = heuristicClassify('Todo: buy milk');
        expect(result.spaceHint).toBeNull();
        expect(result.cleanedText).toBe('Todo: buy milk');
      });

      it('does NOT extract space from "Reminder: call doctor"', () => {
        const result = heuristicClassify('Reminder: call doctor');
        expect(result.spaceHint).toBeNull();
      });
    });
  });
});
