/**
 * Cortex Explainability Helpers
 *
 * Generates friendly, one-line explanations for Cortex decisions.
 * Tone-aware and Gremly-style (concise, helpful, slightly playful).
 */

/**
 * Explanation tone
 * - 'calm': Neutral, matter-of-fact
 * - 'warm': Friendly, encouraging
 * - 'direct': Brief, no fluff
 */
export type Tone = 'calm' | 'warm' | 'direct';

/**
 * Explain that an item was filed to a specific space
 *
 * @param spaceName - Name of the space the item was filed to
 * @param tone - Explanation tone (default: 'calm')
 * @param hints - Optional contextual hints from the engine (e.g., "you mentioned running")
 * @returns Friendly explanation string
 *
 * @example
 * explainFiledToSpace('Fitness', 'warm', ['you mentioned running'])
 * // "Filed to Fitness (you mentioned running) ✨"
 */
export function explainFiledToSpace(
  spaceName: string,
  tone: Tone = 'calm',
  hints?: string[],
): string {
  const base = `Filed to ${spaceName}`;

  if (hints && hints.length > 0) {
    const hintText = hints[0]; // Use first hint for brevity
    if (tone === 'warm') {
      return `${base} (${hintText}) ✨`;
    }
    return `${base} (${hintText}).`;
  }

  if (tone === 'warm') {
    return `${base} ✨`;
  }
  if (tone === 'direct') {
    return base;
  }
  return `${base}.`;
}

/**
 * Explain that an item was added to a list
 *
 * @param listName - Name of the list (e.g., "Shopping", "Reading")
 * @param tone - Explanation tone (default: 'calm')
 * @returns Friendly explanation string
 *
 * @example
 * explainAddedToList('Shopping', 'warm')
 * // "Added to Shopping list 🛒"
 */
export function explainAddedToList(listName: string, tone: Tone = 'calm'): string {
  const emoji = tone === 'warm' ? getListEmoji(listName) : '';

  if (tone === 'direct') {
    return `Added to ${listName}`;
  }

  return `Added to ${listName} list${emoji ? ' ' + emoji : ''}`;
}

/**
 * Explain that a new item was created
 *
 * @param kind - Type of item created
 * @param tone - Explanation tone (default: 'calm')
 * @returns Friendly explanation string
 *
 * @example
 * explainCreated('todo', 'warm')
 * // "Todo created ✓"
 */
export function explainCreated(kind: 'todo' | 'habit' | 'note', tone: Tone = 'calm'): string {
  const kindLabel = kind.charAt(0).toUpperCase() + kind.slice(1);

  if (tone === 'warm') {
    const emoji = kind === 'todo' ? '✓' : kind === 'habit' ? '🎯' : '📝';
    return `${kindLabel} created ${emoji}`;
  }

  if (tone === 'direct') {
    return `${kindLabel} created`;
  }

  return `${kindLabel} created.`;
}

/**
 * Explain that the input was ambiguous and needs clarification
 *
 * @param tone - Explanation tone (default: 'calm')
 * @param suggestions - Optional list of suggested actions
 * @returns Friendly explanation string
 *
 * @example
 * explainAmbiguous('warm', ['File to Fitness?', 'Add to Shopping list?'])
 * // "Not quite sure—here are some ideas:"
 */
export function explainAmbiguous(tone: Tone = 'calm', suggestions?: string[]): string {
  if (tone === 'warm') {
    if (suggestions && suggestions.length > 0) {
      return 'Not quite sure—here are some ideas:';
    }
    return 'Hmm, not quite sure what you meant—want to clarify?';
  }

  if (tone === 'direct') {
    return 'Need clarification';
  }

  if (suggestions && suggestions.length > 0) {
    return 'Unclear—see suggestions below:';
  }

  return 'Saving to Catch-All for now.';
}

/**
 * Get contextual emoji for list types
 * @internal
 */
function getListEmoji(listName: string): string {
  const normalized = listName.toLowerCase();

  if (normalized.includes('shop')) return '🛒';
  if (normalized.includes('read')) return '📚';
  if (normalized.includes('pack')) return '🎒';
  if (normalized.includes('watch')) return '📺';
  if (normalized.includes('music')) return '🎵';

  return '';
}
