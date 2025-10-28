export type ChipSuggestion =
  | { type: 'create.todo'; label: string; payload: { name: string; undefined_due: boolean } }
  | {
      type: 'create.habit';
      label: string;
      payload: { name: string; freq: 'daily' | 'weekly' | 'monthly' };
    }
  | {
      type: 'create.note';
      label: string;
      payload: { title: string; body: string; subtype: 'list' | 'journal' };
    };

export type BuildChipsInput = {
  text: string;
  probable: 'todo' | 'habit' | 'note' | 'unknown';
  confidence: number;
};

const LABELS = {
  todo: 'Create todo',
  habit: 'Create habit',
  list: 'Save as list',
  journal: 'Save as journal',
} as const;

export function buildMindDropAskChips(input: BuildChipsInput): ChipSuggestion[] {
  const t = input.text.trim();
  if (!t) return [];

  const chips: ChipSuggestion[] = [];

  if (input.probable === 'todo' || input.probable === 'unknown') {
    chips.push({
      type: 'create.todo',
      label: LABELS.todo,
      payload: { name: t, undefined_due: true },
    });
  }

  const cadence = t.toLowerCase();
  const looksHabit =
    /\bevery\b|\beach\b|\bdaily\b|\bevery day\b|\bweekly\b|\bmonthly\b|\btimes?\s+a\s+week\b/.test(
      cadence,
    );
  if (input.probable === 'habit' || looksHabit) {
    const freq: 'daily' | 'weekly' | 'monthly' = /\bmonthly\b/.test(cadence)
      ? 'monthly'
      : /\bweekly\b|times?\s+a\s+week/.test(cadence)
        ? 'weekly'
        : 'daily';

    chips.push({
      type: 'create.habit',
      label: LABELS.habit,
      payload: { name: t, freq },
    });
  }

  const lower = cadence;
  const looksList =
    /\bideas?\b|\bbrainstorm\b|\bwish\s*list\b|\bpacking\s*list\b|\bitinerary\b|\blist\b/.test(
      lower,
    );
  if (looksList) {
    chips.push({
      type: 'create.note',
      label: LABELS.list,
      payload: { title: t, body: t, subtype: 'list' },
    });
  } else {
    chips.push({
      type: 'create.note',
      label: LABELS.journal,
      payload: { title: t, body: t, subtype: 'journal' },
    });
  }

  const seen = new Set<string>();
  return chips.filter((chip) => {
    const key = `${chip.type}:${chip.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
