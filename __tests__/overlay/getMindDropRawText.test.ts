/**
 * Tests for getMindDropRawText helper
 *
 * Verifies that we can reliably extract the original Mind Drop sentence
 * from any entity type (note, todo, habit) using a single helper function.
 */

import {
  getMindDropRawText,
  hasMindDropRawText,
} from '../../components/overlay/getMindDropRawText';

describe('getMindDropRawText', () => {
  const mindDropText = 'Run for 30 minutes every morning before breakfast';

  describe('returns null for non-Mind Drop entities', () => {
    it('returns null when origin is not catchall', () => {
      const entity = {
        type: 'todo',
        origin: 'manual',
        title: 'Some task',
      };
      expect(getMindDropRawText(entity)).toBeNull();
    });

    it('returns null when origin is null', () => {
      const entity = {
        type: 'habit',
        origin: null,
        notes: mindDropText,
      };
      expect(getMindDropRawText(entity)).toBeNull();
    });

    it('returns null when entity is null', () => {
      expect(getMindDropRawText(null)).toBeNull();
    });

    it('returns null when entity is undefined', () => {
      expect(getMindDropRawText(undefined)).toBeNull();
    });

    it('returns null for unknown entity types', () => {
      const entity = {
        type: 'unknown',
        origin: 'catchall',
        body: mindDropText,
      };
      expect(getMindDropRawText(entity)).toBeNull();
    });
  });

  describe('extracts raw text from notes (logs)', () => {
    it('returns body for Mind Drop note', () => {
      const entity = {
        type: 'note',
        origin: 'catchall',
        body: mindDropText,
        title: 'Short title',
      };
      expect(getMindDropRawText(entity)).toBe(mindDropText);
    });

    it('falls back to title when body is empty', () => {
      const entity = {
        type: 'note',
        origin: 'catchall',
        body: '',
        title: mindDropText,
      };
      expect(getMindDropRawText(entity)).toBe(mindDropText);
    });

    it('falls back to title when body is null', () => {
      const entity = {
        type: 'note',
        origin: 'catchall',
        body: null,
        title: mindDropText,
      };
      expect(getMindDropRawText(entity)).toBe(mindDropText);
    });

    it('returns null when neither body nor title exist', () => {
      const entity = {
        type: 'note',
        origin: 'catchall',
      };
      expect(getMindDropRawText(entity)).toBeNull();
    });

    it('trims whitespace from body', () => {
      const entity = {
        type: 'note',
        origin: 'catchall',
        body: `  ${mindDropText}  `,
      };
      expect(getMindDropRawText(entity)).toBe(mindDropText);
    });
  });

  describe('extracts raw text from todos', () => {
    it('returns body for Mind Drop todo', () => {
      const entity = {
        type: 'todo',
        origin: 'catchall',
        body: mindDropText,
        title: 'Short title',
        name: 'Short name',
      };
      expect(getMindDropRawText(entity)).toBe(mindDropText);
    });

    it('falls back to title when body is empty', () => {
      const entity = {
        type: 'todo',
        origin: 'catchall',
        body: '',
        title: mindDropText,
        name: 'Short name',
      };
      expect(getMindDropRawText(entity)).toBe(mindDropText);
    });

    it('falls back to name when body and title are empty', () => {
      const entity = {
        type: 'todo',
        origin: 'catchall',
        body: '',
        title: '',
        name: mindDropText,
      };
      expect(getMindDropRawText(entity)).toBe(mindDropText);
    });

    it('returns null when body, title, and name are all empty', () => {
      const entity = {
        type: 'todo',
        origin: 'catchall',
      };
      expect(getMindDropRawText(entity)).toBeNull();
    });

    it('trims whitespace from body', () => {
      const entity = {
        type: 'todo',
        origin: 'catchall',
        body: `  ${mindDropText}  `,
      };
      expect(getMindDropRawText(entity)).toBe(mindDropText);
    });
  });

  describe('extracts raw text from habits', () => {
    it('returns notes for Mind Drop habit', () => {
      const entity = {
        type: 'habit',
        origin: 'catchall',
        notes: mindDropText,
        title: 'Short title',
        name: 'Short name',
      };
      expect(getMindDropRawText(entity)).toBe(mindDropText);
    });

    it('falls back to title when notes is empty', () => {
      const entity = {
        type: 'habit',
        origin: 'catchall',
        notes: '',
        title: mindDropText,
        name: 'Short name',
      };
      expect(getMindDropRawText(entity)).toBe(mindDropText);
    });

    it('falls back to name when notes and title are empty', () => {
      const entity = {
        type: 'habit',
        origin: 'catchall',
        notes: '',
        title: '',
        name: mindDropText,
      };
      expect(getMindDropRawText(entity)).toBe(mindDropText);
    });

    it('returns null when notes, title, and name are all empty', () => {
      const entity = {
        type: 'habit',
        origin: 'catchall',
      };
      expect(getMindDropRawText(entity)).toBeNull();
    });

    it('trims whitespace from notes', () => {
      const entity = {
        type: 'habit',
        origin: 'catchall',
        notes: `  ${mindDropText}  `,
      };
      expect(getMindDropRawText(entity)).toBe(mindDropText);
    });
  });

  describe('consistent behavior across all entity types', () => {
    it('returns same text for note, todo, and habit created from same Mind Drop', () => {
      const noteEntity = {
        type: 'note',
        origin: 'catchall',
        body: mindDropText,
        title: 'Log entry',
      };

      const todoEntity = {
        type: 'todo',
        origin: 'catchall',
        body: mindDropText,
        title: 'Buy running shoes',
        name: 'Buy running shoes',
      };

      const habitEntity = {
        type: 'habit',
        origin: 'catchall',
        notes: mindDropText,
        title: 'Morning run',
        name: 'Morning run',
      };

      const noteRawText = getMindDropRawText(noteEntity);
      const todoRawText = getMindDropRawText(todoEntity);
      const habitRawText = getMindDropRawText(habitEntity);

      // All three should return the same Mind Drop sentence
      expect(noteRawText).toBe(mindDropText);
      expect(todoRawText).toBe(mindDropText);
      expect(habitRawText).toBe(mindDropText);

      // Verify they're all identical
      expect(noteRawText).toBe(todoRawText);
      expect(todoRawText).toBe(habitRawText);
    });
  });
});

describe('hasMindDropRawText', () => {
  it('returns true for note with body', () => {
    const entity = {
      type: 'note',
      origin: 'catchall',
      body: 'Some text',
    };
    expect(hasMindDropRawText(entity)).toBe(true);
  });

  it('returns true for todo with body', () => {
    const entity = {
      type: 'todo',
      origin: 'catchall',
      body: 'Some text',
    };
    expect(hasMindDropRawText(entity)).toBe(true);
  });

  it('returns true for habit with notes', () => {
    const entity = {
      type: 'habit',
      origin: 'catchall',
      notes: 'Some text',
    };
    expect(hasMindDropRawText(entity)).toBe(true);
  });

  it('returns false when origin is not catchall', () => {
    const entity = {
      type: 'todo',
      origin: 'manual',
      body: 'Some text',
    };
    expect(hasMindDropRawText(entity)).toBe(false);
  });

  it('returns false when no text fields exist', () => {
    const entity = {
      type: 'note',
      origin: 'catchall',
    };
    expect(hasMindDropRawText(entity)).toBe(false);
  });

  it('returns false for null entity', () => {
    expect(hasMindDropRawText(null)).toBe(false);
  });
});
