/**
 * Tests for extractTagsAI - AI-powered tag extraction
 */

import { extractTagsAI } from '../extractTagsAI';

// Mock the CortexClient
jest.mock('../../cortex/CortexClient', () => ({
  callClassify: jest.fn(),
}));

const { callClassify } = require('../../cortex/CortexClient');

describe('extractTagsAI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract tags from valid JSON array response', async () => {
    callClassify.mockResolvedValue({
      ok: true,
      id: 'test-id',
      classification: {
        category: '["dentist", "appointment", "healthcare"]',
        tags: [],
        spaceName: null,
        confidence: 0.9,
        title: null,
      },
    });

    const result = await extractTagsAI('Book dentist appointment for next week');

    expect(result).toEqual(['dentist', 'appointment', 'healthcare']);
    expect(callClassify).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMs: 3000,
      }),
    );
  });

  it('should use tags field if category is not JSON', async () => {
    callClassify.mockResolvedValue({
      ok: true,
      id: 'test-id',
      classification: {
        category: 'activities',
        tags: ['running', 'exercise', 'morning'],
        spaceName: null,
        confidence: 0.85,
        title: null,
      },
    });

    const result = await extractTagsAI('Going for a morning run');

    expect(result).toEqual(['running', 'exercise', 'morning']);
  });

  it('should deduplicate tags', async () => {
    callClassify.mockResolvedValue({
      ok: true,
      id: 'test-id',
      classification: {
        category: '["dentist", "DENTIST", "appointment", "dentist"]',
        tags: [],
        spaceName: null,
        confidence: 0.9,
        title: null,
      },
    });

    const result = await extractTagsAI('Dentist appointment');

    expect(result).toEqual(['dentist', 'appointment']);
  });

  it('should enforce max 6 tags', async () => {
    callClassify.mockResolvedValue({
      ok: true,
      id: 'test-id',
      classification: {
        category: '["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"]',
        tags: [],
        spaceName: null,
        confidence: 0.9,
        title: null,
      },
    });

    const result = await extractTagsAI('Test text with many tags');

    expect(result.length).toBeLessThanOrEqual(6);
  });

  it('should filter out invalid characters', async () => {
    callClassify.mockResolvedValue({
      ok: true,
      id: 'test-id',
      classification: {
        category: '["valid-tag", "invalid@tag", "good_tag!", "another"]',
        tags: [],
        spaceName: null,
        confidence: 0.9,
        title: null,
      },
    });

    const result = await extractTagsAI('Test text');

    // Should only include tags with valid characters
    expect(result).toContain('valid-tag');
    expect(result).toContain('another');
    expect(result.every((tag) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(tag))).toBe(true);
  });

  it('should filter out tags shorter than 3 characters', async () => {
    callClassify.mockResolvedValue({
      ok: true,
      id: 'test-id',
      classification: {
        category: '["dentist", "ab", "x", "appointment"]',
        tags: [],
        spaceName: null,
        confidence: 0.9,
        title: null,
      },
    });

    const result = await extractTagsAI('Test text');

    expect(result).not.toContain('ab');
    expect(result).not.toContain('x');
    expect(result).toContain('dentist');
    expect(result).toContain('appointment');
  });

  it('should return empty array on AI failure', async () => {
    callClassify.mockResolvedValue({
      ok: false,
      error: 'timeout',
    });

    const result = await extractTagsAI('Test text');

    expect(result).toEqual([]);
  });

  it('should return empty array on invalid JSON', async () => {
    callClassify.mockResolvedValue({
      ok: true,
      id: 'test-id',
      classification: {
        category: 'not valid json [',
        tags: [],
        spaceName: null,
        confidence: 0.9,
        title: null,
      },
    });

    const result = await extractTagsAI('Test text');

    expect(result).toEqual([]);
  });

  it('should return empty array on non-array response', async () => {
    callClassify.mockResolvedValue({
      ok: true,
      id: 'test-id',
      classification: {
        category: '{"tags": "not-an-array"}',
        tags: [],
        spaceName: null,
        confidence: 0.9,
        title: null,
      },
    });

    const result = await extractTagsAI('Test text');

    expect(result).toEqual([]);
  });

  it('should handle exceptions gracefully', async () => {
    callClassify.mockRejectedValue(new Error('Network error'));

    const result = await extractTagsAI('Test text');

    expect(result).toEqual([]);
  });

  it('should normalize tags to lowercase', async () => {
    callClassify.mockResolvedValue({
      ok: true,
      id: 'test-id',
      classification: {
        category: '["Dentist", "APPOINTMENT", "HealthCare"]',
        tags: [],
        spaceName: null,
        confidence: 0.9,
        title: null,
      },
    });

    const result = await extractTagsAI('Test text');

    expect(result).toEqual(['dentist', 'appointment', 'healthcare']);
  });

  it('should strip punctuation except hyphens', async () => {
    callClassify.mockResolvedValue({
      ok: true,
      id: 'test-id',
      classification: {
        category: '["email-server", "work!", "meeting?"]',
        tags: [],
        spaceName: null,
        confidence: 0.9,
        title: null,
      },
    });

    const result = await extractTagsAI('Test text');

    expect(result).toContain('email-server');
    expect(result).toContain('work');
    expect(result).toContain('meeting');
  });

  it('should handle empty text', async () => {
    const result = await extractTagsAI('');

    expect(result).toEqual([]);
    expect(callClassify).not.toHaveBeenCalled();
  });

  it('should limit text sent to AI to 500 characters', async () => {
    callClassify.mockResolvedValue({
      ok: true,
      id: 'test-id',
      classification: {
        category: '["test"]',
        tags: [],
        spaceName: null,
        confidence: 0.9,
        title: null,
      },
    });

    const longText = 'a'.repeat(1000);
    await extractTagsAI(longText);

    expect(callClassify).toHaveBeenCalledWith(
      expect.objectContaining({
        text: longText.slice(0, 500),
        timeoutMs: 3000,
      }),
    );
  });
});
