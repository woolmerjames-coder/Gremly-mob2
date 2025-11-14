const DEFAULT_MAX_WORDS = 6;

const FILLER_PATTERNS: RegExp[] = [
  /^i\s+(?:really\s+)?(?:need|should|want|have|got|ought|plan|planning|try|trying)\s+(?:to\s+|be\s+)?/i,
  /^we\s+(?:really\s+)?(?:need|should|want|have|got|ought|plan|planning|try|trying)\s+(?:to\s+|be\s+)?/i,
  /^(?:need|should|want|have|got|ought|plan|planning|try|trying)\s+(?:to\s+|be\s+)?/i,
  /^i['`\s]*m\s+(?:going|supposed)\s+to\s+/i,
  /^i['`\s]*d\s+(?:like|love|better)\s+to\s+/i,
  /^i\s+shoulda\s+/i,
  /^let['`]?s\s+/i,
  /^maybe\s+(?:i|we)\s+should\s+/i,
  /^just\s+/i,
  /^please\s+/i,
];

function stripFillerPrefixes(value: string): string {
  let working = value.trimStart();
  let previous = '';

  while (working && working !== previous) {
    previous = working;
    for (const pattern of FILLER_PATTERNS) {
      if (pattern.test(working)) {
        working = working.replace(pattern, '').trimStart();
        break;
      }
    }
  }

  working = working.replace(/^(?:to|be)\s+(?=[a-z])/i, '').trimStart();
  working = working.replace(/^(?:and\s+)?(?:then\s+)?/i, '').trimStart();

  return working;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sentenceHead(value: string): string {
  const firstLine = value.split(/\r?\n/)[0] ?? value;
  const clause = firstLine.split(/[.!?]/)[0] ?? firstLine;
  return clause.trim();
}

function limitWords(value: string, maxWords: number): string {
  if (!value) return value;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return value;
  }
  return words.slice(0, maxWords).join(' ');
}

function capitaliseFirst(value: string): string {
  if (!value) return value;
  if (/^[a-z]/.test(value)) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  return value;
}

export function compactTitle(input: string, options: { maxWords?: number } = {}): string {
  const maxWords = options.maxWords ?? DEFAULT_MAX_WORDS;
  const raw = normalizeWhitespace(input ?? '');
  if (!raw) {
    return '';
  }

  const head = sentenceHead(raw);
  const stripped = stripFillerPrefixes(head);
  const limited = limitWords(stripped, maxWords);
  const normalized = normalizeWhitespace(limited);

  if (!normalized) {
    return capitaliseFirst(head);
  }

  return capitaliseFirst(normalized);
}

export function deriveCompactTitle(
  candidates: Array<string | null | undefined>,
  options: { fallback?: string; maxWords?: number } = {},
): { compact: string; source: string } {
  const fallback = options.fallback ?? '';
  const maxWords = options.maxWords;

  const sourceCandidate = candidates
    .map((value) => (typeof value === 'string' ? normalizeWhitespace(value) : ''))
    .find((value) => value.length > 0);

  const source = sourceCandidate || normalizeWhitespace(fallback);
  if (!source) {
    return { compact: '', source: '' };
  }

  const compact = compactTitle(source, { maxWords });
  return {
    compact: compact || source,
    source,
  };
}

export const __internal = {
  stripFillerPrefixes,
  normalizeWhitespace,
  sentenceHead,
  limitWords,
  capitaliseFirst,
};
