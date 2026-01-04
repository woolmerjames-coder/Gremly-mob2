/**
 * Classification Test Suite
 *
 * 40 edge cases covering nuanced classification scenarios.
 * Run these against both heuristic and Phase 1 API to validate behavior.
 */

export interface TestCase {
  id: number;
  input: string;
  expected: {
    bucket: 'todo' | 'habit' | 'log';
    subtype?: 'journal' | 'idea' | 'general' | null;
  };
  category: string;
  rationale: string;
}

export const classificationTestCases: TestCase[] = [
  // ===========================================================================
  // CATEGORY: Clear TODOs (discrete, completable actions)
  // ===========================================================================
  {
    id: 1,
    input: 'Create a budget for January',
    expected: { bucket: 'todo', subtype: null },
    category: 'Clear TODO',
    rationale: "Action verb 'create' + discrete deliverable (a budget)",
  },
  {
    id: 2,
    input: 'Figure out what to get Sarah for her birthday',
    expected: { bucket: 'todo', subtype: null },
    category: 'Clear TODO',
    rationale: "'Figure out' implies a decision to make, completable",
  },
  {
    id: 3,
    input: 'Plan the quarterly review presentation',
    expected: { bucket: 'todo', subtype: null },
    category: 'Clear TODO',
    rationale: 'Planning verb with discrete deliverable',
  },
  {
    id: 4,
    input: 'Decide on a new phone plan',
    expected: { bucket: 'todo', subtype: null },
    category: 'Clear TODO',
    rationale: 'Decision task, completable once decided',
  },
  {
    id: 5,
    input: 'Organize my closet this weekend',
    expected: { bucket: 'todo', subtype: null },
    category: 'Clear TODO',
    rationale: 'One-time task with time reference',
  },
  {
    id: 6,
    input: 'Book flights for vacation',
    expected: { bucket: 'todo', subtype: null },
    category: 'Clear TODO',
    rationale: 'Clear action verb, discrete task',
  },
  {
    id: 7,
    input: 'Research gyms near me',
    expected: { bucket: 'todo', subtype: null },
    category: 'Clear TODO',
    rationale: 'Research task, completable',
  },

  // ===========================================================================
  // CATEGORY: Clear HABITs (trackable recurring behaviors)
  // ===========================================================================
  {
    id: 8,
    input: 'Stop smoking',
    expected: { bucket: 'habit', subtype: null },
    category: 'Clear HABIT',
    rationale: 'Concrete trackable behavior to stop',
  },
  {
    id: 9,
    input: 'Stop biting my nails',
    expected: { bucket: 'habit', subtype: null },
    category: 'Clear HABIT',
    rationale: 'Concrete physical behavior to break',
  },
  {
    id: 10,
    input: 'Quit checking Twitter first thing in the morning',
    expected: { bucket: 'habit', subtype: null },
    category: 'Clear HABIT',
    rationale: 'Concrete app/behavior pattern to break',
  },
  {
    id: 11,
    input: 'Drink more water',
    expected: { bucket: 'habit', subtype: null },
    category: 'Clear HABIT',
    rationale: 'Trackable consumption habit',
  },
  {
    id: 12,
    input: 'Reduce caffeine intake',
    expected: { bucket: 'habit', subtype: null },
    category: 'Clear HABIT',
    rationale: 'Trackable consumption reduction',
  },
  {
    id: 13,
    input: 'No more eating after 9pm',
    expected: { bucket: 'habit', subtype: null },
    category: 'Clear HABIT',
    rationale: 'Concrete eating pattern to break',
  },
  {
    id: 14,
    input: 'Exercise 3x per week',
    expected: { bucket: 'habit', subtype: null },
    category: 'Clear HABIT',
    rationale: 'Explicit frequency + concrete behavior',
  },
  {
    id: 15,
    input: 'Meditate every morning',
    expected: { bucket: 'habit', subtype: null },
    category: 'Clear HABIT',
    rationale: 'Explicit frequency + concrete behavior',
  },
  {
    id: 16,
    input: 'Less screen time before bed',
    expected: { bucket: 'habit', subtype: null },
    category: 'Clear HABIT',
    rationale: 'Trackable behavior reduction',
  },
  {
    id: 17,
    input: 'Stop masturbating and watching porn',
    expected: { bucket: 'habit', subtype: null },
    category: 'Clear HABIT',
    rationale: 'Concrete behavior to stop, trackable',
  },

  // ===========================================================================
  // CATEGORY: Clear LOGs (reflection, venting, ideas)
  // ===========================================================================
  {
    id: 18,
    input: 'What if we added a dark mode to the app',
    expected: { bucket: 'log', subtype: 'idea' },
    category: 'Clear LOG - Idea',
    rationale: "'What if' signals speculative idea",
  },
  {
    id: 19,
    input: 'Idea: subscription box for dog owners',
    expected: { bucket: 'log', subtype: 'idea' },
    category: 'Clear LOG - Idea',
    rationale: 'Explicitly labeled as idea',
  },
  {
    id: 20,
    input: 'Feeling overwhelmed with work lately',
    expected: { bucket: 'log', subtype: 'journal' },
    category: 'Clear LOG - Journal',
    rationale: 'Emotional processing, reflection',
  },
  {
    id: 21,
    input: 'Had a great conversation with Mike about the startup',
    expected: { bucket: 'log', subtype: 'general' },
    category: 'Clear LOG - General',
    rationale: 'Past event capture, narrative',
  },
  {
    id: 22,
    input: 'Random thought: would be cool to learn piano someday',
    expected: { bucket: 'log', subtype: 'idea' },
    category: 'Clear LOG - Idea',
    rationale: "'Random thought' + 'someday' = vague aspiration",
  },
  {
    id: 23,
    input: "I'm grateful for such an amazing support system",
    expected: { bucket: 'log', subtype: 'journal' },
    category: 'Clear LOG - Journal',
    rationale: 'Gratitude expression, emotional',
  },

  // ===========================================================================
  // CATEGORY: Tricky "stop/quit" - NOT habit (one-time or phrasal verb)
  // ===========================================================================
  {
    id: 24,
    input: 'Stop by the pharmacy',
    expected: { bucket: 'todo', subtype: null },
    category: 'Tricky STOP - TODO',
    rationale: "'Stop by' is phrasal verb meaning 'visit', one-time errand",
  },
  {
    id: 25,
    input: 'Stop the subscription before it renews',
    expected: { bucket: 'todo', subtype: null },
    category: 'Tricky STOP - TODO',
    rationale: 'One-time cancellation action',
  },
  {
    id: 26,
    input: 'Quit my job',
    expected: { bucket: 'todo', subtype: null },
    category: 'Tricky QUIT - TODO',
    rationale: 'One-time major life action, not recurring',
  },
  {
    id: 27,
    input: 'Quit the app and restart it',
    expected: { bucket: 'todo', subtype: null },
    category: 'Tricky QUIT - TODO',
    rationale: 'Tech troubleshooting, one-time action',
  },

  // ===========================================================================
  // CATEGORY: Tricky "reduce" - NOT habit (one-time task)
  // ===========================================================================
  {
    id: 28,
    input: 'Reduce the file size before sending',
    expected: { bucket: 'todo', subtype: null },
    category: 'Tricky REDUCE - TODO',
    rationale: 'One-time file operation, not behavioral',
  },
  {
    id: 29,
    input: 'Reduce the budget for Q2',
    expected: { bucket: 'todo', subtype: null },
    category: 'Tricky REDUCE - TODO',
    rationale: 'One-time planning task',
  },

  // ===========================================================================
  // CATEGORY: Abstract aspirations (LOG, not HABIT - can't track)
  // ===========================================================================
  {
    id: 30,
    input: 'Stop overthinking',
    expected: { bucket: 'log', subtype: 'journal' },
    category: 'Abstract - LOG',
    rationale: 'Abstract mental state, not trackable behavior',
  },
  {
    id: 31,
    input: 'Stop being such an overthinker',
    expected: { bucket: 'log', subtype: 'journal' },
    category: 'Abstract - LOG',
    rationale: 'Self-talk/venting + abstract state',
  },
  {
    id: 32,
    input: 'I really need to stop overthinking',
    expected: { bucket: 'log', subtype: 'journal' },
    category: 'Abstract - LOG',
    rationale: 'Stated desire about abstract state, not actionable habit',
  },
  {
    id: 33,
    input: 'Be more patient with the kids',
    expected: { bucket: 'log', subtype: 'journal' },
    category: 'Abstract - LOG',
    rationale: "Abstract aspiration, can't track 'patience'",
  },
  {
    id: 34,
    input: 'Be less stressed',
    expected: { bucket: 'log', subtype: 'journal' },
    category: 'Abstract - LOG',
    rationale: 'Abstract emotional state, not trackable',
  },
  {
    id: 35,
    input: 'Stop procrastinating',
    expected: { bucket: 'log', subtype: 'journal' },
    category: 'Abstract - LOG',
    rationale: 'Abstract behavior pattern, too vague to track',
  },
  {
    id: 36,
    input: 'Stop being so anxious',
    expected: { bucket: 'log', subtype: 'journal' },
    category: 'Abstract - LOG',
    rationale: 'Emotional state, not a trackable behavior',
  },

  // ===========================================================================
  // CATEGORY: Self-talk and venting (LOG/journal)
  // ===========================================================================
  {
    id: 37,
    input: 'Why do I always procrastinate',
    expected: { bucket: 'log', subtype: 'journal' },
    category: 'Self-talk - LOG',
    rationale: 'Rhetorical question, venting, not actionable',
  },
  {
    id: 38,
    input: 'Ugh, I need to get my life together',
    expected: { bucket: 'log', subtype: 'journal' },
    category: 'Self-talk - LOG',
    rationale: "'Ugh' signals exasperation, venting",
  },
  {
    id: 39,
    input: 'I wish I could be more organized',
    expected: { bucket: 'log', subtype: 'journal' },
    category: 'Self-talk - LOG',
    rationale: "'I wish' signals wistful aspiration, not commitment",
  },
  {
    id: 40,
    input: "Why can't I just focus",
    expected: { bucket: 'log', subtype: 'journal' },
    category: 'Self-talk - LOG',
    rationale: 'Rhetorical frustration, not actionable',
  },

  // ===========================================================================
  // CATEGORY: Past tense reflection (LOG, not actionable)
  // ===========================================================================
  {
    id: 41,
    input: 'I finally stopped procrastinating on that project',
    expected: { bucket: 'log', subtype: 'journal' },
    category: 'Past tense - LOG',
    rationale: 'Past accomplishment, reflection',
  },
  {
    id: 42,
    input: 'Finally quit smoking last month',
    expected: { bucket: 'log', subtype: 'journal' },
    category: 'Past tense - LOG',
    rationale: 'Past accomplishment, not current habit to track',
  },
  {
    id: 43,
    input: 'Reduced my screen time a lot this week',
    expected: { bucket: 'log', subtype: 'journal' },
    category: 'Past tense - LOG',
    rationale: 'Past reflection on progress',
  },

  // ===========================================================================
  // CATEGORY: Edge cases - concrete action from abstract
  // ===========================================================================
  {
    id: 44,
    input: 'Take 3 deep breaths when I feel anxious',
    expected: { bucket: 'habit', subtype: null },
    category: 'Concrete from abstract - HABIT',
    rationale: 'Concrete action (deep breaths) as coping strategy, trackable',
  },
  {
    id: 45,
    input: 'Write in my journal when stressed',
    expected: { bucket: 'habit', subtype: null },
    category: 'Concrete from abstract - HABIT',
    rationale: 'Concrete action (journal) triggered by state, trackable',
  },
  {
    id: 46,
    input: 'Go for a walk when I feel overwhelmed',
    expected: { bucket: 'habit', subtype: null },
    category: 'Concrete from abstract - HABIT',
    rationale: 'Concrete action (walk) as coping, trackable',
  },

  // ===========================================================================
  // CATEGORY: Edge cases - planning that becomes TODO
  // ===========================================================================
  {
    id: 47,
    input: 'Create a workout plan',
    expected: { bucket: 'todo', subtype: null },
    category: 'Planning - TODO',
    rationale: 'Creates deliverable (a plan), completable',
  },
  {
    id: 48,
    input: 'Work out more',
    expected: { bucket: 'habit', subtype: null },
    category: 'Planning - HABIT',
    rationale: 'Ongoing behavioral change, trackable',
  },
];

// ===========================================================================
// TEST RUNNER (for console validation)
// ===========================================================================

export function runTests(
  classifier: (text: string) => { bucket: string; subtypeHint?: string | null },
): { passed: number; failed: number; results: any[] } {
  const results: any[] = [];
  let passed = 0;
  let failed = 0;

  for (const test of classificationTestCases) {
    const result = classifier(test.input);
    const bucketMatch = result.bucket === test.expected.bucket;
    const subtypeMatch =
      test.expected.subtype === undefined || result.subtypeHint === test.expected.subtype;
    const success = bucketMatch && subtypeMatch;

    if (success) {
      passed++;
    } else {
      failed++;
    }

    results.push({
      id: test.id,
      input: test.input,
      expected: test.expected,
      actual: { bucket: result.bucket, subtype: result.subtypeHint },
      success,
      category: test.category,
    });
  }

  return { passed, failed, results };
}

export function printTestResults(results: {
  passed: number;
  failed: number;
  results: any[];
}): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`CLASSIFICATION TEST RESULTS`);
  console.log(`${'='.repeat(60)}\n`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📊 Total:  ${results.results.length}`);
  console.log(`📈 Pass Rate: ${((results.passed / results.results.length) * 100).toFixed(1)}%\n`);

  if (results.failed > 0) {
    console.log(`${'─'.repeat(60)}`);
    console.log(`FAILURES:\n`);

    for (const r of results.results.filter((x) => !x.success)) {
      console.log(`#${r.id} [${r.category}]`);
      console.log(`   Input:    "${r.input}"`);
      console.log(
        `   Expected: ${r.expected.bucket}${r.expected.subtype ? '/' + r.expected.subtype : ''}`,
      );
      console.log(
        `   Actual:   ${r.actual.bucket}${r.actual.subtype ? '/' + r.actual.subtype : ''}`,
      );
      console.log('');
    }
  }
}
