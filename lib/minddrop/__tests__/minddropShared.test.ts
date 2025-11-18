/**
 * Tests for Mind Drop shared utilities
 */

import {
  buildMindDropTags,
  buildMindDropDerivedFields,
  type MindDropSource,
} from '../minddropShared';

describe('buildMindDropTags', () => {
  it('uses AI tags when provided and filters junk words', () => {
    const source: MindDropSource = {
      rawText: 'Run every morning, even if just for 5 mins',
      aiTags: ['#running', '#every', '#morning', '#fitness', '#mins'],
    };

    const tags = buildMindDropTags(source, 'habit');

    // Should filter out junk time/frequency words
    expect(tags).not.toContain('#every');
    expect(tags).not.toContain('#morning');
    expect(tags).not.toContain('#mins');

    // Should keep meaningful tags
    expect(tags).toContain('#running');
    expect(tags).toContain('#fitness');
  });

  it('generates fallback tags when AI tags not provided', () => {
    const source: MindDropSource = {
      rawText: 'Book flight back home to SFO',
    };

    const tags = buildMindDropTags(source, 'todo');

    // Should have some tags generated
    expect(Array.isArray(tags)).toBe(true);
    // Fallback tags should be normalized (no junk words)
    expect(
      tags.every((tag) => tag.startsWith('#') || tag.startsWith('@') || tag.startsWith('*')),
    ).toBe(true);
  });

  it('returns same cleaned tag set for all item kinds given same AI tags', () => {
    const aiTags = ['#meditation', '#every', '#daily', '#mindfulness', '#minutes'];
    const rawText = 'Meditate for 10 minutes every day';

    const habitTags = buildMindDropTags({ rawText, aiTags }, 'habit');
    const todoTags = buildMindDropTags({ rawText, aiTags }, 'todo');
    const logTags = buildMindDropTags({ rawText, aiTags }, 'log');

    // All should have same cleaned tags (junk filtered)
    expect(habitTags).toEqual(todoTags);
    expect(todoTags).toEqual(logTags);

    // Should not include junk words
    expect(habitTags).not.toContain('#every');
    expect(habitTags).not.toContain('#daily');
    expect(habitTags).not.toContain('#minutes');

    // Should include meaningful tags
    expect(habitTags).toContain('#meditation');
    expect(habitTags).toContain('#mindfulness');
  });

  it('handles empty AI tags gracefully', () => {
    const source: MindDropSource = {
      rawText: 'Today I finally did X',
      aiTags: [],
    };

    const tags = buildMindDropTags(source, 'log');

    // Should fallback to generated tags
    expect(Array.isArray(tags)).toBe(true);
  });
});

describe('buildMindDropDerivedFields', () => {
  it('maps habit fields correctly: name, title, notes with full sentence', () => {
    const source: MindDropSource = {
      rawText: 'Run every morning, even if just for 5 mins',
      aiTags: ['#running', '#fitness'],
    };

    const fields = buildMindDropDerivedFields('habit', source);

    expect(fields.title).toBe('Run every morning, even if just for 5 mins');
    expect(fields.name).toBe('Run every morning, even if just for 5 mins');
    expect(fields.notes).toBe('Run every morning, even if just for 5 mins');
    expect(fields.body).toBeUndefined(); // habits don't have body field
    expect(fields.tags).toContain('#running');
    expect(fields.tags).toContain('#fitness');
  });

  it('maps todo fields correctly: title, name, null body/notes', () => {
    const source: MindDropSource = {
      rawText: 'Book flight back home to SFO',
      aiTags: ['#travel', '#flight'],
    };

    const fields = buildMindDropDerivedFields('todo', source);

    expect(fields.title).toBe('Book flight back home to SFO');
    expect(fields.name).toBe('Book flight back home to SFO');
    expect(fields.body).toBeNull();
    expect(fields.notes).toBeNull();
    expect(fields.tags).toContain('#travel');
    expect(fields.tags).toContain('#flight');
  });

  it('maps log fields correctly: title and body with full sentence', () => {
    const source: MindDropSource = {
      rawText: 'Today I finally completed the marathon training',
      aiTags: ['#accomplishment', '#running'],
    };

    const fields = buildMindDropDerivedFields('log', source);

    expect(fields.title).toBe('Today I finally completed the marathon training');
    expect(fields.body).toBe('Today I finally completed the marathon training');
    expect(fields.tags).toContain('#accomplishment');
    expect(fields.tags).toContain('#running');
  });

  it('trims whitespace from raw text', () => {
    const source: MindDropSource = {
      rawText: '  Meditate daily  ',
      aiTags: ['#meditation'],
    };

    const fields = buildMindDropDerivedFields('habit', source);

    expect(fields.title).toBe('Meditate daily');
    expect(fields.name).toBe('Meditate daily');
    expect(fields.notes).toBe('Meditate daily');
  });

  it('all three kinds get same cleaned tags from same AI input', () => {
    const aiTags = ['#productivity', '#every', '#daily', '#work', '#minutes'];
    const rawText = 'Review inbox every morning for 15 minutes';

    const habitFields = buildMindDropDerivedFields('habit', { rawText, aiTags });
    const todoFields = buildMindDropDerivedFields('todo', { rawText, aiTags });
    const logFields = buildMindDropDerivedFields('log', { rawText, aiTags });

    // All should have identical cleaned tags
    expect(habitFields.tags).toEqual(todoFields.tags);
    expect(todoFields.tags).toEqual(logFields.tags);

    // Should filter junk words
    expect(habitFields.tags).not.toContain('#every');
    expect(habitFields.tags).not.toContain('#daily');
    expect(habitFields.tags).not.toContain('#minutes');

    // Should keep meaningful tags
    expect(habitFields.tags).toContain('#productivity');
    expect(habitFields.tags).toContain('#work');
  });

  it('preserves full sentence for habit notes even with AI-suggested title', () => {
    // This simulates the case where Cortex might suggest a short title
    // but we want to preserve the full input in notes
    const source: MindDropSource = {
      rawText: 'Start a daily meditation practice for 10 minutes each morning to reduce stress',
      aiTags: ['#meditation', '#mindfulness'],
    };

    const fields = buildMindDropDerivedFields('habit', source);

    // Full sentence should be in notes
    expect(fields.notes).toBe(
      'Start a daily meditation practice for 10 minutes each morning to reduce stress',
    );
    // Same full sentence in name/title by default
    expect(fields.name).toBe(
      'Start a daily meditation practice for 10 minutes each morning to reduce stress',
    );
  });
});
