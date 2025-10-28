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
  note: 'Save as Note',
  list: 'Save as list',
} as const;

function looksHabitText(t: string): boolean {
  const lc = t.toLowerCase();
  return /\bevery\b|\beach\b|\bdaily\b|\bevery day\b|\bweekly\b|\bmonthly\b|\btimes?\s+a\s+week\b/.test(
    lc,
  );
}

function looksListText(t: string): boolean {
  const lc = t.toLowerCase();
  return /\bideas?\b|\bbrainstorm\b|\bwish\s*list\b|\bpacking\s*list\b|\bitinerary\b|\blist\b/.test(
    lc,
  );
}

function looksActionish(t: string): boolean {
  const lc = t.toLowerCase();
  return /\bplan|organize|schedule|book|set up|prepare|arrange|follow\s*up\b/.test(lc);
}

export function buildMindDropAskChips(input: BuildChipsInput): ChipSuggestion[] {
  const t = input.text.trim();
  if (!t) return [];

  const chips: ChipSuggestion[] = [];

  const isHabit = input.probable === 'habit' || looksHabitText(t);
  const isListLike = looksListText(t);
  const isActionish = looksActionish(t);

  if (input.probable === 'todo' || input.probable === 'unknown' || isActionish) {
    chips.push({
      type: 'create.todo',
      label: LABELS.todo,
      payload: { name: t, undefined_due: true },
    });
  }

  if (isHabit) {
    const lc = t.toLowerCase();
    const freq: 'daily' | 'weekly' | 'monthly' = /\bmonthly\b/.test(lc)
      ? 'monthly'
      : /\bweekly\b|times?\s+a\s+week/.test(lc)
        ? 'weekly'
        : 'daily';
    chips.push({
      type: 'create.habit',
      label: LABELS.habit,
      payload: { name: t, freq },
    });
  }

  if (!isHabit && (isListLike || input.probable === 'note' || isActionish)) {
    const subtype: 'list' | 'journal' = isListLike ? 'list' : 'journal';
    chips.push({
      type: 'create.note',
      label: subtype === 'list' ? LABELS.list : LABELS.note,
      payload: { title: t, body: t, subtype },
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
