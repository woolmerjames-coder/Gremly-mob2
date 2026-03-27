/**
 * Copy bank for Today v2 screen
 * Phase 9: Energy & Momentum
 * Step 5: Copy variants with deterministic rotation
 */

import { getDateService } from '../date/DateService';

type TimeWindow = 'morning' | 'midday' | 'evening';

/**
 * Get day-based index for deterministic variant selection
 * Returns 0-based index that changes daily
 */
function getDayIndex(): number {
  const now = getDateService().now();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  return dayOfYear;
}

/**
 * Returns a simple greeting with user name
 * Format: "Hi {name}" or just "Hi" if no name
 */
export function getGreeting(timeWindow: TimeWindow, name: string = ''): string {
  return name ? `Hi ${name}` : 'Hi';
}

/**
 * Returns a contextual subline based on time of day
 * Rotates through variants deterministically by day
 */
export function getSubline(timeWindow: TimeWindow): string {
  const sublines: Record<TimeWindow, string[]> = {
    morning: [
      'Small wins add up fast.',
      "Let's make it a great day.",
      'Start strong, finish stronger.',
    ],
    midday: ['Keep the momentum going.', "You're doing great.", 'Stack a few quick wins.'],
    evening: ['Finish strong.', 'Almost there - keep going.', "You've got this."],
  };

  const options = sublines[timeWindow];
  const index = getDayIndex() % options.length;
  return options[index];
}

/**
 * Returns a friendly completion toast message
 * Rotates through variants deterministically by day
 */
export function getCompletionToast(entityType: 'habit' | 'todo' | 'journal'): string {
  const toasts: Record<string, string[]> = {
    habit: ['Nice! Momentum unlocked. 🎯', 'Keep it rolling! 🔥', 'Streak building! ⚡'],
    todo: ['One more down. ✅', 'Progress! 🎉', 'Crushed it. 💪'],
    journal: ['Captured. 📝', 'Logged! ✨', 'Noted. 💭'],
  };

  const options = toasts[entityType] || toasts.todo;
  const index = getDayIndex() % options.length;
  return options[index];
}

/**
 * Returns a dynamic mascot subline based on time window and progress
 * Rotates through variants deterministically by day
 */
export function getMascotSubline(timeWindow: TimeWindow, completedToday: number): string {
  const dayHash = getDayIndex();

  if (completedToday > 0) {
    const progressLines = ['Momentum unlocked.', 'Nice start!', 'Keep rolling.'];
    return progressLines[dayHash % progressLines.length];
  }

  if (timeWindow === 'morning') {
    const morningLines = [
      'Start strong, finish stronger.',
      'Small wins add up fast.',
      "Let's build momentum.",
    ];
    return morningLines[dayHash % morningLines.length];
  }

  if (timeWindow === 'midday') {
    const middayLines = ['Stack a few quick wins.', "You've got this.", 'Keep the energy up.'];
    return middayLines[dayHash % middayLines.length];
  }

  const eveningLines = ['Wind down with a light win?', 'Reflect and reset.', 'Easy does it.'];
  return eveningLines[dayHash % eveningLines.length];
}
