/**
 * Cortex Explainability Helpers
 *
 * Generates friendly, one-line explanations for Cortex decisions.
 * Tone-aware and Gremly-style (concise, helpful, witty).
 * Phase 11.7+: Updated to match brand voice - calm, witty, intelligent, empathetic
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
 * // "Filed to Fitness 💫"
 */
export function explainFiledToSpace(
  spaceName: string,
  tone: Tone = 'calm',
  _hints?: string[],
): string {
  if (tone === 'warm') {
    return `Filed to ${spaceName} 💫`;
  }

  if (tone === 'direct') {
    return `Filed: ${spaceName}`;
  }

  // calm - brief and clear
  return `Filed to ${spaceName}.`;
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
 * // "Added 🛒"
 * explainAddedToList('Shopping', 'direct')
 * // "Added"
 */
export function explainAddedToList(listName: string, tone: Tone = 'calm'): string {
  if (tone === 'warm') {
    const emoji = getListEmoji(listName);
    // Gremly style: Brief, friendly, emoji for context
    return `Added${emoji ? ' ' + emoji : ' 💫'}`;
  }

  if (tone === 'direct') {
    // Super brief
    return 'Added';
  }

  // calm - brief but clear
  const emoji = getListEmoji(listName);
  return `Added${emoji ? ' ' + emoji : '.'}`;
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
 * // "Got it ✓"
 * explainCreated('habit', 'warm')
 * // "On it 🎯"
 */
export function explainCreated(kind: 'todo' | 'habit' | 'note', tone: Tone = 'calm'): string {
  if (tone === 'warm') {
    // Gremly style: Varied, brief, action-oriented
    const responses = {
      todo: ['Got it ✓', 'All sorted', 'Done and dusted'],
      habit: [
        'On it 🎯',
        "Nice work — that's one less thing buzzing around your brain.",
        'Habit locked in',
      ],
      note: ['Captured 📝', "Saved. It's not going anywhere.", 'Got it'],
    };
    const options = responses[kind];
    return options[Math.floor(Math.random() * options.length)];
  }

  if (tone === 'direct') {
    const responses = {
      todo: 'Done.',
      habit: 'Set.',
      note: 'Saved.',
    };
    return responses[kind];
  }

  // calm - clear and brief
  const responses = {
    todo: 'All sorted.',
    habit: 'On it.',
    note: 'Captured 📝',
  };
  return responses[kind];
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
 * // "Tell me more?"
 */
export function explainAmbiguous(tone: Tone = 'calm', suggestions?: string[]): string {
  if (tone === 'warm') {
    if (suggestions && suggestions.length > 0) {
      return 'A few options here:';
    }
    return 'Tell me more?';
  }

  if (tone === 'direct') {
    return 'Clarify?';
  }

  if (suggestions && suggestions.length > 0) {
    return 'Some options:';
  }

  return 'Break that down for me?';
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
