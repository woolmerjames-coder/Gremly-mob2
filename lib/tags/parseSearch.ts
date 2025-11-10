export interface ParsedSearch {
  text: string | null;
  tagNames: string[];
}

/**
 * Parse a unified Hub search string.
 * Tag tokens start with #, *, @.
 * All other tokens form the free-text query.
 */
export function parseSearchTokens(raw: string): ParsedSearch {
  const parts = (raw || '').trim().split(/\s+/).filter(Boolean);
  const tagNames: string[] = [];
  const textParts: string[] = [];

  for (const p of parts) {
    const first = p[0];
    if (first === '#' || first === '*' || first === '@') {
      const norm = first + p.slice(1).toLowerCase();
      if (!tagNames.includes(norm)) tagNames.push(norm);
    } else {
      textParts.push(p);
    }
  }

  return { text: textParts.length ? textParts.join(' ') : null, tagNames };
}
