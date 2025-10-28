import { buildMindDropAskChips } from '../../lib/cortex/policy/chips';

describe('buildMindDropAskChips', () => {
  it('returns empty array for blank text', () => {
    const chips = buildMindDropAskChips({ text: '   ', probable: 'unknown', confidence: 0.5 });
    expect(chips).toEqual([]);
  });

  it('includes todo suggestion for unknown probable intent', () => {
    const chips = buildMindDropAskChips({
      text: 'Book dentist appointment',
      probable: 'unknown',
      confidence: 0.42,
    });

    expect(chips.find((chip) => chip.type === 'create.todo')).toMatchObject({
      label: 'Create todo',
      payload: { name: 'Book dentist appointment', undefined_due: true },
    });
  });

  it('adds habit suggestion when cadence keywords present', () => {
    const chips = buildMindDropAskChips({
      text: 'Run 3 times a week',
      probable: 'unknown',
      confidence: 0.55,
    });

    expect(chips.find((chip) => chip.type === 'create.habit')).toMatchObject({
      payload: { name: 'Run 3 times a week', freq: 'weekly' },
    });
  });

  it('prefers list note when list keywords detected', () => {
    const chips = buildMindDropAskChips({
      text: 'Ideas for weekend trip',
      probable: 'note',
      confidence: 0.2,
    });

    expect(chips.find((chip) => chip.type === 'create.note')).toMatchObject({
      label: 'Save as list',
      payload: { subtype: 'list' },
    });
  });

  it('falls back to journal note when no list cues', () => {
    const chips = buildMindDropAskChips({
      text: 'Thought about focus and deep work',
      probable: 'note',
      confidence: 0.2,
    });

    expect(chips.find((chip) => chip.type === 'create.note')).toMatchObject({
      label: 'Save as journal',
      payload: { subtype: 'journal' },
    });
  });

  it('deduplicates chips with identical type and label', () => {
    const chips = buildMindDropAskChips({
      text: 'Daily meditation',
      probable: 'habit',
      confidence: 0.8,
    });

    const todoChips = chips.filter((chip) => chip.type === 'create.todo');
    const habitChips = chips.filter((chip) => chip.type === 'create.habit');

    expect(todoChips.length).toBeLessThanOrEqual(1);
    expect(habitChips.length).toBeLessThanOrEqual(1);
  });
});

describe('Mid-confidence chips policy', () => {
  it('offers todo + note.list for ambiguous ideas input', () => {
    const chips = buildMindDropAskChips({
      text: 'Ideas for weekend trip',
      probable: 'unknown',
      confidence: 0.6,
    });
    const labels = chips.map((c) => c.label).join('|');
    expect(labels).toMatch(/Create todo/);
    expect(labels).toMatch(/Save as list/);
  });

  it('offers habit chip when cadence present', () => {
    const chips = buildMindDropAskChips({
      text: 'Run 3 times a week',
      probable: 'habit',
      confidence: 0.7,
    });
    const hasHabit = chips.some((c) => c.type === 'create.habit' && c.payload.freq === 'weekly');
    expect(hasHabit).toBe(true);
  });

  it('produces a minimal todo payload for action-like text', () => {
    const chips = buildMindDropAskChips({
      text: 'Book dentist appointment',
      probable: 'todo',
      confidence: 0.7,
    });
    const todo = chips.find((c) => c.type === 'create.todo');
    expect(todo).toBeTruthy();
    if (todo && todo.type === 'create.todo') {
      expect(todo.payload.name).toContain('Book dentist');
      expect(todo.payload.undefined_due).toBe(true);
    }
  });
});
