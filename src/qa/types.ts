/**
 * QA Harness Types
 *
 * Shared types for classification testing and validation.
 */

import type { MindDropBucket, LogSubtype } from '../../lib/minddrop/types';

/**
 * A single golden test case for classification validation
 */
export interface GoldenTestCase {
  /** Unique identifier for the test case */
  id: string;

  /** The raw text input to classify */
  raw_text: string;

  /** Expected classification bucket */
  expected_type: MindDropBucket;

  /** Expected subtype (only for log bucket) */
  expected_subtype: LogSubtype | null;

  /** Expected has_list flag */
  expected_has_list?: boolean;

  /** Expected list_items_count if has_list is true */
  expected_list_items_count?: number;

  /** Expected due_date extraction (ISO date string, e.g. "2025-12-15") */
  expected_due_date?: string | null;

  /** Description of what this test case validates */
  description?: string;

  /** Tags for filtering tests (e.g. "edge-case", "date-parsing", "list") */
  tags?: string[];
}

/**
 * Result from running a single test case
 */
export interface TestCaseResult {
  /** The test case that was run */
  testCase: GoldenTestCase;

  /** Whether the test passed */
  passed: boolean;

  /** Actual classification bucket */
  actual_type: MindDropBucket;

  /** Actual subtype */
  actual_subtype: LogSubtype | null;

  /** Confidence score from classifier */
  actual_confidence: number;

  /** Source of classification (heuristic, api, etc) */
  actual_source: string;

  /** Heuristic signals that fired */
  heuristic_signals: string[];

  /** Raw API response if available */
  api_response?: unknown;

  /** Execution time in ms */
  execution_time_ms: number;

  /** Specific field mismatches */
  mismatches: FieldMismatch[];
}

/**
 * A specific field that didn't match expected value
 */
export interface FieldMismatch {
  field: string;
  expected: unknown;
  actual: unknown;
}

/**
 * Summary statistics from harness run
 */
export interface HarnessSummary {
  /** Total test cases run */
  total: number;

  /** Number of passing tests */
  passed: number;

  /** Number of failing tests */
  failed: number;

  /** Accuracy percentage */
  accuracy: number;

  /** Per-bucket accuracy */
  accuracy_by_type: Record<MindDropBucket, { total: number; correct: number; accuracy: number }>;

  /** Confusion matrix: actual[expected] = count */
  confusion_matrix: Record<MindDropBucket, Record<MindDropBucket, number>>;

  /** Execution time in ms */
  total_time_ms: number;
}

/**
 * Full harness run output
 */
export interface HarnessOutput {
  /** Run metadata */
  run_id: string;
  run_at: string;

  /** Summary statistics */
  summary: HarnessSummary;

  /** All test results */
  results: TestCaseResult[];

  /** Failed test cases only */
  failures: TestCaseResult[];
}

/**
 * Classification trace for observability
 */
export interface ClassificationTrace {
  /** Unique trace ID */
  trace_id: string;

  /** Input text */
  input_text: string;

  /** Heuristic classification result */
  heuristic: {
    bucket: MindDropBucket;
    subtype_hint: LogSubtype | null;
    confidence: number;
    signals: string[];
  };

  /** API classification result (if called) */
  api?: {
    bucket: MindDropBucket;
    subtype: LogSubtype | null;
    confidence: number;
    raw_response: unknown;
    latency_ms: number;
  };

  /** Final classification */
  final: {
    bucket: MindDropBucket;
    subtype: LogSubtype | null;
    confidence: number;
    source: string;
  };

  /** Timestamps */
  started_at: string;
  completed_at: string;
}
