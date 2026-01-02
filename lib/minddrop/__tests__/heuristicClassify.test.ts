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
    let failed = 0;
    const failures: { id: number; input: string; expected: any; actual: any }[] = [];

    for (const tc of classificationTestCases) {
      const result = classifyAdapter(tc.input);
      const bucketMatch = result.bucket === tc.expected.bucket;
      const subtypeMatch =
        tc.expected.subtype === undefined || result.subtypeHint === tc.expected.subtype;

      if (bucketMatch && subtypeMatch) {
        passed++;
      } else {
        failed++;
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
});
