#!/usr/bin/env npx tsx
/**
 * Classification Harness Runner
 *
 * Run: pnpm harness:classify
 * Or:  npx tsx scripts/runClassificationHarness.ts
 *
 * Options:
 *   --verbose     Show each test result
 *   --filter-tag  Only run tests with specific tag (can be repeated)
 *   --filter-id   Only run tests with specific ID (can be repeated)
 *   --output      Write failures.json to specified path
 */

import * as fs from 'fs';
import * as path from 'path';

// Import harness
import { runHarness, printSummary, type HarnessConfig } from '../src/qa/ClassificationHarness';
import type { GoldenTestCase } from '../src/qa/types';

// Parse command line args
function parseArgs(): { config: HarnessConfig; outputPath?: string } {
  const args = process.argv.slice(2);
  const config: HarnessConfig = {
    useApi: false,
    verbose: false,
    filterIds: [],
    filterTags: [],
  };
  let outputPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--verbose' || arg === '-v') {
      config.verbose = true;
    } else if (arg === '--filter-tag' && args[i + 1]) {
      config.filterTags!.push(args[++i]);
    } else if (arg === '--filter-id' && args[i + 1]) {
      config.filterIds!.push(args[++i]);
    } else if (arg === '--output' && args[i + 1]) {
      outputPath = args[++i];
    } else if (arg === '--api') {
      config.useApi = true;
    }
  }

  return { config, outputPath };
}

// Main
async function main() {
  console.log('🧪 Mind Drop Classification Harness\n');

  // Load golden dataset
  const goldenPath = path.join(__dirname, '../src/qa/classification_golden.json');
  
  if (!fs.existsSync(goldenPath)) {
    console.error(`❌ Golden dataset not found at: ${goldenPath}`);
    process.exit(1);
  }

  const goldenData = JSON.parse(fs.readFileSync(goldenPath, 'utf-8'));
  const testCases: GoldenTestCase[] = goldenData.test_cases;

  console.log(`📂 Loaded ${testCases.length} test cases from golden dataset`);

  // Parse args
  const { config, outputPath } = parseArgs();

  // Run harness
  const output = runHarness(testCases, config);

  // Print summary
  printSummary(output);

  // Write failures to file if requested or by default
  const failuresPath = outputPath ?? path.join(__dirname, '../src/qa/failures.json');
  
  if (output.failures.length > 0) {
    const failuresOutput = {
      run_id: output.run_id,
      run_at: output.run_at,
      summary: {
        total: output.summary.total,
        passed: output.summary.passed,
        failed: output.summary.failed,
        accuracy: output.summary.accuracy,
      },
      failures: output.failures.map((f) => ({
        id: f.testCase.id,
        raw_text: f.testCase.raw_text,
        description: f.testCase.description,
        expected_type: f.testCase.expected_type,
        expected_subtype: f.testCase.expected_subtype,
        actual_type: f.actual_type,
        actual_subtype: f.actual_subtype,
        actual_confidence: f.actual_confidence,
        heuristic_signals: f.heuristic_signals,
        mismatches: f.mismatches,
      })),
    };

    fs.writeFileSync(failuresPath, JSON.stringify(failuresOutput, null, 2));
    console.log(`📝 Failures written to: ${failuresPath}`);
  }

  // Exit with error code if failures
  if (output.failures.length > 0) {
    process.exit(1);
  }

  console.log('✅ All tests passed!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Harness error:', err);
  process.exit(1);
});
