import { parseDue } from '../entities/datetime';
import { detectSignals } from './signals';
import type { IntentKind } from './gating';

export type ChipKind = 'set_due_date' | 'add_todo' | 'save_note';

export interface MindDropChip {
  kind: ChipKind;
  label: string;
  // Optional data to drive the follow-up action
  payload?: { dueDate?: string };
}

export interface ChipInput {
  userText: string;
  intent: IntentKind | 'ambiguous';
}

export function buildMindDropAskChips(input: ChipInput): MindDropChip[] {
  const chips: MindDropChip[] = [];
  const { userText, intent } = input;
  const { hasActionSignal } = detectSignals(userText);

  // Due-date chip for medium confidence (0.70–0.89): suggest, don't auto-apply
  const parsed = parseDue(userText);
  if (parsed.iso && parsed.confidence >= 0.7 && parsed.confidence < 0.9) {
    chips.push({
      kind: 'set_due_date',
      label: `Set due date to ${new Date(parsed.iso).toLocaleDateString()}`,
      payload: { dueDate: parsed.iso },
    });
  }

  // Intent-driven helper chips
  if (intent === 'todo' || hasActionSignal) {
    chips.push({ kind: 'add_todo', label: 'Add as task' });
  } else {
    chips.push({ kind: 'save_note', label: 'Save as note' });
  }

  return chips;
}
