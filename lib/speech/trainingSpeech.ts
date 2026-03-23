// ============================================================
// Training Speech — Gremly speech for training events
// ============================================================
//
// Follows the same patterns as gremlySpeech.ts.
// Import these and wire into the speech system.

import type { TrainingItemId } from '../training/trainingTypes';

// ────────────────────────────────────────────────────────────
// Helpers (duplicated from gremlySpeech to avoid circular dep)
// ────────────────────────────────────────────────────────────

function calculateDuration(message: string): number {
  const base = 3000;
  const perChar = 50;
  const max = 6000;
  return Math.min(base + message.length * perChar, max);
}

// ────────────────────────────────────────────────────────────
// Training Item Completion Speech
// ────────────────────────────────────────────────────────────

const ITEM_COMPLETION_MESSAGES: Record<string, string> = {
  drops: "15 drops. Gremly's getting to know you.",
  sweeps: '5 sweeps. Your brain knows the rhythm now.',
  briefs: "Mornings planned. That's a game changer.",
  habits: 'Routines tracked. Consistency incoming.',
  journals: 'Journal entries saved. Gremly sees the deeper stuff now.',
  lock_ins: "Priorities locked. Gremly knows what matters to you.",
  entity_chat: "First chat complete. Now we're talking.",
  space: 'First space created. Gremly sees the bigger picture.',
};

/**
 * Speech for when a training item crosses its threshold.
 */
export function getTrainingItemSpeech(
  itemId: TrainingItemId,
): { message: string; duration: number } {
  const message = ITEM_COMPLETION_MESSAGES[itemId] || "Another skill mastered. Gremly's growing.";
  return { message, duration: calculateDuration(message) };
}

// ────────────────────────────────────────────────────────────
// Level Unlock Speech
// ────────────────────────────────────────────────────────────

/**
 * Speech for when a new training level becomes visible.
 */
export function getTrainingLevelSpeech(level: 2 | 3): { message: string; duration: number } {
  const messages: Record<number, string> = {
    2: "New skills unlocked! Gremly's ready to learn more.",
    3: 'Almost there. Gremly wants to see the full picture.',
  };
  return { message: messages[level], duration: 4000 };
}

// ────────────────────────────────────────────────────────────
// Post-Graduation Speech
// ────────────────────────────────────────────────────────────

/**
 * Speech shown on first app open after graduation.
 */
export function getPostGraduationSpeech(): { message: string; duration: number } {
  return {
    message:
      "Training's done. Keep dropping thoughts and Gremly keeps growing. Simple as that.",
    duration: 6000,
  };
}

// ────────────────────────────────────────────────────────────
// Training-Aware Greetings (for early training days)
// ────────────────────────────────────────────────────────────

/**
 * Returns a training-aware greeting, or null if normal greeting should be used.
 * Only fires during very early training when nudges toward core behavior help.
 */
export function getTrainingGreeting(
  totalDrops: number,
  totalSweeps: number,
): { message: string; duration: number } | null {
  if (totalDrops < 3) {
    return {
      message: "Drop what's on your mind. Gremly's learning.",
      duration: 5000,
    };
  }
  if (totalDrops < 8 && totalSweeps === 0) {
    return {
      message: 'Nice drops. Try a Sweep tonight to help Gremly make sense of them.',
      duration: 6000,
    };
  }
  // After 8 drops or first sweep, use normal greeting logic
  return null;
}
