/**
 * Phase 10.7B: Lightweight Semantic Recall
 * Simple BM25/TF-IDF over prior messages for context retrieval
 */

export interface RecallMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

/**
 * Simple TF-IDF based recall
 * Returns top N most relevant messages based on query
 */
export function recallRelevantMessages(
  query: string,
  messages: RecallMessage[],
  topN: number = 2,
): RecallMessage[] {
  if (messages.length === 0 || !query.trim()) {
    return [];
  }

  const queryTerms = tokenize(query.toLowerCase());
  if (queryTerms.length === 0) {
    return [];
  }

  // Calculate relevance scores
  const scores = messages.map((msg) => {
    const msgTerms = tokenize(msg.text.toLowerCase());
    const score = calculateBM25Score(queryTerms, msgTerms, messages.length);
    return { message: msg, score };
  });

  // Sort by score descending and take top N
  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .filter((s) => s.score > 0.1) // Minimum relevance threshold
    .map((s) => s.message);
}

/**
 * Tokenize text into words (simple whitespace split + cleanup)
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2); // Filter out short words
}

/**
 * Simplified BM25 scoring
 * k1 = 1.5, b = 0.75 (standard parameters)
 */
function calculateBM25Score(queryTerms: string[], docTerms: string[], totalDocs: number): number {
  const k1 = 1.5;
  const b = 0.75;
  const avgDocLength = 50; // Assume average message length

  // Term frequencies in document
  const termFreqs = new Map<string, number>();
  docTerms.forEach((term) => {
    termFreqs.set(term, (termFreqs.get(term) || 0) + 1);
  });

  let score = 0;

  for (const term of queryTerms) {
    const tf = termFreqs.get(term) || 0;
    if (tf === 0) continue;

    // IDF approximation (simplified - assume term appears in ~10% of docs)
    const df = Math.max(1, totalDocs * 0.1);
    const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);

    // BM25 formula
    const docLength = docTerms.length;
    const normTF = (tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * docLength) / avgDocLength));

    score += idf * normTF;
  }

  return score;
}

/**
 * Check if query indicates user is referencing past context
 */
export function shouldRecall(query: string): boolean {
  const lower = query.toLowerCase();
  const recallPhrases = [
    'as i said',
    'as i mentioned',
    'earlier',
    'last time',
    'again',
    'before',
    'previously',
    'you said',
    'we discussed',
    'remember when',
  ];

  return recallPhrases.some((phrase) => lower.includes(phrase));
}
