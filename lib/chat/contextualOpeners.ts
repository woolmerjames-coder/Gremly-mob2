/**
 * contextualOpeners.ts
 * Determines what chat CTA to show on Sweep cards based on entity state.
 * Uses sweep context (reschedule count, days unscheduled, overdue status)
 * to provide contextually relevant prompts that feel helpful, not pushy.
 */

export interface ContextualOpener {
  /** The text shown on the button */
  buttonText: string;
  /** Optional: preset to auto-select when chat opens */
  presetHint?: 'whats_blocking' | 'think_through' | 'break_down' | 'action_steps';
}

export interface SweepContext {
  times_moved: number; // How many times this item has been rescheduled
  days_unscheduled: number; // Days since creation without a due date
  is_overdue: boolean; // Past due date
}

export function getContextualOpener(
  entityType: 'todo' | 'habit' | 'note',
  sweepContext: SweepContext,
): ContextualOpener {
  const { times_moved, days_unscheduled, is_overdue } = sweepContext;

  // Item keeps getting rescheduled - something's blocking it
  if (times_moved >= 2) {
    return {
      buttonText: 'This keeps moving. Want to figure out why?',
      presetHint: 'whats_blocking',
    };
  }

  // Overdue todo
  if (is_overdue && entityType === 'todo') {
    return {
      buttonText: 'Past due — need help getting unstuck?',
      presetHint: 'break_down',
    };
  }

  // Long unscheduled todo
  if (days_unscheduled >= 7 && entityType === 'todo') {
    return {
      buttonText: 'Been waiting a while. Still relevant?',
      presetHint: 'think_through',
    };
  }

  // Note that keeps getting deferred
  if (entityType === 'note' && times_moved >= 3) {
    return {
      buttonText: 'Worth turning into an action?',
      presetHint: 'action_steps',
    };
  }

  // Default - simple CTA
  return {
    buttonText: 'Chat about this →',
    presetHint: undefined,
  };
}
