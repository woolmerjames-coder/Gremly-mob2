/**
 * Mind Drop Classifier - Cloudflare Worker Integration Tests
 *
 * ⚠️ IMPORTANT: This test suite is SKIPPED by default for CI/CD pipelines.
 *
 * PURPOSE:
 *   This file contains optional integration tests for the deployed Cloudflare Worker
 *   classifier endpoint using sacred examples. It's meant for manual validation
 *   against the live worker, not for automated test runs.
 *
 * WHY SKIPPED:
 *   - Requires network access to deployed worker (not available in CI)
 *   - Requires fetch support (Node 18+ or polyfill)
 *   - Tests external service, not internal app logic
 *
 * FOR DAY-TO-DAY TESTING:
 *   We rely on:
 *   - lib/cortex/intents/__tests__/masterClassifierSpec.test.ts (149 tests)
 *   - scripts/test-minddrop-classifier.ts (sacred 24 examples, run manually)
 *   - Intent-level tests (classifyIntentWithAI, canonicalIntent)
 *
 * TO RUN THIS TEST MANUALLY:
 *   1. Ensure your worker is deployed
 *   2. Set GREM_WORKER_URL environment variable
 *   3. Remove the .skip from describe.skip below
 *   4. Run: GREM_WORKER_URL=https://your-worker.workers.dev npm test tests/minddropClassifier.worker.test.ts
 *
 * ALTERNATIVE:
 *   Use the standalone script for manual testing:
 *   GREM_WORKER_URL=... npx ts-node scripts/test-minddrop-classifier.ts
 */

interface ClassifyRequest {
  type: 'classify';
  model: string;
  text: string;
}

interface Classification {
  bucket: string;
  type: string;
  subtype?: string | null;
  title: string;
  confidence: number;
}

interface ClassifyResponse {
  id: string;
  classification: Classification;
  aiTitle: string;
  aiTagsDebug?: string[];
}

interface Example {
  label: string;
  text: string;
}

const EXAMPLES: Example[] = [
  // TODOS
  { label: 'todo-1', text: 'Email Sarah about project timeline' },
  { label: 'todo-2', text: 'Buy milk and eggs' },
  { label: 'todo-3', text: 'Schedule dentist appointment' },
  { label: 'todo-4', text: 'Call mom tomorrow at 3pm' },

  // HABITS
  { label: 'habit-1', text: 'Meditate every morning' },
  { label: 'habit-2', text: 'Run 3x per week' },
  { label: 'habit-3', text: 'Quit smoking' },
  { label: 'habit-4', text: 'Track mood daily' },

  // JOURNAL (emotional/reflective)
  { label: 'journal-1', text: 'Feeling overwhelmed about work' },
  { label: 'journal-2', text: "I'm so grateful for today" },
  { label: 'journal-3', text: "Can't stop thinking about that conversation" },
  { label: 'journal-4', text: 'Really proud of myself' },

  // IDEAS (creative/hypothetical)
  { label: 'idea-1', text: 'App idea: mood tracking for pets' },
  { label: 'idea-2', text: 'What if we added voice notes?' },
  { label: 'idea-3', text: 'Feature idea: dark mode' },
  { label: 'idea-4', text: 'Maybe we should pivot to B2B' },

  // LOG - GENERAL (reference/info)
  { label: 'log-general-1', text: 'Wifi password: Guest2024' },
  { label: 'log-general-2', text: 'Meeting notes: discussed Q3 goals' },
  { label: 'log-general-3', text: "Sarah mentioned she's vegetarian" },
  { label: 'log-general-4', text: 'API key: sk-1234567' },

  // UNSORTED (gibberish)
  { label: 'unsorted-1', text: 'asdfghjkl' },
  { label: 'unsorted-2', text: '.....' },
  { label: 'unsorted-3', text: 'xxxxxxxxxx' },
  { label: 'unsorted-4', text: 'test test test' },
];

const EXPECTED: Record<string, string> = {
  // Todos
  'todo-1': 'todo',
  'todo-2': 'todo',
  'todo-3': 'todo',
  'todo-4': 'todo',

  // Habits
  'habit-1': 'habit',
  'habit-2': 'habit',
  'habit-3': 'habit',
  'habit-4': 'habit',

  // Journal
  'journal-1': 'log',
  'journal-2': 'log',
  'journal-3': 'log',
  'journal-4': 'log',

  // Ideas
  'idea-1': 'log',
  'idea-2': 'log',
  'idea-3': 'log',
  'idea-4': 'log',

  // General logs
  'log-general-1': 'log',
  'log-general-2': 'log',
  'log-general-3': 'log',
  'log-general-4': 'log',

  // Unsorted
  'unsorted-1': 'unsorted',
  'unsorted-2': 'unsorted',
  'unsorted-3': 'unsorted',
  'unsorted-4': 'unsorted',
};

// Expected subtypes for log entries (for more granular verification)
const EXPECTED_SUBTYPES: Record<string, string> = {
  'journal-1': 'journal',
  'journal-2': 'journal',
  'journal-3': 'journal',
  'journal-4': 'journal',
  'idea-1': 'idea',
  'idea-2': 'idea',
  'idea-3': 'idea',
  'idea-4': 'idea',
  'log-general-1': 'general',
  'log-general-2': 'general',
  'log-general-3': 'general',
  'log-general-4': 'general',
};

/**
 * Classify a single example using the Cloudflare Worker endpoint
 */
async function classifyExample(url: string, text: string): Promise<Classification> {
  const body: ClassifyRequest = {
    type: 'classify',
    model: 'gpt-4o-mini',
    text,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const result = (await response.json()) as ClassifyResponse;
  return result.classification;
}

describe.skip('Mind Drop Classifier - Cloudflare Worker', () => {
  const workerUrl = process.env.GREM_WORKER_URL;

  beforeAll(() => {
    if (!workerUrl) {
      throw new Error(
        'GREM_WORKER_URL environment variable is required. Set it to your deployed worker URL.',
      );
    }

    // Check if fetch is available
    if (typeof fetch === 'undefined') {
      throw new Error(
        'fetch is not available. Run with Node 18+ or use the standalone script: ' +
          'GREM_WORKER_URL=... npx ts-node scripts/test-minddrop-classifier.ts',
      );
    }
  });

  it('should classify all sacred examples correctly', async () => {
    expect(workerUrl).toBeDefined();

    const results: { label: string; bucket: string; subtype?: string; confidence: number }[] = [];

    // Classify all examples
    for (const example of EXAMPLES) {
      const result = await classifyExample(workerUrl!, example.text);

      results.push({
        label: example.label,
        bucket: result.bucket,
        subtype: result.subtype || undefined,
        confidence: result.confidence / 100, // Normalize from 0-100 to 0-1
      });

      // Assert bucket matches expected
      const expectedBucket = EXPECTED[example.label];
      expect(result.bucket).toBe(expectedBucket);

      // If it's a log, also verify the subtype
      if (expectedBucket === 'log' && EXPECTED_SUBTYPES[example.label]) {
        const expectedSubtype = EXPECTED_SUBTYPES[example.label];
        expect(result.subtype).toBe(expectedSubtype);
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Log summary for visibility
    console.log('\n📊 Classification Results Summary:');
    console.log('─'.repeat(80));
    results.forEach((r) => {
      const category = r.subtype ? `${r.bucket}/${r.subtype}` : r.bucket;
      console.log(
        `${r.label.padEnd(20)} | ${category.padEnd(20)} | conf=${r.confidence.toFixed(2)}`,
      );
    });
    console.log('─'.repeat(80));
  }, 60000); // 60 second timeout for network requests

  it('should return valid confidence scores', async () => {
    expect(workerUrl).toBeDefined();

    // Test a few examples for confidence score validation
    const testExamples = [
      { label: 'todo-1', text: 'Email Sarah about project timeline' },
      { label: 'habit-1', text: 'Meditate every morning' },
      { label: 'journal-1', text: 'Feeling overwhelmed about work' },
    ];

    for (const example of testExamples) {
      const result = await classifyExample(workerUrl!, example.text);
      const normalizedConfidence = result.confidence / 100;

      // Confidence should be between 0 and 1
      expect(normalizedConfidence).toBeGreaterThanOrEqual(0);
      expect(normalizedConfidence).toBeLessThanOrEqual(1);

      // High-confidence examples should have confidence > 0.5
      if (example.label.startsWith('todo-') || example.label.startsWith('habit-')) {
        expect(normalizedConfidence).toBeGreaterThan(0.5);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }, 30000);
});
