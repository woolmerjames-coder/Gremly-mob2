/**
 * Phase 10.7D: Context & Memory Helpers
 * Phase 10.7E: Enhanced context building with database integration
 * Build context windows and maintain running summaries
 */

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatContext {
  messages: ChatTurn[];
  summary?: string;
  windowSize: number;
  summaryLength: number;
}

/**
 * Build chat context for a space by fetching messages from database
 * Phase 10.7E: Pulls messages for the space, slices to maxContext, includes running summary
 */
export async function buildChatContext(options: {
  spaceId: string;
  chatId?: string;
  repo?: any; // IRepo interface
  max?: number;
  runningSummary?: string | null;
}): Promise<ChatContext> {
  const max = options.max ?? parseInt(process.env.EXPO_PUBLIC_CHAT_MAX_CONTEXT || '8', 10);

  // If no repo provided, return empty context
  if (!options.repo || !options.chatId) {
    return {
      messages: [],
      summary: options.runningSummary || undefined,
      windowSize: 0,
      summaryLength: options.runningSummary?.length || 0,
    };
  }

  try {
    // Fetch messages from database
    const dbMessages = await options.repo.spaceChatMessages.list(options.chatId);

    // Convert to ChatTurn format, newest first
    const turns: ChatTurn[] = dbMessages
      .sort((a: any, b: any) => {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        return bTime - aTime; // Newest first
      })
      .map((msg: any) => ({
        role: msg.role as 'user' | 'assistant',
        text: msg.content || '',
      }));

    // Slice to last N turns (reverse since we sorted newest first)
    const contextWindow = turns.slice(0, max).reverse();

    // Initialize or use existing summary
    let summary = options.runningSummary || undefined;
    if (!summary && turns.length > 2) {
      summary = await summarize(contextWindow);
    }

    return {
      messages: contextWindow,
      summary,
      windowSize: contextWindow.length,
      summaryLength: summary?.length || 0,
    };
  } catch (error) {
    if (__DEV__) {
      console.error('[CORTEX][10.7E] Failed to build chat context:', error);
    }
    // Return empty context on error
    return {
      messages: [],
      summary: options.runningSummary || undefined,
      windowSize: 0,
      summaryLength: options.runningSummary?.length || 0,
    };
  }
}

/**
 * Build context window from recent messages
 * Takes last N messages (default 8) for context
 */
export function buildContextWindow(messages: ChatTurn[], maxTurns: number = 8): ChatTurn[] {
  // Take last N turns
  return messages.slice(-maxTurns);
}

/**
 * Summarize messages into a compact running summary
 * Target: ~700 characters max
 */
export async function summarize(messages: ChatTurn[]): Promise<string> {
  if (messages.length === 0) {
    return '';
  }

  // Simple extractive summarization for now
  // In production, this could call an LLM for abstractive summary
  const topics: string[] = [];
  const keywords = new Set<string>();

  for (const msg of messages) {
    // Extract key phrases (capitalized words, quoted text, short messages)
    const text = msg.text;

    // Quoted text
    const quotes = text.match(/"([^"]+)"/g);
    if (quotes) {
      quotes.forEach((q) => topics.push(q.replace(/"/g, '')));
    }

    // Short messages (likely important)
    if (text.length < 50 && msg.role === 'user') {
      topics.push(text);
    }

    // Keywords (nouns, verbs)
    const words = text.toLowerCase().split(/\W+/);
    const importantWords = words.filter(
      (w) =>
        w.length > 4 &&
        !['about', 'would', 'could', 'should', 'there', 'their', 'these', 'those'].includes(w),
    );
    importantWords.forEach((w) => keywords.add(w));
  }

  // Build summary
  let summary = '';

  if (topics.length > 0) {
    summary += 'Topics: ' + topics.slice(0, 5).join(', ') + '. ';
  }

  if (keywords.size > 0) {
    summary += 'Key terms: ' + Array.from(keywords).slice(0, 10).join(', ') + '.';
  }

  // Truncate to ~700 chars
  return summary.substring(0, 700);
}

/**
 * Update running summary with new messages
 * Maintains summary at ~700 chars by compressing older content
 */
export function updateRunningSummary(prevSummary: string | null, newMessages: ChatTurn[]): string {
  if (!newMessages || newMessages.length === 0) {
    return prevSummary || '';
  }

  // For now, just take recent topics
  // In production, this would intelligently merge with previous summary
  const recentTopics = newMessages
    .filter((m) => m.role === 'user')
    .map((m) => m.text)
    .slice(-3)
    .join('; ');

  let summary = prevSummary || '';

  if (summary.length > 400) {
    // Compress old summary if getting too long
    summary = summary.substring(0, 300) + '...';
  }

  summary += (summary ? ' Recent: ' : '') + recentTopics;

  // Truncate to 700 chars
  return summary.substring(0, 700);
}

/**
 * Check if user is explicitly asking to create something
 * Used to bypass cooldown
 */
export function hasExplicitCreationIntent(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(add|save|create|make this a|turn this into|remind me|capture this|write down)\b/i.test(
    t,
  );
}

/**
 * Check if user is affirming a previous suggestion
 * "Would you like me to...?" followed by "yes/ok/sure"
 */
export function isAffirmation(text: string): boolean {
  const t = text.trim().toLowerCase();
  const affirmations = ['yes', 'yeah', 'yep', 'ok', 'okay', 'sure', 'please', 'go ahead', 'do it'];
  return affirmations.includes(t);
}
