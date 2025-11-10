export function shouldAutoCommit(raw: string): boolean {
  const t = (raw || '').toLowerCase();
  if (!t) return false;

  const patterns = [
    /\bmake\s+commit+ment\b/,
    /\bcommit\s+to\b/,
    /\bthis\s+is\s+a\s+commit+ment\b/,
    /\bpriority\s+commit+ment\b/,
    /\bmake\s+it\s+a\s+commit+ment\b/,
  ];

  return patterns.some((re) => re.test(t));
}
