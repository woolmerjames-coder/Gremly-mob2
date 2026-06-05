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
import type { WorldForEntity } from '../store/worldsSelectors';
import { getGremlyResponse } from './gremlyResponses';
import { getDateService } from '../date';

/**
 * Pre-computes all display metadata for a Sweep card from a candidate
 * and the user's spaces. This keeps the render component declarative
 * and moves all conditional logic to a single, testable function.
 *
 * @param candidate - The sweep candidate item
 * @param spaces - Array of user's spaces for name lookup
 * @returns Computed metadata for rendering the card
 */
export function computeSweepCardMeta(
  candidate: SweepCandidate,
  spaces: Space[],
  worldsForEntity: WorldForEntity[] = [],
): SweepCardMeta {
  // ─────────────────────────────────────────────────────────────────────────
  // Type chip
  // ─────────────────────────────────────────────────────────────────────────
  const typeChip: 'Todo' | 'Note' | 'Habit' =
    candidate.kind === 'todo' ? 'Todo' : candidate.kind === 'habit' ? 'Habit' : 'Note';

  // ─────────────────────────────────────────────────────────────────────────
  // Todo status (only for todos)
  // ─────────────────────────────────────────────────────────────────────────
  let todoStatus: SweepCardMeta['todoStatus'] = null;
  if (candidate.kind === 'todo') {
    // Check for reminder first (resurfacing from "remind me later")
    // Cast to access resurface_at which may not be in Supabase generated types yet
    const resurfaceAt = (candidate.raw as { resurface_at?: string | null }).resurface_at;
    if (resurfaceAt) {
      todoStatus = 'reminder';
    } else if (candidate.isOverdue) {
      todoStatus = 'overdue';
    } else if (candidate.isDueToday) {
      todoStatus = 'due_today';
    } else {
      // Check if due tomorrow
      const dueDay = candidate.raw.due_day;
      if (dueDay) {
        const ds = getDateService();
        const tomorrowStr = ds.addDays(ds.today(), 1);
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
  // Habit status (only for habits)
  // ─────────────────────────────────────────────────────────────────────────
  const habitStatus: SweepCardMeta['habitStatus'] =
    candidate.kind === 'habit' ? 'needs_start_date' : null;

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
  // Reschedule count (todos only)
  // ─────────────────────────────────────────────────────────────────────────
  const rescheduleCount =
    candidate.kind === 'todo' ? (candidate.raw.sweep_reschedule_count ?? 0) : 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Gremly response
  // ─────────────────────────────────────────────────────────────────────────
  const gremlyResponse = getGremlyResponse(candidate, isNew, isLockedIn, rescheduleCount);

  // ─────────────────────────────────────────────────────────────────────────
  // Note card type (only for notes)
  // ─────────────────────────────────────────────────────────────────────────
  let noteCardType: SweepCardMeta['noteCardType'] = null;
  if (candidate.kind === 'note') {
    if ((candidate.raw as { target_date?: string | null }).target_date) {
      noteCardType = 'event';
    } else if (logSubtype === 'idea') {
      noteCardType = 'idea';
    } else {
      noteCardType = 'general';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Resurfaced-from date (only for notes with resurface_at)
  // ─────────────────────────────────────────────────────────────────────────
  let resurfacedFromDate: string | null = null;
  if (candidate.kind === 'note') {
    const resurface_at = (candidate.raw as { resurface_at?: string | null }).resurface_at;
    if (resurface_at) {
      try {
        resurfacedFromDate = format(new Date(resurface_at + 'T12:00:00'), 'MMM d');
      } catch {
        resurfacedFromDate = null;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Resurface count (only for notes)
  // ─────────────────────────────────────────────────────────────────────────
  const resurfaceCount =
    candidate.kind === 'note'
      ? ((candidate.raw as { resurface_count?: number }).resurface_count ?? 0)
      : 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Event date fields (only for event notes)
  // ─────────────────────────────────────────────────────────────────────────
  const eventDate: string | null =
    candidate.kind === 'note' && (candidate.raw as { target_date?: string | null }).target_date
      ? ((candidate.raw as { target_date?: string | null }).target_date as string)
      : null;

  let eventDateFormatted: string | null = null;
  if (eventDate) {
    try {
      eventDateFormatted = format(new Date(eventDate + 'T12:00:00'), 'EEEE, MMMM d');
    } catch {
      eventDateFormatted = null;
    }
  }

  let daysUntilEvent: number | null = null;
  if (eventDate) {
    try {
      const ds = getDateService();
      daysUntilEvent = ds.daysBetween(ds.today(), eventDate);
    } catch {
      daysUntilEvent = null;
    }
  }

  const world =
    worldsForEntity.length > 0
      ? {
          name: worldsForEntity[0].name,
          accentColor: worldsForEntity[0].accentColor,
          extraCount: worldsForEntity.length - 1,
        }
      : undefined;

  return {
    typeChip,
    todoStatus,
    logSubtype,
    habitStatus,
    isNew,
    resurfacingDate,
    spaceName,
    spaceId,
    isLockedIn,
    gremlyResponse,
    rescheduleCount,
    noteCardType,
    resurfacedFromDate,
    resurfaceCount,
    eventDate,
    eventDateFormatted,
    daysUntilEvent,
    world,
  };
}
