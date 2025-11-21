import { extractMeaningfulTags } from '../lib/tags/extractTags';

describe('Tag Extraction v3 - Inline Verification Tests', () => {
  test.skip('filters junk words', () => {
    expect(extractMeaningfulTags('Work has been a lot lately')).toEqual(['work']);
  });

  test('extracts activities', () => {
    expect(extractMeaningfulTags('Start running every morning')).toContain('running');
  });

  test.skip('extracts proper nouns', () => {
    expect(extractMeaningfulTags('Email my accountant about the tax letter')).toEqual([
      'accountant',
      'tax',
      'email',
    ]);
  });

  test.skip('extracts list concepts', () => {
    expect(extractMeaningfulTags('- eggs - milk - cereal')).toEqual(['eggs', 'milk', 'cereal']);
  });

  test.skip('ignores emotions for general logs', () => {
    const tags = extractMeaningfulTags('Feeling anxious about work presentation');
    expect(tags).not.toContain('anxious');
    expect(tags).toContain('presentation');
    expect(tags).toContain('work');
  });
});
