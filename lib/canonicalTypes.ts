/**
 * canonicalTypes.ts
 * Central helpers for canonical type feature gating and display labels.
 */
import { env } from './env';

type LabelOptions = {
  plural?: boolean;
  lowercase?: boolean;
};

const canonicalNoteLabels = {
  singular: 'Log',
  plural: 'Logs',
} as const;

const legacyNoteLabels = {
  singular: 'Note',
  plural: 'Notes',
} as const;

const capitalize = (value: string): string => {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
};

export const canonicalTypesEnabled = (): boolean => env.feature.canonicalTypes;

export const getNoteLabel = (options: LabelOptions = {}): string => {
  const { plural = false, lowercase = false } = options;
  const labels = canonicalTypesEnabled() ? canonicalNoteLabels : legacyNoteLabels;
  const label = plural ? labels.plural : labels.singular;
  return lowercase ? label.toLowerCase() : label;
};

export const kindToDisplayLabel = (
  kind: 'habit' | 'todo' | 'log' | 'note' | 'unsorted' | 'journal' | 'person' | string,
  options: LabelOptions = {},
): string => {
  const { plural = false, lowercase = false } = options;

  let label: string;
  switch (kind) {
    case 'habit':
      label = plural ? 'Habits' : 'Habit';
      break;
    case 'todo':
      label = plural ? 'To-Dos' : 'To-Do';
      break;
    case 'log':
    case 'note':
      label = getNoteLabel({ plural });
      break;
    case 'unsorted':
      label = 'Unsorted';
      break;
    case 'journal':
      label = plural ? 'Journal Entries' : 'Journal';
      break;
    case 'person':
      label = plural ? 'People' : 'Person';
      break;
    default:
      label = plural ? `${capitalize(kind)}s` : capitalize(kind);
      break;
  }

  return lowercase ? label.toLowerCase() : label;
};
