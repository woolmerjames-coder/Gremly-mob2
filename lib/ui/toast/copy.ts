export type OrganizedKind = 'todo' | 'habit' | 'note';

export type OrganizedCounts = {
  todos?: number;
  notes?: number;
  habits?: number;
};

export const ORGANIZED_TOAST_PREFIX = '✅ Organized into ';

const FRIENDLY_KIND_MAP: Record<string, OrganizedKind> = {
  todo: 'todo',
  todos: 'todo',
  task: 'todo',
  tasks: 'todo',
  habit: 'habit',
  habits: 'habit',
  note: 'note',
  notes: 'note',
};

const LABELS: Record<OrganizedKind, { singular: string; plural: string }> = {
  todo: { singular: 'todo', plural: 'todos' },
  habit: { singular: 'habit', plural: 'habits' },
  note: { singular: 'note', plural: 'notes' },
};

const COUNT_KEY_TO_KIND: Record<keyof OrganizedCounts, OrganizedKind> = {
  todos: 'todo',
  notes: 'note',
  habits: 'habit',
};

const coerceToKind = (kind: string): OrganizedKind => FRIENDLY_KIND_MAP[kind] ?? 'note';

const pluralize = (kind: OrganizedKind, count: number): string => {
  const entry = LABELS[kind];
  return count === 1 ? entry.singular : entry.plural;
};

/**
 * Returns the standardized success toast copy for a single type.
 */
export function organizedToastContent(kind: OrganizedKind | string, count = 1): string {
  const coerced = coerceToKind(kind);
  const noun = pluralize(coerced, count);
  return `${ORGANIZED_TOAST_PREFIX}${count} ${noun}`;
}

/**
 * Formats the shared success toast copy for mixed item counts.
 */
export function organizedToastSummary(counts: OrganizedCounts): string {
  const segments: string[] = [];

  (Object.keys(counts) as Array<keyof OrganizedCounts>).forEach((key) => {
    const count = counts[key] ?? 0;
    if (!count) return;
    const kind = COUNT_KEY_TO_KIND[key];
    segments.push(`${count} ${pluralize(kind, count)}`);
  });

  const summary = segments.length ? segments.join(', ') : 'items';
  return `${ORGANIZED_TOAST_PREFIX}${summary}`;
}
