/**
 * Phase 10.7D: Context & Memory Helpers
 * Phase 10.7E: Enhanced context building with database integration
 * Phase 10.10B: Space-aware prompts and metadata injection
 * Build context windows and maintain running summaries
 */

import { getPersonaPrompt } from '../persona/prompt';

/**
 * Safely unwrap repo results that might be undefined, null, array, or {list: []}
 * Phase 10.7E: Defensive helper to prevent "Cannot read property 'list' of undefined"
 */
function asList<T>(input: any): T[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (Array.isArray(input.list)) return input.list as T[];
  if (Array.isArray(input.items)) return input.items as T[];
  return [];
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatContext {
  messages: ChatTurn[];
  summary?: string;
  windowSize: number;
  summaryLength: number;
  systemPrompt?: string;
  space?: {
    id?: string;
    name?: string | null;
    icon?: string | null;
    theme?: string | null;
    tags?: string[];
    people?: string[];
  };
}

/**
 * Build chat context for a space by fetching messages from database
 * Phase 10.7E: Pulls messages for the space, slices to maxContext, includes running summary
 */
export async function buildChatContext(options: {
  spaceId: string;
  repo: any; // IRepo interface with spaceChatMessages
  maxContext?: number;
  runningSummary?: string | null;
}): Promise<ChatContext> {
  const maxContext =
    options.maxContext ?? parseInt(process.env.EXPO_PUBLIC_CHAT_MAX_CONTEXT || '8', 10);

  try {
    // Defensive check: Ensure repo has the required method
    const listFn = options.repo?.spaceChatMessages?.list;
    if (!listFn) {
      if (__DEV__) {
        console.warn('[CORTEX][10.7E] repo.spaceChatMessages.list not available');
      }
      return {
        messages: [],
        summary: undefined,
        windowSize: 0,
        summaryLength: 0,
      };
    }

    // Fetch messages from database - fetch more than needed, we'll trim
    const raw = await listFn(options.spaceId, { limit: Math.max(maxContext * 2, 12) });
    const rows = asList<any>(raw);

    // Convert to ChatTurn format, filtering empty content
    const messages: ChatTurn[] = rows
      .map((r: any) => ({
        role: (r.role === 'system' ? 'user' : r.role) as 'user' | 'assistant', // Treat system as user
        text: typeof r.content === 'string' ? r.content : JSON.stringify(r.content ?? ''),
      }))
      .filter((m: ChatTurn) => m.text && m.text.trim().length > 0);

    // Keep only the last N turns (messages already in chronological order from repo)
    const trimmed = messages.slice(-maxContext);

    const repoAny = options.repo as any;

    // Load supplemental space context in parallel (best-effort, failures fall back silently)
    const [spaceRecord, latestSummary, linkedTags, linkedPeople] = await Promise.all([
      typeof repoAny?.getSpaceById === 'function'
        ? repoAny.getSpaceById(options.spaceId).catch(() => null)
        : Promise.resolve(null),
      typeof repoAny?.getLatestSpaceInsight === 'function'
        ? repoAny.getLatestSpaceInsight(options.spaceId).catch(() => null)
        : Promise.resolve(null),
      typeof repoAny?.listItemTags === 'function'
        ? repoAny.listItemTags(options.spaceId).catch(() => [])
        : Promise.resolve([]),
      typeof repoAny?.listLinkedPeopleByItem === 'function'
        ? repoAny.listLinkedPeopleByItem(options.spaceId).catch(() => [])
        : typeof repoAny?.listLinkedPeople === 'function'
          ? repoAny.listLinkedPeople({ type: 'space', id: options.spaceId }).catch(() => [])
          : Promise.resolve([]),
    ]);

    // Determine summary preference: prefer persisted insight, fall back to rolling summary
    const summaryFromInsight =
      latestSummary && typeof latestSummary.summary === 'string'
        ? latestSummary.summary.trim()
        : '';
    const summaryFromCtx = options.runningSummary && options.runningSummary.trim();
    const summaryText = (summaryFromInsight || summaryFromCtx || '').trim();

    // Build space metadata for downstream consumers
    const tagNames = Array.isArray(linkedTags)
      ? Array.from(
          new Set(
            linkedTags
              .map((t: any) => (typeof t?.name === 'string' ? t.name.trim() : undefined))
              .filter((name): name is string => !!name && name.length > 0),
          ),
        ).slice(0, 6)
      : [];

    const personNamesSource = Array.isArray(linkedPeople) ? linkedPeople : [];

    const personNames = Array.from(
      new Set(
        personNamesSource
          .map((p: any) => {
            if (typeof p === 'string') return p.trim();
            if (p?.person_name && typeof p.person_name === 'string') return p.person_name.trim();
            if (p?.display_name && typeof p.display_name === 'string') return p.display_name.trim();
            if (p?.name && typeof p.name === 'string') return p.name.trim();
            if (p?.person_email && typeof p.person_email === 'string') return p.person_email.trim();
            return undefined;
          })
          .filter((name): name is string => !!name && name.trim().length > 0),
      ),
    ).slice(0, 6);

    const spaceContext =
      spaceRecord || tagNames.length > 0 || personNames.length > 0
        ? {
            id: spaceRecord?.id ?? options.spaceId,
            name: spaceRecord?.name ?? spaceRecord?.title ?? null,
            icon: spaceRecord?.icon ?? null,
            theme: spaceRecord?.theme ?? null,
            tags: tagNames,
            people: personNames,
          }
        : undefined;

    const personaPrompt = getPersonaPrompt();
    const contextLines: string[] = [];

    if (spaceContext?.name) {
      contextLines.push(`Space name: ${spaceContext.name}`);
    }
    if (spaceContext?.icon) {
      contextLines.push(`Icon: ${spaceContext.icon}`);
    }
    if (spaceContext?.theme) {
      contextLines.push(`Theme: ${spaceContext.theme}`);
    }
    if (spaceContext?.tags && spaceContext.tags.length > 0) {
      contextLines.push(`Linked tags: ${spaceContext.tags.join(', ')}`);
    }
    if (spaceContext?.people && spaceContext.people.length > 0) {
      contextLines.push(`People mentioned: ${spaceContext.people.join(', ')}`);
    }

    const systemPrompt =
      personaPrompt +
      (contextLines.length > 0
        ? `\n\nSpace context:\n${contextLines.join('\n')}\nKeep replies grounded in this space.`
        : '');

    // Build result with enriched context
    const result: ChatContext = {
      messages: trimmed,
      summary: summaryText.length > 0 ? summaryText : undefined,
      windowSize: trimmed.length,
      summaryLength: summaryText.length,
      systemPrompt,
      space: spaceContext,
    };

    if (__DEV__) {
      console.log('[CORTEX][10.7E] context_built', {
        windowSize: result.windowSize,
        summaryLength: result.summaryLength,
        hasSystemPrompt: !!result.systemPrompt,
      });
    }

    return result;
  } catch (error) {
    // Log only in dev mode to prevent noisy production logs
    if (__DEV__) {
      console.error('[CORTEX][10.7E] Failed to build chat context:', error);
    }
    // Return safe fallback context
    return {
      messages: [],
      summary: undefined,
      windowSize: 0,
      summaryLength: 0,
      systemPrompt: getPersonaPrompt(),
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
