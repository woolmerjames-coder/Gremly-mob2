/**
 * Tests for getEffectiveTags - Unified tag extraction pipeline
 *
 * Strategy:
 * 1. Always runs V2 extraction for name detection (@mentions)
 * 2. Tries AI extraction for additional topic tags
 * 3. Merges: V2 names (@mentions) + AI topic tags (filtered against names)
 * 4. If AI fails, falls back to V2 entirely
 */

import { getEffectiveTags } from '../getEffectiveTags';

// Mock extractTagsAI
jest.mock('../extractTagsAI', () => ({
  extractTagsAI: jest.fn(),
}));

// Mock extractTagsV2 to control the test
jest.mock('../extractTagsV2', () => ({
  extractTagsV2: jest.fn(),
  tagsToArray: jest.fn(),
}));

const { extractTagsAI } = require('../extractTagsAI');
const { extractTagsV2, tagsToArray } = require('../extractTagsV2');

describe('getEffectiveTags', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default V2 mock - returns empty result
    extractTagsV2.mockReturnValue({ mentions: [], keywords: [], themes: [] });
    tagsToArray.mockReturnValue([]);
  });

  it('should merge AI tags with V2 mentions', async () => {
    // V2 detects name "john"
    extractTagsV2.mockReturnValue({ mentions: ['john'], keywords: [], themes: [] });
    // AI returns topic tags
    extractTagsAI.mockResolvedValue(['contract', 'business']);

    const result = await getEffectiveTags('Email John about the contract');

    expect(result).toEqual(['@john', 'contract', 'business']);
  });

  it('should filter AI tags that match V2 mentions', async () => {
    // V2 detects name "sarah"
    extractTagsV2.mockReturnValue({ mentions: ['sarah'], keywords: [], themes: [] });
    // AI returns both "sarah" (duplicate) and "meeting"
    extractTagsAI.mockResolvedValue(['sarah', 'meeting']);

    const result = await getEffectiveTags('Meeting with Sarah');

    // "sarah" should be filtered from AI tags since V2 already has @sarah
    expect(result).toEqual(['@sarah', 'meeting']);
  });

  it('should use V2 fallback when AI returns empty', async () => {
    extractTagsV2.mockReturnValue({ mentions: ['mike'], keywords: ['project'], themes: [] });
    tagsToArray.mockReturnValue(['@mike', '#project']);
    extractTagsAI.mockResolvedValue([]);

    const result = await getEffectiveTags('Project update from Mike');

    // Falls back to full V2 extraction
    expect(result).toEqual(['@mike', '#project']);
    expect(tagsToArray).toHaveBeenCalled();
  });

  it('should use V2 fallback when AI fails with exception', async () => {
    extractTagsV2.mockReturnValue({ mentions: [], keywords: ['park'], themes: [] });
    tagsToArray.mockReturnValue(['#park']);
    extractTagsAI.mockRejectedValue(new Error('Network error'));

    const result = await getEffectiveTags('Walk in the park');

    expect(result).toEqual(['#park']);
  });

  it('should handle empty text', async () => {
    const result = await getEffectiveTags('');

    expect(result).toEqual([]);
    expect(extractTagsV2).not.toHaveBeenCalled();
    expect(extractTagsAI).not.toHaveBeenCalled();
  });

  it('should handle whitespace-only text', async () => {
    const result = await getEffectiveTags('   \n  \t  ');

    expect(result).toEqual([]);
    expect(extractTagsV2).not.toHaveBeenCalled();
    expect(extractTagsAI).not.toHaveBeenCalled();
  });

  it('should always run V2 for name detection', async () => {
    extractTagsV2.mockReturnValue({ mentions: [], keywords: [], themes: [] });
    extractTagsAI.mockResolvedValue(['test']);

    await getEffectiveTags('Test text');

    expect(extractTagsV2).toHaveBeenCalledWith('Test text', { maxKeywords: 4 });
  });

  it('should deduplicate merged results', async () => {
    extractTagsV2.mockReturnValue({ mentions: ['john'], keywords: [], themes: [] });
    // AI returns duplicate @john
    extractTagsAI.mockResolvedValue(['@john', 'contract']);

    const result = await getEffectiveTags('Email John about contract');

    // Should deduplicate
    expect(result.filter((t: string) => t === '@john').length).toBe(1);
  });
});
