/**
 * ClassificationHarness
 *
 * Core harness logic for running classification tests against the golden dataset.
 * Importable for use in scripts or tests.
 */

import { heuristicClassify } from '../../lib/minddrop/heuristicClassify';
import type { GoldenTestCase, TestCaseResult, HarnessSummary, HarnessOutput, FieldMismatch } from './types';
import type { MindDropBucket, LogSubtype } from '../../lib/minddrop/types';

/**
 * Configuration for harness run
 */
export interface HarnessConfig {
  /** Whether to call the API (false = heuristic only) */
  useApi?: boolean;
  /** API timeout in ms */
  apiTimeoutMs?: number;
  /** Filter to specific test IDs */
  filterIds?: string[];
  /** Filter to specific tags */
  filterTags?: string[];
  /** Verbose logging */
  verbose?: boolean;
}

const DEFAULT_CONFIG: Required<HarnessConfig> = {
  useApi: false,
  apiTimeoutMs: 2000,
  filterIds: [],
  filterTags: [],
  verbose: false,
};

/**
 * Run a single test case through the heuristic classifier
 */
export function runSingleTest(testCase: GoldenTestCase, config: HarnessConfig = {}): TestCaseResult {
  const startTime = Date.now();
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Run heuristic classification
  const heuristic = heuristicClassify(testCase.raw_text, { hasAttachments: false });

  const actual_type = heuristic.bucket;
  const actual_subtype = heuristic.subtypeHint;
  const actual_confidence = heuristic.confidence;
  const heuristic_signals = heuristic.signals;

  // Check for mismatches
  const mismatches: FieldMismatch[] = [];

  if (actual_type !== testCase.expected_type) {
    mismatches.push({
      field: 'type',
      expected: testCase.expected_type,
      actual: actual_type,
    });
  }

  // Only check subtype for log bucket
  if (testCase.expected_type === 'log' && actual_type === 'log') {
    if (actual_subtype !== testCase.expected_subtype) {
      mismatches.push({
        field: 'subtype',
        expected: testCase.expected_subtype,
        actual: actual_subtype,
      });
    }
  }

  const passed = mismatches.length === 0;
  const execution_time_ms = Date.now() - startTime;

  if (cfg.verbose) {
    const status = passed ? '✅' : '❌';
    console.log(`${status} ${testCase.id}: ${testCase.raw_text.slice(0, 40)}...`);
    if (!passed) {
      mismatches.forEach((m) => {
        console.log(`   ${m.field}: expected=${m.expected}, actual=${m.actual}`);
      });
    }
  }

  return {
    testCase,
    passed,
    actual_type,
    actual_subtype,
    actual_confidence,
    actual_source: 'heuristic',
    heuristic_signals,
    execution_time_ms,
    mismatches,
  };
}

/**
 * Generate summary statistics from test results
 */
export function generateSummary(results: TestCaseResult[]): HarnessSummary {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  const accuracy = total > 0 ? (passed / total) * 100 : 0;

  // Per-type accuracy
  const buckets: MindDropBucket[] = ['todo', 'habit', 'log'];
  const accuracy_by_type: HarnessSummary['accuracy_by_type'] = {} as HarnessSummary['accuracy_by_type'];

  for (const bucket of buckets) {
    const bucketResults = results.filter((r) => r.testCase.expected_type === bucket);
    const bucketCorrect = bucketResults.filter((r) => r.actual_type === bucket).length;
    accuracy_by_type[bucket] = {
      total: bucketResults.length,
      correct: bucketCorrect,
      accuracy: bucketResults.length > 0 ? (bucketCorrect / bucketResults.length) * 100 : 0,
    };
  }

  // Confusion matrix: confusion_matrix[actual][expected] = count
  const confusion_matrix: HarnessSummary['confusion_matrix'] = {
    todo: { todo: 0, habit: 0, log: 0 },
    habit: { todo: 0, habit: 0, log: 0 },
    log: { todo: 0, habit: 0, log: 0 },
  };

  for (const result of results) {
    const actual = result.actual_type;
    const expected = result.testCase.expected_type;
    confusion_matrix[actual][expected]++;
  }

  const total_time_ms = results.reduce((sum, r) => sum + r.execution_time_ms, 0);

  return {
    total,
    passed,
    failed,
    accuracy,
    accuracy_by_type,
    confusion_matrix,
    total_time_ms,
  };
}

/**
 * Filter test cases based on config
 */
export function filterTestCases(testCases: GoldenTestCase[], config: HarnessConfig): GoldenTestCase[] {
  let filtered = testCases;

  if (config.filterIds && config.filterIds.length > 0) {
    filtered = filtered.filter((tc) => config.filterIds!.includes(tc.id));
  }

  if (config.filterTags && config.filterTags.length > 0) {
    filtered = filtered.filter((tc) => tc.tags?.some((t) => config.filterTags!.includes(t)));
  }

  return filtered;
}

/**
 * Run the full harness against a dataset
 */
export function runHarness(testCases: GoldenTestCase[], config: HarnessConfig = {}): HarnessOutput {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const run_id = `harness-${Date.now()}`;
  const run_at = new Date().toISOString();

  // Filter test cases
  const filteredCases = filterTestCases(testCases, cfg);

  if (cfg.verbose) {
    console.log(`\n🧪 Running classification harness`);
    console.log(`   Total cases: ${filteredCases.length}`);
    console.log(`   Mode: ${cfg.useApi ? 'API + Heuristic' : 'Heuristic only'}\n`);
  }

  // Run all tests
  const results: TestCaseResult[] = [];
  for (const testCase of filteredCases) {
    const result = runSingleTest(testCase, cfg);
    results.push(result);
  }

  // Generate summary
  const summary = generateSummary(results);

  // Extract failures
  const failures = results.filter((r) => !r.passed);

  return {
    run_id,
    run_at,
    summary,
    results,
    failures,
  };
}

/**
 * Print summary to console
 */
export function printSummary(output: HarnessOutput): void {
  const { summary } = output;

  console.log('\n' + '='.repeat(60));
  console.log('CLASSIFICATION HARNESS RESULTS');
  console.log('='.repeat(60));

  console.log(`\n📊 Overall: ${summary.passed}/${summary.total} passed (${summary.accuracy.toFixed(1)}%)`);
  console.log(`   Time: ${summary.total_time_ms}ms\n`);

  console.log('📈 Per-Type Accuracy:');
  for (const [bucket, stats] of Object.entries(summary.accuracy_by_type)) {
    const bar = '█'.repeat(Math.round(stats.accuracy / 5)) + '░'.repeat(20 - Math.round(stats.accuracy / 5));
    console.log(`   ${bucket.padEnd(6)}: ${bar} ${stats.accuracy.toFixed(1)}% (${stats.correct}/${stats.total})`);
  }

  console.log('\n📉 Confusion Matrix (rows=actual, cols=expected):');
  console.log('          todo  habit  log');
  for (const [actual, row] of Object.entries(summary.confusion_matrix)) {
    console.log(`   ${actual.padEnd(6)}: ${String(row.todo).padStart(4)}  ${String(row.habit).padStart(5)}  ${String(row.log).padStart(3)}`);
  }

  if (output.failures.length > 0) {
    console.log(`\n❌ Failures (${output.failures.length}):`);
    for (const failure of output.failures.slice(0, 10)) {
      console.log(`   • ${failure.testCase.id}: "${failure.testCase.raw_text.slice(0, 40)}..."`);
      console.log(`     Expected: ${failure.testCase.expected_type}/${failure.testCase.expected_subtype ?? '-'}`);
      console.log(`     Actual:   ${failure.actual_type}/${failure.actual_subtype ?? '-'}`);
      console.log(`     Signals:  [${failure.heuristic_signals.join(', ')}]`);
    }
    if (output.failures.length > 10) {
      console.log(`   ... and ${output.failures.length - 10} more`);
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
}
