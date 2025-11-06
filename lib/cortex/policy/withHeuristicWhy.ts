const REASON_MARKERS: Record<string, string> = {
  'list-heuristic': 'heuristic:list',
  'idea-heuristic': 'heuristic:idea',
};

function resolveMarker(reason: string | undefined | null): string | null {
  if (!reason) return null;
  const trimmed = reason.trim();
  if (!trimmed) return null;

  if (REASON_MARKERS[trimmed]) {
    return REASON_MARKERS[trimmed];
  }

  if (trimmed.startsWith('heuristic:')) {
    return trimmed;
  }

  return null;
}

export function withHeuristicWhy(base: string, reason?: string | null): string {
  const marker = resolveMarker(reason);
  const normalized = (base || '').trim();

  if (!marker) {
    return normalized;
  }

  if (normalized.includes(marker)) {
    return normalized;
  }

  if (!normalized) {
    return marker;
  }

  return `${normalized} (${marker})`;
}

export function hasHeuristicMarker(reason?: string | null): boolean {
  return resolveMarker(reason) !== null;
}
