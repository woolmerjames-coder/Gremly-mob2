/**
 * Photo Drop Utilities
 *
 * Helpers for handling photo-only or photo-attached mind drops.
 * Photo drops get special treatment since they're almost always logs.
 */

import { MindDropBucket, LogSubtype } from './types';

/**
 * Context for a photo drop
 */
export interface PhotoDropContext {
  /** Array of photo URIs attached to the drop */
  photoUris: string[];
  /** Text content (may be empty for photo-only drops) */
  text: string;
}

/**
 * Prepare display text for a photo drop.
 * Returns user text if provided, otherwise generates placeholder text.
 *
 * @param context - Photo drop context with URIs and text
 * @returns Display text for the drop
 */
export function preparePhotoDropText(context: PhotoDropContext): string {
  const trimmedText = context.text.trim();

  if (trimmedText) {
    return trimmedText;
  }

  if (context.photoUris.length === 1) {
    return '📷 Photo capture';
  }

  if (context.photoUris.length > 1) {
    return `📷 Photo capture (${context.photoUris.length} photos)`;
  }

  return '';
}

/**
 * Check if a drop is photo-only (no text content).
 *
 * @param context - Photo drop context
 * @returns True if the drop has photos but no text
 */
export function isPhotoOnlyDrop(context: PhotoDropContext): boolean {
  return context.text.trim() === '' && context.photoUris.length > 0;
}

/**
 * Get default classification for photo-only drops.
 * Photo-only drops are always logs since they're captures/memories.
 *
 * @returns Default bucket, subtype, and confidence for photo drops
 */
export function getPhotoDropDefaults(): {
  bucket: MindDropBucket;
  subtype: LogSubtype;
  confidence: number;
} {
  // Photo-only drops are always logs - they're captures/memories
  return {
    bucket: 'log',
    subtype: 'general',
    confidence: 0.9,
  };
}
