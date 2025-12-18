/**
 * Gremly Sweep Responses
 *
 * Generates supportive, shame-free messages for the Gremly mascot
 * to display on Sweep cards. Messages are contextual based on item
 * type, state, and history.
 *
 * Design principles:
 * - No shame or guilt-tripping
 * - Acknowledge effort and intention
 * - Offer gentle choices, not pressure
 * - Keep messages warm but concise
 */

import type { SweepCandidate } from './types';

/**
 * Generates a contextual, supportive message for Gremly to display
 * on a Sweep card based on the item's type, state, and history.
 *
 * @param candidate - The sweep candidate item
 * @param isNew - True if this is the first time in Sweep (never skipped)
 * @param isLockedIn - True if commitment === true (locked-in item)
 * @returns A shame-free, supportive message string
 */
export function getGremlyResponse(
  candidate: SweepCandidate,
  isNew: boolean,
  isLockedIn: boolean,
): string {
  const { kind, raw, isOverdue, isDueToday } = candidate;

  // ─────────────────────────────────────────────────────────────────────────
  // Todos
  // ─────────────────────────────────────────────────────────────────────────
  if (kind === 'todo') {
    // Locked-in items get priority messaging
    if (isLockedIn) {
      return "You locked this one in. How's it coming along?";
    }

    // New todo without a due date
    if (isNew && !raw.due_day) {
      return 'Sounds like this one has a deadline hiding in it.';
    }

    // New todo due today
    if (isNew && isDueToday) {
      return 'This is on your plate for today.';
    }

    // Overdue items — gentle, no shame
    if (isOverdue) {
      return 'This one slipped by. Still on your mind, or okay to let go?';
    }

    // Resurfacing (not new, not overdue)
    if (!isNew) {
      return "This one keeps floating back up. No rush — just here when you're ready.";
    }

    // Default for todos
    return 'What do you want to do with this one?';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Notes (logs)
  // ─────────────────────────────────────────────────────────────────────────
  if (kind === 'note') {
    const subtype = raw.subtype as string | undefined;

    // Ideas
    if (subtype === 'idea') {
      if (isNew) {
        return 'Interesting spark. Want to grow it or just keep it safe?';
      }
      return 'This idea came back around. Ready to do something with it?';
    }

    // Journal entries — always affirming
    if (subtype === 'journal') {
      return "Thanks for sharing that. I've got it safe.";
    }

    // General notes or other subtypes
    if (isNew) {
      return "Thanks for letting that out. I've got it.";
    }
    return 'This thought came back. Ready to do something with it?';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Fallback (should rarely hit this)
  // ─────────────────────────────────────────────────────────────────────────
  return "I've got this one. What would you like to do?";
}
