/**
 * Tag Quality Filter
 *
 * Filters out low-quality AI-generated tags that aren't useful for users.
 * Examples: "been", "bit", "down", "actually", "build", "doable"
 */

const BAD_TAGS = new Set(['been', 'bit', 'down', 'actually', 'build', 'doable']);

/**
 * Check if a tag is good quality and should be kept
 *
 * Filters out:
 * - Empty/null tags
 * - Very short tags (< 3 characters)
 * - Known bad tags (been, bit, down, actually, build, doable)
 *
 * @param raw - Raw tag string to validate
 * @returns true if tag should be kept, false if it should be filtered out
 */
export function isGoodTag(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const tag = raw.trim();
  if (!tag) return false;

  const lc = tag.toLowerCase();

  // Very short = usually junk (we can add allow-list later if needed)
  if (lc.length < 3) return false;

  if (BAD_TAGS.has(lc)) return false;

  return true;
}
