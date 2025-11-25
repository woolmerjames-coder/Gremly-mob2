#!/usr/bin/env ts-node
/**
 * Test Mind Drop Classifier - Cloudflare Worker Integration
 *
 * Sends sacred examples to the deployed Cloudflare Worker classifier endpoint
 * and prints the classification results for manual verification.
 *
 * Usage:
 *   GREM_WORKER_URL=https://gentle-thunder-5854.woolmerjames.workers.dev npx ts-node scripts/test-minddrop-classifier.ts
 *
 * Expected Results:
 *   - Todos → bucket: todo
 *   - Habits → bucket: habit
 *   - Emotional content → bucket: log, subtype: journal
 *   - Ideas → bucket: log, subtype: idea
 *   - Reference notes → bucket: log, subtype: general
 *   - Junk → bucket: unsorted (rare)
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
  expected?: string; // Optional expected result for verification
}

const EXAMPLES: Example[] = [
  // TODOS
  { label: 'todo-1', text: 'Email Sarah about project timeline', expected: 'todo' },
  { label: 'todo-2', text: 'Buy milk and eggs', expected: 'todo' },
  { label: 'todo-3', text: 'Schedule dentist appointment', expected: 'todo' },
  { label: 'todo-4', text: 'Call mom tomorrow at 3pm', expected: 'todo' },

  // HABITS
  { label: 'habit-1', text: 'Meditate every morning', expected: 'habit' },
  { label: 'habit-2', text: 'Run 3x per week', expected: 'habit' },
  { label: 'habit-3', text: 'Quit smoking', expected: 'habit' },
  { label: 'habit-4', text: 'Track mood daily', expected: 'habit' },

  // JOURNAL (emotional/reflective)
  { label: 'journal-1', text: 'Feeling overwhelmed about work', expected: 'log-journal' },
  { label: 'journal-2', text: "I'm so grateful for today", expected: 'log-journal' },
  {
    label: 'journal-3',
    text: "Can't stop thinking about that conversation",
    expected: 'log-journal',
  },
  { label: 'journal-4', text: 'Really proud of myself', expected: 'log-journal' },

  // IDEAS (creative/hypothetical)
  { label: 'idea-1', text: 'App idea: mood tracking for pets', expected: 'log-idea' },
  { label: 'idea-2', text: 'What if we added voice notes?', expected: 'log-idea' },
  { label: 'idea-3', text: 'Feature idea: dark mode', expected: 'log-idea' },
  { label: 'idea-4', text: 'Maybe we should pivot to B2B', expected: 'log-idea' },

  // LOG - GENERAL (reference/info)
  { label: 'log-general-1', text: 'Wifi password: Guest2024', expected: 'log-general' },
  { label: 'log-general-2', text: 'Meeting notes: discussed Q3 goals', expected: 'log-general' },
  { label: 'log-general-3', text: "Sarah mentioned she's vegetarian", expected: 'log-general' },
  { label: 'log-general-4', text: 'API key: sk-1234567', expected: 'log-general' },

  // UNSORTED (gibberish)
  { label: 'unsorted-1', text: 'asdfghjkl', expected: 'unsorted' },
  { label: 'unsorted-2', text: '.....', expected: 'unsorted' },
  { label: 'unsorted-3', text: 'xxxxxxxxxx', expected: 'unsorted' },
  { label: 'unsorted-4', text: 'test test test', expected: 'unsorted' },
];

/**
 * Classify a single example using the Cloudflare Worker endpoint
 */
async function classifyExample(url: string, example: Example): Promise<Classification | null> {
  const body: ClassifyRequest = {
    type: 'classify',
    model: 'gpt-4o-mini',
    text: example.text,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(`❌ HTTP ${response.status} for ${example.label}`);
      return null;
    }

    const result = (await response.json()) as ClassifyResponse;
    return result.classification;
  } catch (error) {
    console.error(`❌ Request failed for ${example.label}:`, error);
    return null;
  }
}

/**
 * Format classification result as concise line
 */
function formatResult(example: Example, result: Classification | null): string {
  if (!result) {
    return `${example.label.padEnd(18)} | ERROR`;
  }

  const bucket = result.bucket || 'unknown';
  const type = result.type || 'unknown';
  const subtype = result.subtype || null;
  const confidence = (result.confidence / 100)?.toFixed(2) || '0.00';

  // Truncate text to 40 chars
  const text = example.text.length > 40 ? example.text.slice(0, 37) + '...' : example.text;

  // Use bucket as-is (worker already returns combined format like "log-journal")
  const category = bucket;

  // Check if matches expected
  const matches = example.expected ? category === example.expected : true;
  const indicator = matches ? '✓' : '✗';

  return `${indicator} ${example.label.padEnd(18)} | ${text.padEnd(42)} | ${category.padEnd(15)} | conf=${confidence}`;
}

/**
 * Main test runner
 */
async function main() {
  const workerUrl = process.env.GREM_WORKER_URL;

  if (!workerUrl) {
    console.error('❌ Error: GREM_WORKER_URL environment variable is required');
    console.error('');
    console.error('Usage:');
    console.error(
      '  GREM_WORKER_URL=https://your-worker.workers.dev npx ts-node scripts/test-minddrop-classifier.ts',
    );
    process.exit(1);
  }

  console.log('🔍 Testing Mind Drop Classifier');
  console.log(`📡 Endpoint: ${workerUrl}`);
  console.log(`📊 Examples: ${EXAMPLES.length}`);
  console.log('');
  console.log('─'.repeat(100));
  console.log(
    `   ${'Label'.padEnd(18)} | ${'Text'.padEnd(42)} | ${'Category'.padEnd(15)} | Confidence`,
  );
  console.log('─'.repeat(100));

  let successCount = 0;
  let failCount = 0;
  let matchCount = 0;

  for (const example of EXAMPLES) {
    const result = await classifyExample(workerUrl, example);
    const formatted = formatResult(example, result);
    console.log(formatted);

    if (result) {
      successCount++;
      const category =
        result.subtype && result.subtype !== '-'
          ? `${result.bucket}/${result.subtype}`
          : result.bucket;
      if (example.expected && category === example.expected) {
        matchCount++;
      }
    } else {
      failCount++;
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log('─'.repeat(100));
  console.log('');
  console.log('📈 Results Summary:');
  console.log(`   ✅ Success: ${successCount}/${EXAMPLES.length}`);
  console.log(`   ❌ Failed:  ${failCount}/${EXAMPLES.length}`);
  console.log(`   🎯 Matched: ${matchCount}/${EXAMPLES.length} (expected category)`);
  console.log('');

  if (failCount > 0) {
    console.log('⚠️  Some requests failed. Check network or endpoint URL.');
    process.exit(1);
  }

  if (matchCount < EXAMPLES.length) {
    console.log('⚠️  Some results did not match expected categories.');
    console.log('    Review the output above to verify classifier behavior.');
  } else {
    console.log('✨ All classifications matched expected results!');
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}
