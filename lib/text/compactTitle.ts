export function compactTitle(input: string | null | undefined): string {
  if (typeof input !== 'string') return '';
  const raw = input.trim();
  if (!raw) return '';

  const firstMeaningfulLine = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstMeaningfulLine) return '';

  const normalized = firstMeaningfulLine.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 120) return normalized;
  return `${normalized.slice(0, 117).trim()}...`;
}
