/**
 * Tests for getEffectiveTags - Unified tag extraction pipeline
 */

import { getEffectiveTags } from '../getEffectiveTags';

// Mock both extractors
jest.mock('../extractTagsAI', () => ({
  extractTagsAI: jest.fn(),
}));

jest.mock('../extractTags', () => ({
  extractMeaningfulTags: jest.fn(),
}));

const { extractTagsAI } = require('../extractTagsAI');
const { extractMeaningfulTags } = require('../extractTags');

describe('getEffectiveTags', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should use AI tags when AI succeeds', async () => {
    extractTagsAI.mockResolvedValue(['dentist', 'appointment']);
    extractMeaningfulTags.mockReturnValue(['fallback-tag']);

    const result = await getEffectiveTags('Book dentist appointment');

    expect(result).toEqual(['dentist', 'appointment']);
    expect(extractTagsAI).toHaveBeenCalledWith('Book dentist appointment');
    expect(extractMeaningfulTags).not.toHaveBeenCalled();
  });

  it('should use fallback when AI returns empty', async () => {
    extractTagsAI.mockResolvedValue([]);
    extractMeaningfulTags.mockReturnValue(['meeting', 'office']);

    const result = await getEffectiveTags('Meeting at the office');

    expect(result).toEqual(['meeting', 'office']);
    expect(extractTagsAI).toHaveBeenCalled();
    expect(extractMeaningfulTags).toHaveBeenCalledWith('Meeting at the office');
  });

  it('should use fallback when AI fails with exception', async () => {
    extractTagsAI.mockRejectedValue(new Error('Network error'));
    extractMeaningfulTags.mockReturnValue(['walk', 'park']);

    const result = await getEffectiveTags('Walk in the park');

    expect(result).toEqual(['walk', 'park']);
    expect(extractMeaningfulTags).toHaveBeenCalled();
  });

  it('should handle empty text', async () => {
    const result = await getEffectiveTags('');

    expect(result).toEqual([]);
    expect(extractTagsAI).not.toHaveBeenCalled();
    expect(extractMeaningfulTags).not.toHaveBeenCalled();
  });

  it('should handle whitespace-only text', async () => {
    const result = await getEffectiveTags('   \n  \t  ');

    expect(result).toEqual([]);
    expect(extractTagsAI).not.toHaveBeenCalled();
    expect(extractMeaningfulTags).not.toHaveBeenCalled();
  });

  it('should allow empty result from both extractors', async () => {
    extractTagsAI.mockResolvedValue([]);
    extractMeaningfulTags.mockReturnValue([]);

    const result = await getEffectiveTags('I feel good today');

    expect(result).toEqual([]);
  });

  it('should prioritize AI over fallback', async () => {
    extractTagsAI.mockResolvedValue(['ai-tag']);
    extractMeaningfulTags.mockReturnValue(['fallback-tag']);

    const result = await getEffectiveTags('Test text');

    expect(result).toEqual(['ai-tag']);
    expect(extractMeaningfulTags).not.toHaveBeenCalled();
  });

  it('should pass text to AI extractor unchanged', async () => {
    extractTagsAI.mockResolvedValue(['test']);

    const longText = 'This is a longer piece of text with multiple words';
    await getEffectiveTags(longText);

    expect(extractTagsAI).toHaveBeenCalledWith(longText);
  });

  it('should pass text to fallback extractor when AI fails', async () => {
    extractTagsAI.mockResolvedValue([]);
    extractMeaningfulTags.mockReturnValue(['test']);

    const text = 'Test text for fallback';
    await getEffectiveTags(text);

    expect(extractMeaningfulTags).toHaveBeenCalledWith(text);
  });

  it('should handle AI timeout gracefully', async () => {
    extractTagsAI.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 100)),
    );
    extractMeaningfulTags.mockReturnValue(['fallback']);

    const result = await getEffectiveTags('Test');

    expect(result).toEqual(['fallback']);
  });
});
