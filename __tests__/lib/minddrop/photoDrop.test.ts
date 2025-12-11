/**
 * Photo Drop Utilities Tests
 */

import {
  preparePhotoDropText,
  isPhotoOnlyDrop,
  getPhotoDropDefaults,
} from '../../../lib/minddrop/photoDrop';

describe('preparePhotoDropText', () => {
  it('returns trimmed text when content is provided', () => {
    const result = preparePhotoDropText({
      text: '  My photo caption  ',
      photoUris: ['photo1.jpg'],
    });
    expect(result).toBe('My photo caption');
  });

  it('returns "📷 Photo capture" for empty text with 1 photo', () => {
    const result = preparePhotoDropText({
      text: '',
      photoUris: ['photo1.jpg'],
    });
    expect(result).toBe('📷 Photo capture');
  });

  it('returns "📷 Photo capture (3 photos)" for empty text with 3 photos', () => {
    const result = preparePhotoDropText({
      text: '',
      photoUris: ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'],
    });
    expect(result).toBe('📷 Photo capture (3 photos)');
  });

  it('returns photo placeholder for whitespace-only text with photos', () => {
    const result = preparePhotoDropText({
      text: '   ',
      photoUris: ['photo1.jpg', 'photo2.jpg'],
    });
    expect(result).toBe('📷 Photo capture (2 photos)');
  });

  it('returns empty string for empty text with no photos', () => {
    const result = preparePhotoDropText({
      text: '',
      photoUris: [],
    });
    expect(result).toBe('');
  });

  it('returns text content even when no photos attached', () => {
    const result = preparePhotoDropText({
      text: 'Just text, no photos',
      photoUris: [],
    });
    expect(result).toBe('Just text, no photos');
  });
});

describe('isPhotoOnlyDrop', () => {
  it('returns true for empty text + photos', () => {
    const result = isPhotoOnlyDrop({
      text: '',
      photoUris: ['photo1.jpg'],
    });
    expect(result).toBe(true);
  });

  it('returns true for whitespace text + photos', () => {
    const result = isPhotoOnlyDrop({
      text: '   ',
      photoUris: ['photo1.jpg'],
    });
    expect(result).toBe(true);
  });

  it('returns false for text + photos', () => {
    const result = isPhotoOnlyDrop({
      text: 'Caption for photo',
      photoUris: ['photo1.jpg'],
    });
    expect(result).toBe(false);
  });

  it('returns false for text + no photos', () => {
    const result = isPhotoOnlyDrop({
      text: 'Just text',
      photoUris: [],
    });
    expect(result).toBe(false);
  });

  it('returns false for empty text + no photos', () => {
    const result = isPhotoOnlyDrop({
      text: '',
      photoUris: [],
    });
    expect(result).toBe(false);
  });
});

describe('getPhotoDropDefaults', () => {
  it('returns bucket: log', () => {
    const result = getPhotoDropDefaults();
    expect(result.bucket).toBe('log');
  });

  it('returns subtype: general', () => {
    const result = getPhotoDropDefaults();
    expect(result.subtype).toBe('general');
  });

  it('returns confidence: 0.9', () => {
    const result = getPhotoDropDefaults();
    expect(result.confidence).toBe(0.9);
  });

  it('returns all expected fields', () => {
    const result = getPhotoDropDefaults();
    expect(result).toEqual({
      bucket: 'log',
      subtype: 'general',
      confidence: 0.9,
    });
  });
});
