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
  note: 'Save as note',
  list: 'Save as list',
} as const;

const ALWAYS_NOTE_FALLBACK =
  String(process.env.EXPO_PUBLIC_MINDDROP_ALWAYS_NOTE_FALLBACK ?? 'on').toLowerCase() !== 'off';

function looksHabitText(t: string): boolean {
  const lc = t.toLowerCase();
  return (
    /\bevery\b|\beach\b|\bdaily\b|\bevery day\b|\bweekly\b|\bmonthly\b/.test(lc) ||
    /\b\d+\s+times?\s+(a|per)\s+(day|week|month)\b/.test(lc)
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
  return /\b(plan|organize|schedule|book|set up|prepare|arrange|follow\s*up|message|email|text|dm|ping|reach out|contact)\b/.test(
    lc,
  );
}

function hasExplicitDateOrTime(t: string): boolean {
  const lc = t.toLowerCase();
  return (
    /\btoday\b|\btomorrow\b|\btonight\b/.test(lc) ||
    /\bnext\s+(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(
      lc,
    ) ||
    /\b(on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+\d{1,2}\b/.test(lc) ||
    /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/.test(lc) ||
    /\b(at\s*)?\d{1,2}(:\d{2})?\s*(am|pm)\b/.test(lc)
  );
}

export function buildMindDropAskChips(input: BuildChipsInput): ChipSuggestion[] {
  const t = input.text.trim();
  if (!t) return [];

  const chips: ChipSuggestion[] = [];

  const isHabitText = looksHabitText(t);
  const isListLike = looksListText(t);
  const isAction = looksActionish(t);
  const hasDate = hasExplicitDateOrTime(t);

  if (input.probable === 'todo' || input.probable === 'unknown' || isAction) {
    chips.push({
      type: 'create.todo',
      label: LABELS.todo,
      payload: { name: t, undefined_due: true },
    });
  }

  if ((input.probable === 'habit' || isHabitText) && !hasDate) {
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

  if (isListLike || input.probable === 'note') {
    const subtype: 'list' | 'journal' = isListLike ? 'list' : 'journal';
    chips.push({
      type: 'create.note',
      label: subtype === 'list' ? LABELS.list : LABELS.note,
      payload: { title: t, body: t, subtype },
    });
  }

  if (ALWAYS_NOTE_FALLBACK && !chips.some((chip) => chip.type === 'create.note')) {
    chips.push({
      type: 'create.note',
      label: LABELS.note,
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
