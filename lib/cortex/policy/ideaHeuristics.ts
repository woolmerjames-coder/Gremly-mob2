export type IdeaHeuristic = {
  looksLikeIdea: boolean;
  score: number; // 0..1
  reasons: string[];
  matches: string[];
};

const IDEA_PATTERNS = [
  /\bidea\b[:—]?\s*/i,
  /\bwhat if\b/i,
  /\bwe could\b/i,
  /\bcould we\b/i,
  /\bmaybe we\b/i,
  /\bi have an idea\b/i,
  /\bconcept\b/i,
  /\bprototype\b/i,
  /\bbrainstorm\b/i,
  /\bsketch\b/i,
];

const NON_IDEA_STRONG = [/^\s*(who|what|when|where|why|how)\b.*\?$/i];

export function analyzeIdeaShape(text: string): IdeaHeuristic {
  const reasons: string[] = [];
  const matches: string[] = [];

  if (!text) {
    return { looksLikeIdea: false, score: 0, reasons, matches };
  }

  const trimmed = text.trim();

  if (NON_IDEA_STRONG.some((rx) => rx.test(trimmed))) {
    return { looksLikeIdea: false, score: 0, reasons: ['question'], matches };
  }

  let hit = 0;
  for (const rx of IDEA_PATTERNS) {
    const m = trimmed.match(rx);
    if (m) {
      hit += 1;
      matches.push(m[0]);
    }
  }

  const looksLikeIdea = hit >= 1;
  const score = looksLikeIdea ? Math.min(1, 0.3 + hit * 0.2) : 0;
  if (looksLikeIdea) {
    reasons.push('keywords');
  }

  return { looksLikeIdea, score, reasons, matches };
}
