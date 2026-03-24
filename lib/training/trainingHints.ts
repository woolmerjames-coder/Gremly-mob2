/**
 * trainingHints.ts
 *
 * Generates contextual, tappable hints for the training meter bottom sheet.
 * Hints tell the user what to do next to train their Gremly faster.
 * Each hint links to a specific screen.
 * Pure functions only -- no store, no Supabase, no React.
 */

import type { UserTrainingData } from './trainingReadiness';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrainingHint {
  text: string;
  icon: string; // Lucide icon name (e.g., 'ArrowDownToLine', 'Moon')
  navigateTo: string; // React Navigation screen name
  navigateParams?: Record<string, unknown>;
  priority: number; // Lower number = higher priority = shown first
}

// ---------------------------------------------------------------------------
// Hint generation
// ---------------------------------------------------------------------------

/**
 * Builds a list of contextual hints based on what is missing from the
 * user's training data, sorted by priority. Returns the top 3.
 */
export function getTrainingHints(data: UserTrainingData): TrainingHint[] {
  const hints: TrainingHint[] = [];

  if (data.totalDrops < 3) {
    hints.push({
      text: 'Aim for 3+ drops a day. Everything counts.',
      icon: 'ArrowDownToLine',
      navigateTo: 'MindDrop',
      priority: 1,
    });
  }

  if (data.daysWithDrops < 3 && data.totalDrops >= 5) {
    hints.push({
      text: 'Drop thoughts whenever they hit you. Every day counts.',
      icon: 'ArrowDownToLine',
      navigateTo: 'MindDrop',
      priority: 2.5,
    });
  }

  if (data.totalSweeps < 2) {
    hints.push({
      text: 'Sweep every evening. Takes 2 minutes.',
      icon: 'Moon',
      navigateTo: 'Sweep',
      priority: 2,
    });
  }

  if (data.entityChatCount === 0 && data.totalDrops >= 3) {
    hints.push({
      text: 'Tap any drop and chat with Gremly about it.',
      icon: 'MessageCircle',
      navigateTo: 'Hub',
      priority: 3,
    });
  }

  if (!data.calendarConnected && data.totalDrops >= 3) {
    hints.push({
      text: 'Connect your calendar. Makes everything smarter.',
      icon: 'Calendar',
      navigateTo: 'CalendarSettings',
      priority: 4,
    });
  }

  if (data.journalCount === 0) {
    hints.push({
      text: 'Try journaling during your next sweep.',
      icon: 'BookOpen',
      navigateTo: 'Sweep',
      priority: 5,
    });
  }

  if (data.entityTypeCount < 2) {
    hints.push({
      text: "Try dropping a habit or how you're feeling.",
      icon: 'Repeat',
      navigateTo: 'MindDrop',
      priority: 6,
    });
  }

  if (data.briefCount === 0 && data.todosCount >= 3) {
    hints.push({
      text: 'Got enough to plan. Try Morning Brief.',
      icon: 'Sun',
      navigateTo: 'MorningBrief',
      priority: 7,
    });
  }

  if (data.daysWithDrops < 3) {
    hints.push({
      text: 'Drop something a few days in a row.',
      icon: 'ArrowDownToLine',
      navigateTo: 'MindDrop',
      priority: 8,
    });
  }

  hints.sort((a, b) => a.priority - b.priority);

  return hints.slice(0, 3);
}
