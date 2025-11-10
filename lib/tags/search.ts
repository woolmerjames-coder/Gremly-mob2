export function normalizeSearchTagInput(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return '';
  const first = s[0];
  if (first === '#' || first === '*' || first === '@') {
    return first + s.slice(1).trim().toLowerCase();
  }
  return `#${s.toLowerCase()}`;
}

export function normalizeSearchTagArray(raws: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raws || []) {
    const norm = normalizeSearchTagInput(String(r || ''));
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}
