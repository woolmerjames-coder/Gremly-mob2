/**
 * Phase 10.7B: Running Summary Compressor
 * Simple abstractive compression of conversation history
 */

export interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * Update running summary with new conversation turns
 * Uses simple heuristic compression (abstractive)
 * @param threadId - Chat thread identifier
 * @param turns - New turns to incorporate
 * @param prevSummary - Previous summary (if any)
 * @returns Updated summary (<=350 tokens estimated)
 */
export function updateRunningSummary(
  threadId: string,
  turns: ConversationTurn[],
  prevSummary: string,
): string {
  if (!turns || turns.length === 0) {
    return prevSummary || '';
  }

  // Build a compact additive summary from the new turns
  const additions = turns.map((t) => `${t.role}: ${t.text}`).join(' ');
  let combined = [prevSummary, additions].filter(Boolean).join(' ').trim();

  // Enforce the 1400 char limit (~350 tokens), keeping the most recent content
  if (combined.length > 1400) {
    combined = combined.slice(combined.length - 1400).trim();
  }

  return combined || '';
}

/**
 * Extract key topics from user messages
 * Simple heuristic: nouns, verbs, important phrases
 */
function extractTopics(messages: string[]): string[] {
  const topics = new Set<string>();

  // Common important keywords
  const keywords = [
    'habit',
    'todo',
    'task',
    'note',
    'remember',
    'question',
    'exercise',
    'run',
    'gym',
    'cancel',
    'meditation',
    'routine',
    'daily',
    'weekly',
    'goal',
    'plan',
    'idea',
    'reflection',
  ];

  for (const msg of messages) {
    const lower = msg.toLowerCase();

    // Extract keywords
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        topics.add(keyword);
      }
    }

    // Extract quoted phrases
    const quotedMatches = msg.match(/"([^"]+)"/g);
    if (quotedMatches) {
      quotedMatches.forEach((q) => topics.add(q.replace(/"/g, '')));
    }

    // If short message, include whole thing
    if (msg.length < 50 && msg.length > 5) {
      topics.add(msg.trim());
    }
  }

  return Array.from(topics).slice(0, 8); // Max 8 topics
}
