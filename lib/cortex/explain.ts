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
 * // "Popped this into Fitness for you 💫 (you mentioned running)"
 */
export function explainFiledToSpace(
  spaceName: string,
  tone: Tone = 'calm',
  hints?: string[],
): string {
  const hintText = hints && hints.length > 0 ? ` (${hints[0]})` : '';

  if (tone === 'warm') {
    return `Popped this into ${spaceName} for you 💫${hintText}`;
  }

  if (tone === 'direct') {
    return `Filed: ${spaceName}${hintText}`;
  }

  // calm
  return `Filed to ${spaceName}${hintText ? hintText + '.' : '.'}`;
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
 * // "Added to Shopping 🛒"
 * explainAddedToList('Shopping', 'direct')
 * // "Shopping: added"
 */
export function explainAddedToList(listName: string, tone: Tone = 'calm'): string {
  if (tone === 'warm') {
    const emoji = getListEmoji(listName);
    return `Added to ${listName}${emoji ? ' ' + emoji : ' 💫'}`;
  }

  if (tone === 'direct') {
    return `${listName}: added`;
  }

  // calm
  return `Added to ${listName}.`;
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
