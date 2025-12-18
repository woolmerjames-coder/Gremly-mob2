/**
 * Compute Sweep Card Metadata
 *
 * Pre-computes display metadata for Sweep cards to keep the render
 * component clean and declarative. All conditional logic for determining
 * chip labels, status, and Gremly responses lives here.
 *
 * Benefits:
 * - Single source of truth for card display logic
 * - Easy to test in isolation
 * - Keeps SweepCard component purely presentational
 */

import { format } from 'date-fns';
import type { SweepCandidate, SweepCardMeta } from './types';
import type { Space } from '../types';
import { getGremlyResponse } from './gremlyResponses';

/**
 * Pre-computes all display metadata for a Sweep card from a candidate
 * and the user's spaces. This keeps the render component declarative
 * and moves all conditional logic to a single, testable function.
 *
 * @param candidate - The sweep candidate item
 * @param spaces - Array of user's spaces for name lookup
 * @returns Computed metadata for rendering the card
 */
export function computeSweepCardMeta(candidate: SweepCandidate, spaces: Space[]): SweepCardMeta {
  // ─────────────────────────────────────────────────────────────────────────
  // Type chip
  // ─────────────────────────────────────────────────────────────────────────
  const typeChip: 'Todo' | 'Log' = candidate.kind === 'todo' ? 'Todo' : 'Log';

  // ─────────────────────────────────────────────────────────────────────────
  // Todo status (only for todos)
  // ─────────────────────────────────────────────────────────────────────────
  let todoStatus: SweepCardMeta['todoStatus'] = null;
  if (candidate.kind === 'todo') {
    if (candidate.isOverdue) {
      todoStatus = 'overdue';
    } else if (candidate.isDueToday) {
      todoStatus = 'due_today';
    } else {
      // Check if due tomorrow
      const dueDay = candidate.raw.due_day;
      if (dueDay) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        if (dueDay === tomorrowStr) {
          todoStatus = 'due_tomorrow';
        }
      }
      if (!todoStatus && !dueDay) {
        todoStatus = 'unscheduled';
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Log subtype (only for notes)
  // ─────────────────────────────────────────────────────────────────────────
  let logSubtype: SweepCardMeta['logSubtype'] = null;
  if (candidate.kind === 'note') {
    const subtype = candidate.raw.subtype;
    if (subtype === 'idea') {
      logSubtype = 'idea';
    } else if (subtype === 'journal') {
      logSubtype = 'journal';
    } else {
      logSubtype = 'general';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Is new vs resurfacing
  // ─────────────────────────────────────────────────────────────────────────
  const isNew = !candidate.skippedInSweepAt;

  // ─────────────────────────────────────────────────────────────────────────
  // Resurfacing date (format the skipped date)
  // ─────────────────────────────────────────────────────────────────────────
  let resurfacingDate: string | null = null;
  if (candidate.skippedInSweepAt) {
    try {
      resurfacingDate = format(new Date(candidate.skippedInSweepAt), 'MMM d');
    } catch {
      resurfacingDate = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Space lookup
  // ─────────────────────────────────────────────────────────────────────────
  const spaceId = candidate.raw.space_id || null;
  let spaceName: string | null = null;
  if (spaceId && spaces.length > 0) {
    const space = spaces.find((s) => s.id === spaceId);
    if (space) {
      spaceName = space.name;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Locked-in status (commitment field on todos)
  // ─────────────────────────────────────────────────────────────────────────
  const isLockedIn = candidate.kind === 'todo' && candidate.raw.commitment === true;

  // ─────────────────────────────────────────────────────────────────────────
  // Gremly response
  // ─────────────────────────────────────────────────────────────────────────
  const gremlyResponse = getGremlyResponse(candidate, isNew, isLockedIn);

  return {
    typeChip,
    todoStatus,
    logSubtype,
    isNew,
    resurfacingDate,
    spaceName,
    spaceId,
    isLockedIn,
    gremlyResponse,
  };
}
