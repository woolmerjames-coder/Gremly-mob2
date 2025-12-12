/**
 * ID Generation Utilities for Mind Drop
 *
 * Generates unique identifiers for drops and submissions.
 * Uses crypto.randomUUID when available, with fallback for older environments.
 */

/**
 * Generate a UUID v4 string.
 * Uses native crypto.randomUUID if available, otherwise falls back to manual implementation.
 */
function generateUUID(): string {
  // Use native crypto.randomUUID if available (modern browsers, Node 19+)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback: manual UUID v4 generation
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  // Where x is random hex, 4 is version, y is variant (8, 9, a, or b)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Generate a unique drop ID for tracking mind drops.
 * Returns a plain UUID v4 for database compatibility (drop_id column is UUID type).
 *
 * @returns A unique drop ID string (e.g., 'a1b2c3d4-e5f6-4789-abcd-ef1234567890')
 */
export function generateDropId(): string {
  return generateUUID();
}

/**
 * Generate a unique submission ID for tracking API submissions.
 * Format: 'sub-{uuid}' for easy identification in logs and debugging.
 *
 * @returns A unique submission ID string (e.g., 'sub-a1b2c3d4-e5f6-4789-abcd-ef1234567890')
 */
export function generateSubmissionId(): string {
  return `sub-${generateUUID()}`;
}

// UUID v4 format regex: 8-4-4-4-12 hex characters with version 4 marker
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid drop ID (UUID v4 format).
 *
 * @param id - The ID string to validate
 * @returns True if the ID is a valid UUID v4 format
 */
export function isValidDropId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }

  return UUID_REGEX.test(id);
}
