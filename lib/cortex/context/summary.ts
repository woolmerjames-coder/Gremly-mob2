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
  if (turns.length === 0) {
    return prevSummary;
  }

  // Extract key information from new turns
  const userMessages = turns.filter((t) => t.role === 'user').map((t) => t.text);
  const assistantMessages = turns.filter((t) => t.role === 'assistant').map((t) => t.text);

  // Build summary components
  const summaryParts: string[] = [];

  // Include previous summary if exists (trim to first 200 chars)
  if (prevSummary && prevSummary.trim()) {
    summaryParts.push(prevSummary.trim().substring(0, 200));
  }

  // Compress user intents (extract key topics)
  if (userMessages.length > 0) {
    const topics = extractTopics(userMessages);
    if (topics.length > 0) {
      summaryParts.push(`User discussed: ${topics.join(', ')}.`);
    }
  }

  // Include assistant responses (keep last 1-2)
  if (assistantMessages.length > 0) {
    const recentAssistant = assistantMessages.slice(-2).join(' ');
    if (recentAssistant.length > 0) {
      summaryParts.push(`Assistant: ${recentAssistant.substring(0, 150)}.`);
    }
  }

  // Join and limit total length (~350 tokens ≈ 1400 chars)
  const summary = summaryParts.join(' ').trim();
  return summary.substring(0, 1400);
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
