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
        due_day?: string | null;
        due_time?: string | null;
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
  /** Probable kind from canonical intent (may differ from 'probable' which comes from AI) */
  probableKind?: 'todo' | 'habit' | 'log' | 'none';
  /** Chip decision from canonical intent */
  chipDecision?: {
    showChips: boolean;
    needsClarification: boolean;
    reason?: string;
  };
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

  // If chipDecision explicitly says don't show chips, return empty
  if (input.chipDecision && !input.chipDecision.showChips) {
    return [];
  }

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

  // Use probableKind from canonical intent if available, otherwise fall back to probable from AI
  const effectiveProbableKind = input.probableKind ?? input.probable;
  const chipReason = input.chipDecision?.reason;

  // Helper: Check if this is a proto-task or simple social event
  const isProtoTaskOrSocial = chipReason === 'proto-task' || chipReason === 'simple-social-event';

  // RULE: Probable todo (proto-tasks, social events)
  // If probableKind === "todo" and no strong habit signal, show only To-Do and Log
  if (effectiveProbableKind === 'todo' || isProtoTaskOrSocial) {
    const showHabit = isHabitText && !isProtoTaskOrSocial && !hasDate;

    // Always show To-Do chip for probable todos
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
        due_day: todoFields.dueDay ?? null,
        due_time: todoFields.dueTime ?? null,
      },
    });

    // Show Habit only if there's a strong habit signal AND not proto-task/social event
    if (showHabit) {
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

    // Always show Log chip as alternative
    chips.push({
      type: 'create.note',
      label: LABELS.log,
      payload: { title: t, body: t, subtype: 'journal' },
    });

    return deduplicateChips(chips, t, effectiveProbableKind);
  }

  // RULE: Probable habit
  // If probableKind === "habit" OR strong habit signal, show Habit + Log (+ To-Do if clear todo signal)
  if (effectiveProbableKind === 'habit' || (isHabitText && !hasDate)) {
    // Always show Habit chip
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

    // Show To-Do only if there's a clear action signal
    if (isAction || hasDate) {
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
          due_day: todoFields.dueDay ?? null,
          due_time: todoFields.dueTime ?? null,
        },
      });
    }

    // Always show Log as alternative
    chips.push({
      type: 'create.note',
      label: LABELS.log,
      payload: { title: t, body: t, subtype: 'journal' },
    });

    return deduplicateChips(chips, t, effectiveProbableKind);
  }

  // RULE: Probable log with proto-task/social event flavor
  // If probableKind === "log" but isProtoTaskOrSocial, show To-Do + Log (no Habit)
  if (effectiveProbableKind === 'log' && isProtoTaskOrSocial) {
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
        due_day: todoFields.dueDay ?? null,
        due_time: todoFields.dueTime ?? null,
      },
    });

    chips.push({
      type: 'create.note',
      label: LABELS.log,
      payload: { title: t, body: t, subtype: 'journal' },
    });

    return deduplicateChips(chips, t, effectiveProbableKind);
  }

  // SPECIAL CASE: List heuristic triggered
  if (listAnalysis.looksLikeList) {
    const lines = t
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
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
        due_day: todoFields.dueDay ?? null,
        due_time: todoFields.dueTime ?? null,
      },
      reason: 'list-heuristic',
    });

    return deduplicateChips(chips, t, effectiveProbableKind);
  }

  // SPECIAL CASE: Idea heuristic triggered
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
        due_day: todoFields.dueDay ?? null,
        due_time: todoFields.dueTime ?? null,
      },
      reason: 'idea-heuristic',
    });

    return deduplicateChips(chips, t, effectiveProbableKind);
  }

  // DEFAULT FALLBACK: Show To-Do + Log (no Habit)
  // This handles unknown/ambiguous cases
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
      due_day: todoFields.dueDay ?? null,
      due_time: todoFields.dueTime ?? null,
    },
  });

  chips.push({
    type: 'create.note',
    label: LABELS.log,
    payload: { title: t, body: t, subtype: 'journal' },
  });

  return deduplicateChips(chips, t, effectiveProbableKind);
}

/**
 * Deduplicate chips by type and label, and add conversion chip if applicable
 */
function deduplicateChips(
  chips: ChipSuggestion[],
  text: string = '',
  probableKind?: string,
): ChipSuggestion[] {
  const conversionsEnabled = Boolean(env.feature?.canonicalConversions);
  const containsChecklist = hasChecklist(text);
  const isListLike = looksListText(text) || analyzeListShape(text).looksLikeList;

  // Add conversion chip for logs with checklists or list-like content
  if (
    conversionsEnabled &&
    (probableKind === 'log' || isListLike || containsChecklist) &&
    !chips.some((chip) => chip.type === 'convert.log-list-to-todo')
  ) {
    const convertLabel = env.feature?.canonicalTypes ? 'Convert to to-do' : 'Convert to task';
    chips.push({
      type: 'convert.log-list-to-todo',
      label: convertLabel,
      payload: { noteId: null, preserveState: true },
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
