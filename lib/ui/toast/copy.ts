import { kindToDisplayLabel } from '../kindToDisplayLabel';

export type OrganizedKind = 'todo' | 'habit' | 'note' | 'log' | 'unsorted';

export type OrganizedDetail = {
  kind: 'todo' | 'habit' | 'note';
  noteSubtype?: string | null;
};

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
  log: 'log',
  logs: 'log',
  journal: 'log',
  unsorted: 'unsorted',
  'unsorted drop': 'unsorted',
  'unsorted drops': 'unsorted',
};

const LABELS: Record<OrganizedKind, { singular: string; plural: string }> = {
  todo: { singular: 'todo', plural: 'todos' },
  habit: { singular: 'habit', plural: 'habits' },
  note: { singular: 'note', plural: 'notes' },
  log: { singular: 'log', plural: 'logs' },
  unsorted: { singular: 'unsorted', plural: 'unsorted' },
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

const CANONICAL_DISPLAY_LABELS: Record<string, { singular: string; plural: string }> = {
  todo: LABELS.todo,
  todos: LABELS.todo,
  habit: LABELS.habit,
  habits: LABELS.habit,
  note: LABELS.note,
  notes: LABELS.note,
  log: LABELS.log,
  logs: LABELS.log,
  unsorted: LABELS.unsorted,
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
export function organizedToastSummary(
  counts: OrganizedCounts,
  options?: { canonicalTypesOn?: boolean; details?: OrganizedDetail[] },
): string {
  const details = options?.details ?? [];

  if (options?.canonicalTypesOn && details.length > 0) {
    const canonicalCounts = new Map<string, number>();
    details.forEach((detail) => {
      const label = kindToDisplayLabel(detail.kind, detail.noteSubtype ?? null, true);
      const key = typeof label === 'string' && label.length > 0 ? label : detail.kind;
      canonicalCounts.set(key, (canonicalCounts.get(key) ?? 0) + 1);
    });

    const segments = Array.from(canonicalCounts.entries()).map(([label, count]) => {
      const forms = CANONICAL_DISPLAY_LABELS[label] ?? {
        singular: label,
        plural: `${label}s`,
      };
      const noun = count === 1 ? forms.singular : forms.plural;
      return `${count} ${noun}`;
    });

    const summary = segments.length ? segments.join(', ') : 'items';
    return `${ORGANIZED_TOAST_PREFIX}${summary}`;
  }

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
