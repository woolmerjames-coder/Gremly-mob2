import { ITEM_STARTERS, openingPrompt, itemKindLabel } from '../itemStarters';

describe('what an item chat offers to start with', () => {
  it('each kind has its starters, with a message to send for each', () => {
    expect(ITEM_STARTERS.todo.map((s) => s.key)).toEqual([
      'break_down',
      'whats_blocking',
      'think_through',
      'research',
      'action_steps',
    ]);
    expect(ITEM_STARTERS.habit.map((s) => s.key)).toEqual(['setup', 'why_skipping', 'make_easier']);
    expect(ITEM_STARTERS.note).toHaveLength(4);
  });

  it('a screen can open the chat with a starter by its key, or with its own words', () => {
    expect(openingPrompt('habit', 'why_skipping')).toBe(
      "I've been struggling to stay consistent with this habit. Help me figure out what's getting in the way.",
    );
    // Sweep passes a sentence rather than a key
    expect(openingPrompt('todo', 'Help me figure out what to do with this task')).toBe(
      'Help me figure out what to do with this task',
    );
    expect(openingPrompt('todo', null)).toBeNull();
    expect(openingPrompt('todo', '  ')).toBeNull();
  });

  it('names the item the way the cards do', () => {
    expect(itemKindLabel('todo')).toBe('Todo');
    expect(itemKindLabel('habit')).toBe('Habit');
    expect(itemKindLabel('note', 'event')).toBe('Event');
    expect(itemKindLabel('note', 'journal')).toBe('Journal');
    expect(itemKindLabel('note', null)).toBe('Note');
  });

  it('no starter uses a dash as punctuation', () => {
    for (const list of Object.values(ITEM_STARTERS))
      for (const s of list) {
        expect(s.label).not.toMatch(/[–—]| - /);
        expect(s.prompt).not.toMatch(/[–—]| - /);
      }
  });
});
