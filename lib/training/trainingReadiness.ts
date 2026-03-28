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

export function calculateTrainingReadiness(data: UserTrainingData): number {
  let score = 0;

  // Drop volume (0-20 points) - 15+ drops for full marks
  score += Math.min(data.totalDrops / 15, 1) * 20;

  // Day spread (0-30 points) - 5+ days for full marks
  // This is the heaviest weight because sustained engagement
  // over multiple days is the strongest signal of readiness
  score += Math.min(data.daysWithDrops / 5, 1) * 30;

  // Sweep engagement (0-25 points) - 3+ sweeps for full marks
  score += Math.min(data.totalSweeps / 3, 1) * 25;

  // Entity type diversity (0-10 points) - 3+ types for full marks
  score += Math.min(data.entityTypeCount / 3, 1) * 10;

  // Depth interactions (0-15 points) - 3+ total across journals,
  // entity chats, and briefs combined. Not binary anymore.
  const depthCount = data.journalCount + data.entityChatCount + data.briefCount;
  score += Math.min(depthCount / 3, 1) * 15;

  return Math.min(Math.round(score), 100);
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

import { getDateService } from '../date/DateService';

export function getTrainingDaysRemaining(trainingStartedAt: string | null): number | null {
  if (trainingStartedAt == null) return null;

  const startMs = new Date(trainingStartedAt).getTime();
  const dayNumber = Math.floor((getDateService().now().getTime() - startMs) / 86_400_000) + 1;

  return Math.max(0, 7 - dayNumber);
}
