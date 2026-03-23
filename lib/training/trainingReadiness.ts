/**
 * trainingReadiness.ts
 *
 * Calculates a data-readiness score (0-100) that determines when a user
 * has generated enough data for the AI weekly summary to be genuinely personal.
 * Pure functions only -- no Supabase calls, no store imports.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserTrainingData {
  totalDrops: number;
  daysWithDrops: number;
  totalSweeps: number;
  entityTypeCount: number; // distinct types: todo, habit, journal, note
  journalCount: number;
  entityChatCount: number;
  briefCount: number;
  todosCount: number; // used by hints only, not by scoring
  calendarConnected: boolean; // used by hints only, not by scoring
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GRADUATION_THRESHOLD = 80;

// ---------------------------------------------------------------------------
// Readiness score
// ---------------------------------------------------------------------------

/**
 * Calculates a 0-100 readiness score based on how much usable data the
 * weekly summary pipeline has to work with.
 *
 * Factors and weights:
 *   Drop volume (25) - "Week in Review" card needs topics
 *   Day spread  (25) - Review needs longitudinal signal
 *   Sweep count (20) - "Patterns" card needs processing data
 *   Entity diversity (15) - "Patterns" needs type contrast
 *   Depth signal (15) - "Insights" needs emotional/planning context (binary)
 */
export function calculateTrainingReadiness(data: UserTrainingData): number {
  // Drop volume: linear 0-25, full at 8 drops
  const dropScore = Math.min(data.totalDrops / 8, 1) * 25;

  // Day spread: linear 0-25, full at 3 days
  const dayScore = Math.min(data.daysWithDrops / 3, 1) * 25;

  // Sweep count: linear 0-20, full at 2 sweeps
  const sweepScore = Math.min(data.totalSweeps / 2, 1) * 20;

  // Entity type diversity: linear 0-15, full at 2 types
  const diversityScore = Math.min(data.entityTypeCount / 2, 1) * 15;

  // Depth signal: binary 0 or 15
  const hasDepth =
    data.journalCount > 0 || data.entityChatCount > 0 || data.briefCount > 0;
  const depthScore = hasDepth ? 15 : 0;

  const total = dropScore + dayScore + sweepScore + diversityScore + depthScore;

  return Math.min(Math.round(total), 100);
}

// ---------------------------------------------------------------------------
// Readiness label
// ---------------------------------------------------------------------------

export function getReadinessLabel(score: number): string {
  if (score <= 20) return 'Just getting started';
  if (score <= 40) return 'Getting to know you';
  if (score <= 60) return 'Learning your patterns';
  if (score <= 80) return 'Almost trained';
  if (score < 100) return 'Nearly there';
  return 'Ready!';
}

// ---------------------------------------------------------------------------
// Days remaining in the 7-day training window
// ---------------------------------------------------------------------------

export function getTrainingDaysRemaining(
  trainingStartedAt: string | null,
): number | null {
  if (trainingStartedAt == null) return null;

  const startMs = new Date(trainingStartedAt).getTime();
  const dayNumber = Math.floor((Date.now() - startMs) / 86_400_000) + 1;

  return Math.max(0, 7 - dayNumber);
}
