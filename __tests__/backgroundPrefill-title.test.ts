/**
 * Test BackgroundPrefill title computation for logs
 */

import { computePrefillTitle } from '../lib/minddrop/backgroundPrefill';

describe('BackgroundPrefill - Title Computation', () => {
  describe('computePrefillTitle', () => {
    it('should prefer AI title when available', () => {
      const result = computePrefillTitle({
        entityType: 'note',
        originalTitle: 'Long original title here',
        body: 'Just thinking about maybe starting a side hustle someday',
        aiTitle: 'Side Hustle Idea',
      });

      expect(result).toBe('Side Hustle Idea');
    });

    it('should generate fallback title from body when AI title is null', () => {
      const result = computePrefillTitle({
        entityType: 'note',
        originalTitle: 'Just thinking about maybe starting a side hustle someday',
        body: 'Just thinking about maybe starting a side hustle someday',
        aiTitle: null,
      });

      // Should strip "Just thinking about" and limit to 6 words
      expect(result).toBeTruthy();
      expect(result).not.toContain('Just thinking');
      expect(result?.split(' ').length).toBeLessThanOrEqual(6);
    });

    it('should strip "Just thinking about" prefix', () => {
      const result = computePrefillTitle({
        entityType: 'note',
        originalTitle: 'Just thinking about starting a podcast',
        body: 'Just thinking about starting a podcast',
        aiTitle: null,
      });

      expect(result).toBe('Starting a podcast');
    });

    it('should handle "Maybe" prefix', () => {
      const result = computePrefillTitle({
        entityType: 'note',
        originalTitle: 'Maybe starting a side hustle someday',
        body: 'Maybe starting a side hustle someday',
        aiTitle: null,
      });

      expect(result).toBeTruthy();
      expect(result).not.toContain('Maybe');
    });

    it('should limit to 6 words', () => {
      const result = computePrefillTitle({
        entityType: 'note',
        originalTitle: 'This is a very long title that should definitely be shortened',
        body: 'This is a very long title that should definitely be shortened',
        aiTitle: null,
      });

      const wordCount = result?.split(' ').length || 0;
      expect(wordCount).toBeLessThanOrEqual(6);
    });

    it('should apply sentence case', () => {
      const result = computePrefillTitle({
        entityType: 'note',
        originalTitle: 'starting a SIDE HUSTLE',
        body: 'starting a SIDE HUSTLE',
        aiTitle: null,
      });

      expect(result).toBe('Starting a side hustle');
    });

    it('should return undefined when no source text available', () => {
      const result = computePrefillTitle({
        entityType: 'note',
        originalTitle: '',
        body: '',
        aiTitle: null,
      });

      expect(result).toBeUndefined();
    });
  });
});
