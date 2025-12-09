import { extractListItems, hasActionableList, toListItems } from '../extractListItems';

// Mock nanoid for deterministic tests
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'test-id-123'),
}));

describe('extractListItems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('basic extraction', () => {
    it('extracts dash bullet points', () => {
      const body = '- Item one\n- Item two';
      const result = extractListItems(body);
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Item one');
      expect(result[1].text).toBe('Item two');
    });

    it('extracts bullet character points', () => {
      const body = '• First item\n• Second item';
      const result = extractListItems(body);
      expect(result).toHaveLength(2);
    });

    it('extracts asterisk bullet points', () => {
      const body = '* Star item one\n* Star item two';
      const result = extractListItems(body);
      expect(result).toHaveLength(2);
    });

    it('extracts numbered lists', () => {
      const body = '1. First\n2. Second\n3. Third';
      const result = extractListItems(body);
      expect(result).toHaveLength(3);
      expect(result[0].text).toBe('First');
    });

    it('extracts checkbox items', () => {
      const body = '- [ ] Unchecked\n- [x] Checked';
      const result = extractListItems(body);
      expect(result).toHaveLength(2);
      expect(result[0].checked).toBe(false);
      expect(result[1].checked).toBe(true);
    });

    it('handles uppercase X in checkboxes', () => {
      const body = '- [X] Done task';
      const result = extractListItems(body);
      expect(result[0].checked).toBe(true);
    });
  });

  describe('markdown stripping', () => {
    it('strips bold formatting', () => {
      const body = '- **Bold item**';
      const result = extractListItems(body);
      expect(result[0].text).toBe('Bold item');
    });

    it('strips italic formatting', () => {
      const body = '- *Italic item*';
      const result = extractListItems(body);
      expect(result[0].text).toBe('Italic item');
    });

    it('strips mixed formatting', () => {
      const body = '- **Bold** and *italic* text';
      const result = extractListItems(body);
      expect(result[0].text).toBe('Bold and italic text');
    });
  });

  describe('actionability detection', () => {
    it('marks regular tasks as actionable', () => {
      const body = '- Pack passport\n- Book hotel';
      const result = extractListItems(body);
      expect(result[0].isActionable).toBe(true);
      expect(result[1].isActionable).toBe(true);
    });

    it('marks tips as non-actionable', () => {
      const body = '- Tip: pack light';
      const result = extractListItems(body);
      expect(result[0].isActionable).toBe(false);
    });

    it('marks questions as non-actionable', () => {
      const body = '- What should I bring?';
      const result = extractListItems(body);
      expect(result[0].isActionable).toBe(false);
    });

    it('marks "don\'t" advice as non-actionable', () => {
      const body = "- Don't forget sunscreen";
      const result = extractListItems(body);
      expect(result[0].isActionable).toBe(false);
    });

    it('marks "remember" advice as non-actionable', () => {
      const body = '- Remember: stay hydrated';
      const result = extractListItems(body);
      expect(result[0].isActionable).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty string', () => {
      expect(extractListItems('')).toEqual([]);
    });

    it('returns empty array for null/undefined', () => {
      expect(extractListItems(null as any)).toEqual([]);
      expect(extractListItems(undefined as any)).toEqual([]);
    });

    it('returns empty array for non-list content', () => {
      const body = 'This is just a paragraph.\nNo lists here.';
      expect(extractListItems(body)).toEqual([]);
    });

    it('only extracts list items from mixed content', () => {
      const body = 'Some intro text\n\n- Actual item\n\nMore paragraph';
      const result = extractListItems(body);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Actual item');
    });

    it('skips empty bullet points', () => {
      const body = '- \n- Real item\n-   ';
      const result = extractListItems(body);
      expect(result).toHaveLength(1);
    });
  });
});

describe('hasActionableList', () => {
  it('returns false for empty content', () => {
    expect(hasActionableList('')).toBe(false);
  });

  it('returns false for single item', () => {
    expect(hasActionableList('- Just one')).toBe(false);
  });

  it('returns true for two items', () => {
    expect(hasActionableList('- One\n- Two')).toBe(true);
  });

  it('returns true for many items', () => {
    expect(hasActionableList('- One\n- Two\n- Three\n- Four')).toBe(true);
  });
});

describe('toListItems', () => {
  it('strips isActionable flag', () => {
    const extracted = [{ id: '1', text: 'Task', checked: false, isActionable: true }];
    const result = toListItems(extracted);
    expect(result[0]).toEqual({ id: '1', text: 'Task', checked: false });
    expect((result[0] as any).isActionable).toBeUndefined();
  });
});
