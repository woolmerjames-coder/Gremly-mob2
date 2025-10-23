/**
 * Phase 10.7B: Context Assembly Tests
 * Tests for running summary + last 10 turns context assembly
 */

import { assembleContext } from '../../lib/cortex/context/assemble';
import { updateRunningSummary } from '../../lib/cortex/context/summary';

describe('Context Assembly', () => {
  it('assembles last 10 turns + summary', () => {
    const turns = [
      { role: 'user' as const, text: 'Turn 1' },
      { role: 'assistant' as const, text: 'Response 1' },
      { role: 'user' as const, text: 'Turn 2' },
      { role: 'assistant' as const, text: 'Response 2' },
      { role: 'user' as const, text: 'Turn 3' },
      { role: 'assistant' as const, text: 'Response 3' },
      { role: 'user' as const, text: 'Turn 4' },
      { role: 'assistant' as const, text: 'Response 4' },
      { role: 'user' as const, text: 'Turn 5' },
      { role: 'assistant' as const, text: 'Response 5' },
    ];

    const summary = 'Previous conversation about habits and tasks.';

    const result = assembleContext({
      threadId: 'test-thread',
      lastTurns: turns,
      runningSummary: summary,
      pinnedFacts: {
        spaceName: 'Work Space',
        userTone: 'calm',
      },
    });

    // Should include system prompt
    expect(result.system).toContain('calm, helpful assistant');
    expect(result.system).toContain('Work Space');
    expect(result.system).toContain(summary);

    // Should include all 10 turns (within limit)
    expect(result.messages.length).toBe(10);
  });

  it('trims beyond last 10 turns', () => {
    const turns = [];
    for (let i = 1; i <= 20; i++) {
      turns.push({ role: 'user' as const, text: `Turn ${i}` });
      turns.push({ role: 'assistant' as const, text: `Response ${i}` });
    }

    const result = assembleContext({
      threadId: 'test-thread',
      lastTurns: turns,
    });

    // Should only include last 10 turns
    expect(result.messages.length).toBe(10);
    expect(result.messages[0].content).toContain('Turn 16');
  });

  it('updates running summary with new turns', () => {
    const prevSummary = 'User wants to build exercise habit.';
    const newTurns = [
      { role: 'user' as const, text: 'I want to meditate every morning' },
      { role: 'assistant' as const, text: 'That sounds like a great habit!' },
      { role: 'user' as const, text: 'Also need to cancel gym membership' },
    ];

    const updated = updateRunningSummary('thread-1', newTurns, prevSummary);

    expect(updated).toBeTruthy();
    expect(updated.length).toBeGreaterThan(0);
    expect(updated.length).toBeLessThanOrEqual(1400); // ~350 tokens
  });

  it('handles empty summary gracefully', () => {
    const result = assembleContext({
      threadId: 'test-thread',
      lastTurns: [
        { role: 'user', text: 'Hello' },
        { role: 'assistant', text: 'Hi there!' },
      ],
      runningSummary: '',
    });

    expect(result.system).toBeTruthy();
    expect(result.messages.length).toBe(2);
  });

  it('includes pinned facts in system prompt', () => {
    const result = assembleContext({
      threadId: 'test-thread',
      lastTurns: [],
      pinnedFacts: {
        spaceName: 'Personal',
        spaceGoals: 'Health and fitness',
        userTone: 'warm',
      },
    });

    expect(result.system).toContain('Personal');
    expect(result.system).toContain('Health and fitness');
    expect(result.system).toContain('warm');
  });
});
