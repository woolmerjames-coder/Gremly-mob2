/**
 * __tests__/lists.helpers.test.ts
 *
 * Tests for list parsing and manipulation helpers.
 * Phase 7 Lists: Core utilities for structured list support.
 */

import {
  parseTextToListItems,
  toggleListItemChecked,
  addListItem,
  removeListItem,
  updateListItemText,
  reorderListItem,
  hasListLikeStructure,
  listItemsToText,
  getListStats,
} from '../lib/lists/helpers';
import type { ListItem } from '../lib/lists/types';

describe('parseTextToListItems', () => {
  it('should parse simple bullet list with dashes', () => {
    const body = `- First item
- Second item
- Third item`;

    const items = parseTextToListItems(body);

    expect(items).toHaveLength(3);
    expect(items[0].text).toBe('First item');
    expect(items[1].text).toBe('Second item');
    expect(items[2].text).toBe('Third item');
    expect(items[0].checked).toBe(false);
    expect(items[0].id).toBeTruthy();
  });

  it('should parse bullet list with asterisks', () => {
    const body = `* Buy milk
* Call dentist
* Fix bug`;

    const items = parseTextToListItems(body);

    expect(items).toHaveLength(3);
    expect(items[0].text).toBe('Buy milk');
    expect(items[1].text).toBe('Call dentist');
    expect(items[2].text).toBe('Fix bug');
  });

  it('should parse numbered list', () => {
    const body = `1. First step
2. Second step
3. Third step`;

    const items = parseTextToListItems(body);

    expect(items).toHaveLength(3);
    expect(items[0].text).toBe('First step');
    expect(items[1].text).toBe('Second step');
    expect(items[2].text).toBe('Third step');
  });

  it('should parse numbered list with parentheses', () => {
    const body = `1) Task one
2) Task two
3) Task three`;

    const items = parseTextToListItems(body);

    expect(items).toHaveLength(3);
    expect(items[0].text).toBe('Task one');
    expect(items[2].text).toBe('Task three');
  });

  it('should parse checkbox list and preserve checked state', () => {
    const body = `[ ] Unchecked item
[x] Checked item
[X] Also checked`;

    const items = parseTextToListItems(body);

    expect(items).toHaveLength(3);
    expect(items[0].checked).toBe(false);
    expect(items[1].checked).toBe(true);
    expect(items[2].checked).toBe(true);
  });

  it('should handle mixed text and bullets', () => {
    const body = `Some intro text

- First item
- Second item

Some middle text

- Third item`;

    const items = parseTextToListItems(body);

    expect(items).toHaveLength(3);
    expect(items[0].text).toBe('First item');
    expect(items[1].text).toBe('Second item');
    expect(items[2].text).toBe('Third item');
  });

  it('should handle mixed list formats', () => {
    const body = `- Bullet item
1. Numbered item
* Another bullet
[ ] Checkbox item`;

    const items = parseTextToListItems(body);

    expect(items).toHaveLength(4);
    expect(items[0].text).toBe('Bullet item');
    expect(items[1].text).toBe('Numbered item');
    expect(items[2].text).toBe('Another bullet');
    expect(items[3].text).toBe('Checkbox item');
  });

  it('should trim whitespace from items', () => {
    const body = `-   Lots of spaces   
*     Extra whitespace
1.  Trailing spaces  `;

    const items = parseTextToListItems(body);

    expect(items).toHaveLength(3);
    expect(items[0].text).toBe('Lots of spaces');
    expect(items[1].text).toBe('Extra whitespace');
    expect(items[2].text).toBe('Trailing spaces');
  });

  it('should skip empty lines', () => {
    const body = `- First


- Second

- Third`;

    const items = parseTextToListItems(body);

    expect(items).toHaveLength(3);
  });

  it('should return empty array for non-list text', () => {
    const body = 'Just plain text without any list markers';
    const items = parseTextToListItems(body);
    expect(items).toHaveLength(0);
  });

  it('should return empty array for empty string', () => {
    expect(parseTextToListItems('')).toEqual([]);
  });

  it('should handle bullet character •', () => {
    const body = `• First item
• Second item`;

    const items = parseTextToListItems(body);

    expect(items).toHaveLength(2);
    expect(items[0].text).toBe('First item');
  });

  it('should assign unique IDs to each item', () => {
    const body = `- Item 1
- Item 2
- Item 3`;

    const items = parseTextToListItems(body);

    const ids = items.map((item) => item.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(3); // All IDs should be unique
    expect(ids.every((id) => id && id.length > 0)).toBe(true);
  });
});

describe('toggleListItemChecked', () => {
  it('should toggle item from unchecked to checked', () => {
    const items: ListItem[] = [
      { id: '1', text: 'Task', checked: false },
      { id: '2', text: 'Another', checked: false },
    ];

    const updated = toggleListItemChecked(items, '1');

    expect(updated[0].checked).toBe(true);
    expect(updated[1].checked).toBe(false); // Unchanged
  });

  it('should toggle item from checked to unchecked', () => {
    const items: ListItem[] = [{ id: '1', text: 'Task', checked: true }];

    const updated = toggleListItemChecked(items, '1');

    expect(updated[0].checked).toBe(false);
  });

  it('should not mutate original array', () => {
    const items: ListItem[] = [{ id: '1', text: 'Task', checked: false }];

    const updated = toggleListItemChecked(items, '1');

    expect(items[0].checked).toBe(false); // Original unchanged
    expect(updated[0].checked).toBe(true);
    expect(updated).not.toBe(items); // Different array reference
  });

  it('should return same array if ID not found', () => {
    const items: ListItem[] = [{ id: '1', text: 'Task', checked: false }];

    const updated = toggleListItemChecked(items, 'nonexistent');

    expect(updated).toEqual(items);
  });
});

describe('addListItem', () => {
  it('should add new item to end of list', () => {
    const items: ListItem[] = [{ id: '1', text: 'First', checked: false }];

    const updated = addListItem(items, 'Second');

    expect(updated).toHaveLength(2);
    expect(updated[1].text).toBe('Second');
    expect(updated[1].checked).toBe(false);
    expect(updated[1].id).toBeTruthy();
  });

  it('should add to empty list', () => {
    const updated = addListItem([], 'First item');

    expect(updated).toHaveLength(1);
    expect(updated[0].text).toBe('First item');
  });

  it('should trim whitespace from text', () => {
    const updated = addListItem([], '  Spaces around  ');

    expect(updated[0].text).toBe('Spaces around');
  });

  it('should not add empty items', () => {
    const items: ListItem[] = [{ id: '1', text: 'Existing', checked: false }];

    const updated = addListItem(items, '   '); // Only whitespace

    expect(updated).toHaveLength(1); // No new item added
    expect(updated).toBe(items);
  });

  it('should not mutate original array', () => {
    const items: ListItem[] = [{ id: '1', text: 'First', checked: false }];

    const updated = addListItem(items, 'Second');

    expect(items).toHaveLength(1); // Original unchanged
    expect(updated).toHaveLength(2);
  });
});

describe('removeListItem', () => {
  it('should remove item by ID', () => {
    const items: ListItem[] = [
      { id: '1', text: 'Keep', checked: false },
      { id: '2', text: 'Remove', checked: false },
      { id: '3', text: 'Keep', checked: false },
    ];

    const updated = removeListItem(items, '2');

    expect(updated).toHaveLength(2);
    expect(updated[0].id).toBe('1');
    expect(updated[1].id).toBe('3');
  });

  it('should return same array if ID not found', () => {
    const items: ListItem[] = [{ id: '1', text: 'Keep', checked: false }];

    const updated = removeListItem(items, 'nonexistent');

    expect(updated).toEqual(items);
  });

  it('should handle removing last item', () => {
    const items: ListItem[] = [{ id: '1', text: 'Only', checked: false }];

    const updated = removeListItem(items, '1');

    expect(updated).toHaveLength(0);
  });

  it('should not mutate original array', () => {
    const items: ListItem[] = [
      { id: '1', text: 'First', checked: false },
      { id: '2', text: 'Second', checked: false },
    ];

    const updated = removeListItem(items, '1');

    expect(items).toHaveLength(2); // Original unchanged
    expect(updated).toHaveLength(1);
  });
});

describe('updateListItemText', () => {
  it('should update text of specific item', () => {
    const items: ListItem[] = [
      { id: '1', text: 'Old text', checked: false },
      { id: '2', text: 'Keep', checked: false },
    ];

    const updated = updateListItemText(items, '1', 'New text');

    expect(updated[0].text).toBe('New text');
    expect(updated[1].text).toBe('Keep');
  });

  it('should trim whitespace from new text', () => {
    const items: ListItem[] = [{ id: '1', text: 'Old', checked: false }];

    const updated = updateListItemText(items, '1', '  New text  ');

    expect(updated[0].text).toBe('New text');
  });

  it('should not mutate original array', () => {
    const items: ListItem[] = [{ id: '1', text: 'Old', checked: false }];

    const updated = updateListItemText(items, '1', 'New');

    expect(items[0].text).toBe('Old');
    expect(updated[0].text).toBe('New');
  });
});

describe('reorderListItem', () => {
  it('should move item from start to end', () => {
    const items: ListItem[] = [
      { id: '1', text: 'First', checked: false },
      { id: '2', text: 'Second', checked: false },
      { id: '3', text: 'Third', checked: false },
    ];

    const updated = reorderListItem(items, 0, 2);

    expect(updated[0].id).toBe('2');
    expect(updated[1].id).toBe('3');
    expect(updated[2].id).toBe('1');
  });

  it('should move item from end to start', () => {
    const items: ListItem[] = [
      { id: '1', text: 'First', checked: false },
      { id: '2', text: 'Second', checked: false },
      { id: '3', text: 'Third', checked: false },
    ];

    const updated = reorderListItem(items, 2, 0);

    expect(updated[0].id).toBe('3');
    expect(updated[1].id).toBe('1');
    expect(updated[2].id).toBe('2');
  });

  it('should handle same index (no-op)', () => {
    const items: ListItem[] = [
      { id: '1', text: 'First', checked: false },
      { id: '2', text: 'Second', checked: false },
    ];

    const updated = reorderListItem(items, 0, 0);

    expect(updated).toEqual(items);
  });

  it('should not mutate original array', () => {
    const items: ListItem[] = [
      { id: '1', text: 'First', checked: false },
      { id: '2', text: 'Second', checked: false },
    ];

    const updated = reorderListItem(items, 0, 1);

    expect(items[0].id).toBe('1'); // Original unchanged
    expect(updated[0].id).toBe('2');
  });
});

describe('hasListLikeStructure', () => {
  it('should return true for bullet list with 2+ items', () => {
    const body = `- Item 1
- Item 2`;

    expect(hasListLikeStructure(body)).toBe(true);
  });

  it('should return false for single list item', () => {
    const body = '- Only one item';
    expect(hasListLikeStructure(body)).toBe(false);
  });

  it('should return false for plain text', () => {
    const body = 'This is just plain text without any list markers.';
    expect(hasListLikeStructure(body)).toBe(false);
  });

  it('should return true for numbered list', () => {
    const body = `1. First
2. Second
3. Third`;

    expect(hasListLikeStructure(body)).toBe(true);
  });

  it('should return true for checkbox list', () => {
    const body = `[ ] Task 1
[x] Task 2`;

    expect(hasListLikeStructure(body)).toBe(true);
  });

  it('should return true for mixed text with embedded list', () => {
    const body = `Some intro text

- Item 1
- Item 2

Some conclusion`;

    expect(hasListLikeStructure(body)).toBe(true);
  });

  it('should return true for mixed list formats', () => {
    const body = `- Bullet
1. Number`;

    expect(hasListLikeStructure(body)).toBe(true);
  });

  it('should return false for empty string', () => {
    expect(hasListLikeStructure('')).toBe(false);
  });

  it('should ignore empty lines in count', () => {
    const body = `- Item 1

- Item 2

`;
    expect(hasListLikeStructure(body)).toBe(true);
  });

  it('should return false for text with single bullet among paragraphs', () => {
    const body = `This is a long paragraph of text.

- Just one bullet point here

More text continues here.`;

    expect(hasListLikeStructure(body)).toBe(false);
  });
});

describe('listItemsToText', () => {
  const items: ListItem[] = [
    { id: '1', text: 'First item', checked: false },
    { id: '2', text: 'Second item', checked: true },
    { id: '3', text: 'Third item', checked: false },
  ];

  it('should convert to bullet format by default', () => {
    const text = listItemsToText(items);

    expect(text).toBe(`- First item
- Second item
- Third item`);
  });

  it('should convert to numbered format', () => {
    const text = listItemsToText(items, 'numbered');

    expect(text).toBe(`1. First item
2. Second item
3. Third item`);
  });

  it('should convert to checkbox format with checked state', () => {
    const text = listItemsToText(items, 'checkbox');

    expect(text).toBe(`[ ] First item
[x] Second item
[ ] Third item`);
  });

  it('should return empty string for empty array', () => {
    expect(listItemsToText([])).toBe('');
  });
});

describe('getListStats', () => {
  it('should calculate stats for partially completed list', () => {
    const items: ListItem[] = [
      { id: '1', text: 'Done', checked: true },
      { id: '2', text: 'Done', checked: true },
      { id: '3', text: 'Not done', checked: false },
      { id: '4', text: 'Not done', checked: false },
    ];

    const stats = getListStats(items);

    expect(stats.total).toBe(4);
    expect(stats.completed).toBe(2);
    expect(stats.remaining).toBe(2);
    expect(stats.completionPercentage).toBe(50);
  });

  it('should handle fully completed list', () => {
    const items: ListItem[] = [
      { id: '1', text: 'Done', checked: true },
      { id: '2', text: 'Done', checked: true },
    ];

    const stats = getListStats(items);

    expect(stats.total).toBe(2);
    expect(stats.completed).toBe(2);
    expect(stats.remaining).toBe(0);
    expect(stats.completionPercentage).toBe(100);
  });

  it('should handle empty list', () => {
    const stats = getListStats([]);

    expect(stats.total).toBe(0);
    expect(stats.completed).toBe(0);
    expect(stats.remaining).toBe(0);
    expect(stats.completionPercentage).toBe(0);
  });

  it('should handle all unchecked items', () => {
    const items: ListItem[] = [
      { id: '1', text: 'Todo', checked: false },
      { id: '2', text: 'Todo', checked: false },
    ];

    const stats = getListStats(items);

    expect(stats.completed).toBe(0);
    expect(stats.completionPercentage).toBe(0);
  });

  it('should round completion percentage', () => {
    const items: ListItem[] = [
      { id: '1', text: 'Done', checked: true },
      { id: '2', text: 'Not done', checked: false },
      { id: '3', text: 'Not done', checked: false },
    ];

    const stats = getListStats(items);

    expect(stats.completionPercentage).toBe(33); // 1/3 = 33.33... → 33
  });
});
