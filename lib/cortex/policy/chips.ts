import { buildHabitFields, buildTodoFields } from '../textNormalization';
import { env } from '../../env';
import { hasChecklist } from '../../conversion';
import { analyzeListShape } from './listHeuristics';
import { analyzeIdeaShape } from './ideaHeuristics';

type ChipReason = 'list-heuristic' | 'idea-heuristic' | string;

type BaseChipSuggestion = {
  label: string;
  reason?: ChipReason;
};

export type ChipSuggestion =
  | (BaseChipSuggestion & {
      type: 'create.todo';
      payload: {
        name: string;
        undefined_due: boolean;
        due?: string | null;
        due_date?: string | null;
      };
    })
  | (BaseChipSuggestion & {
      type: 'create.habit';
      payload: { name: string; freq: 'daily' | 'weekly' | 'monthly' };
    })
  | (BaseChipSuggestion & {
      type: 'create.note';
      payload: { title: string; body: string; subtype: 'list' | 'journal' | 'idea' };
    })
  | (BaseChipSuggestion & {
      type: 'convert.log-list-to-todo';
      payload: { noteId: string | null; preserveState?: boolean };
    });
export type BuildChipsInput = {
  text: string;
  probable: 'todo' | 'habit' | 'log' | 'unknown';
  confidence: number;
};

const canonicalTypesEnabled = Boolean(env.feature?.canonicalTypes);
const LOG_LABEL = canonicalTypesEnabled ? 'Save as log' : 'Save as note';

const LABELS = {
  todo: 'Create todo',
  habit: 'Create habit',
  log: LOG_LABEL,
  list: 'Save as list',
} as const;

const ALWAYS_LOG_FALLBACK =
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
  const canonicalTypesOn = canonicalTypesEnabled;

  const listAnalysis = analyzeListShape(t);
  const ideaAnalysis = analyzeIdeaShape(t);

  const isHabitText = looksHabitText(t);
  const isListLike = looksListText(t) || listAnalysis.looksLikeList;
  const isAction = looksActionish(t);
  const hasDate = hasExplicitDateOrTime(t);

  const containsChecklist = hasChecklist(t);
  const conversionsEnabled = Boolean(env.feature?.canonicalConversions);
  if (input.probable === 'todo' || input.probable === 'unknown' || isAction) {
    const todoFields = buildTodoFields(t, undefined, { inferDueFromText: true });
    const due = todoFields.due ?? null;
    chips.push({
      type: 'create.todo',
      label: LABELS.todo,
      payload: {
        name: todoFields.title,
        undefined_due: !due,
        due,
        due_date: due,
      },
    });
  }

  if ((input.probable === 'habit' || isHabitText) && !hasDate) {
    const habitFields = buildHabitFields(t);
    const freq: 'daily' | 'weekly' | 'monthly' =
      habitFields.freq === 'weekly'
        ? 'weekly'
        : habitFields.freq === 'custom'
          ? 'monthly'
          : 'daily';
    chips.push({
      type: 'create.habit',
      label: LABELS.habit,
      payload: { name: habitFields.name, freq },
    });
  }

  if (listAnalysis.looksLikeList) {
    const lines = t.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const heading = lines[0] ?? t;
    const todoFields = buildTodoFields(t, undefined, { inferDueFromText: true });
    const due = todoFields.due ?? null;
    const listNoteLabel = canonicalTypesOn ? LABELS.list : 'Save as note (list)';

    chips.push({
      type: 'create.note',
      label: listNoteLabel,
      payload: { title: heading, body: t, subtype: 'list' },
      reason: 'list-heuristic',
    });

    chips.push({
      type: 'create.todo',
      label: 'Create To-do checklist',
      payload: {
        name: todoFields.title || heading,
        undefined_due: !due,
        due,
        due_date: due,
      },
      reason: 'list-heuristic',
    });
  }

  if (ideaAnalysis.looksLikeIdea) {
    const ideaNoteLabel = canonicalTypesOn ? 'Save as idea' : 'Save as note (idea)';
    const todoFields = buildTodoFields(t, undefined, { inferDueFromText: true });
    const due = todoFields.due ?? null;

    chips.push({
      type: 'create.note',
      label: ideaNoteLabel,
      payload: { title: t, body: t, subtype: 'idea' },
      reason: 'idea-heuristic',
    });

    chips.push({
      type: 'create.todo',
      label: 'Create To-do',
      payload: {
        name: todoFields.title,
        undefined_due: !due,
        due,
        due_date: due,
      },
      reason: 'idea-heuristic',
    });
  }

  if ((isListLike && !listAnalysis.looksLikeList) || input.probable === 'log') {
    const subtype: 'list' | 'journal' = isListLike && !listAnalysis.looksLikeList ? 'list' : 'journal';
    chips.push({
      type: 'create.note',
      label: subtype === 'list' ? LABELS.list : LABELS.log,
      payload: { title: t, body: t, subtype },
    });
  }

  if (ALWAYS_LOG_FALLBACK && !chips.some((chip) => chip.type === 'create.note')) {
    chips.push({
      type: 'create.note',
      label: LABELS.log,
      payload: { title: t, body: t, subtype: 'journal' },
    });
  }

  const seen = new Set<string>();
  if (
    conversionsEnabled &&
    (input.probable === 'log' || isListLike || containsChecklist) &&
    !chips.some((chip) => chip.type === 'convert.log-list-to-todo')
  ) {
    const convertLabel = env.feature.canonicalTypes ? 'Convert to to-do' : 'Convert to task';
    chips.push({
      type: 'convert.log-list-to-todo',
      label: convertLabel,
      payload: { noteId: null, preserveState: true },
    });
  }
  return chips.filter((chip) => {
    const key = `${chip.type}:${chip.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
