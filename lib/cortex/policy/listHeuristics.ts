export type ListHeuristic = {
  looksLikeList: boolean;
  score: number; // 0..1
  lines: number;
  matches: number;
  reasons: string[];
};

export function analyzeListShape(text: string): ListHeuristic {
  const reasons: string[] = [];

  if (!text) {
    return { looksLikeList: false, score: 0, lines: 0, matches: 0, reasons };
  }

  const rawLines = text.split(/\r?\n/);
  const lines = rawLines.map((line) => line.trim()).filter(Boolean);
  const n = lines.length;

  if (n < 2) {
    return { looksLikeList: false, score: 0, lines: n, matches: 0, reasons };
  }

  const bullet = /^(-|\*|•)\s+/;
  const checkbox = /^-\s\[( |x)\]\s+/i;
  const numbered = /^\d+([.)])\s+/;

  let matches = 0;
  let markerMatches = 0;

  for (const line of lines) {
    if (checkbox.test(line) || bullet.test(line) || numbered.test(line)) {
      matches += 1;
      markerMatches += 1;
    }
  }

  // Fallback: comma- or line-separated short fragments without sentence punctuation
  if (markerMatches === 0) {
    let shortish = 0;
    for (const line of lines) {
      const words = line.split(/\s+/).length;
      if (words <= 7 && !/[.?!]$/.test(line)) {
        shortish += 1;
      }
    }
    if (shortish >= Math.max(2, Math.floor(n * 0.6))) {
      matches = shortish;
      reasons.push('short-lines-list');
    }
  }

  if (markerMatches > 0) {
    reasons.push('list-markers');
  }

  const ratio = n === 0 ? 0 : matches / n;
  const looksLikeList = matches >= 2 || ratio >= 0.6;

  const baseScore = Math.min(1, Math.max(0.2, ratio));
  const score = matches > 0 ? baseScore : 0;

  return {
    looksLikeList,
    score,
    lines: n,
    matches,
    reasons,
  };
}

export function looksLikeList(text: string): boolean {
  return analyzeListShape(text).looksLikeList;
}
