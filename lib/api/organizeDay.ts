/**
 * Organize Day API
 *
 * Calls the cortex worker to get AI-powered task assignments for Morning Brief.
 */

import Constants from 'expo-constants';
import type { Todo, Habit } from '../types';
import type { CalendarEvent } from '../calendar/CalendarClient';
import type { DayCapacity } from '../capacity';
import { calculateRealisticAvailableMinutes } from '../capacity';
import { computeTotalMinutes, validateEnergyType } from '../planning';
import { computeTimeGaps, getBlockBoundaryIso, type TimeGap } from '../timeGaps';
import { getDateService } from '../date/DateService';

// =============================================================================
// TYPES
// =============================================================================

export interface OrganizeDayTask {
  id: string;
  title: string;
  type: 'todo' | 'habit';
  estimateMinutes: number | null;
  visibleMinutes: number;
  totalMinutes: number;
  energyType: 'deep_focus' | 'administrative' | 'physical' | 'social' | 'quick';
  dueDate: string | null;
  priority: 'high' | 'medium' | 'low' | null;
  isLockedIn: boolean;
  currentBlock: 'morning' | 'day' | 'evening' | null;
  timeWindowPreference: 'morning' | 'day' | 'evening' | 'any' | null;
  /** For habits: whether the weekly/monthly goal is already met */
  isAtGoal?: boolean;
  /** User has locked this task as a priority via capacity gate */
  locked?: boolean;
}

export interface OrganizeDayCalendarEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
}

export interface OrganizeDayGap {
  startIso: string;
  endIso: string;
  durationMinutes: number;
}

export interface OrganizeDayBlock {
  startHour: number;
  endHour: number;
  availableMinutes: number;
  realisticAvailableMinutes: number;
  gaps: OrganizeDayGap[];
}

export interface OrganizeDayRequest {
  tasks: OrganizeDayTask[];
  calendarEvents: OrganizeDayCalendarEvent[];
  blocks: {
    morning: OrganizeDayBlock;
    day: OrganizeDayBlock;
    evening: OrganizeDayBlock;
  };
  currentHour: number;
}

export interface TaskAssignment {
  taskId: string;
  block: 'morning' | 'day' | 'evening';
  reason: string;
  /** If set, slot this task into a specific gap at this time */
  scheduledStartIso?: string | null;
}

export interface TaskOverflow {
  taskId: string;
  reason: string;
}

export interface OrganizeDayResponse {
  assignments: TaskAssignment[];
  overflow: TaskOverflow[];
  reasoning: string[];
  summary: string;
  latency_ms: number;
  error?: string;
  detail?: string;
}

// =============================================================================
// API CLIENT
// =============================================================================

const CORTEX_URL =
  Constants.expoConfig?.extra?.CORTEX_URL ||
  process.env.EXPO_PUBLIC_CORTEX_URL ||
  'https://gentle-thunder-5854.woolmerjames.workers.dev';

export async function organizeDay(request: OrganizeDayRequest): Promise<OrganizeDayResponse> {
  const startTime = getDateService().now().getTime();

  console.log('[organizeDay] Calling API', {
    tasks: request.tasks.length,
    events: request.calendarEvents.length,
    currentHour: request.currentHour,
  });

  try {
    const response = await fetch(CORTEX_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'organize-day',
        ...request,
      }),
    });

    if (!response.ok) {
      console.log('[organizeDay] HTTP error', { status: response.status });
      return {
        assignments: [],
        overflow: request.tasks.map((t) => ({ taskId: t.id, reason: 'API request failed' })),
        reasoning: [],
        summary: 'Could not reach AI. Tasks left flexible.',
        latency_ms: getDateService().now().getTime() - startTime,
        error: `HTTP ${response.status}`,
      };
    }

    const data: OrganizeDayResponse = await response.json();

    console.log('[organizeDay] Raw response', JSON.stringify(data, null, 2));

    console.log('[organizeDay] Success', {
      assigned: data.assignments?.length ?? 0,
      overflow: data.overflow?.length ?? 0,
      latency_ms: data.latency_ms,
    });

    return data;
  } catch (err) {
    console.log('[organizeDay] Network error', { error: String(err) });
    return {
      assignments: [],
      overflow: request.tasks.map((t) => ({ taskId: t.id, reason: 'Network error' })),
      reasoning: [],
      summary: 'Network error. Tasks left flexible.',
      latency_ms: getDateService().now().getTime() - startTime,
      error: 'network_error',
      detail: String(err),
    };
  }
}

// =============================================================================
// HELPER: Build request from store data
// =============================================================================

interface BuildRequestParams {
  todos: Todo[];
  habits: Habit[];
  calendarEvents: CalendarEvent[];
  capacity: DayCapacity;
  today: string;
  currentHour: number;
  /** IDs hidden via "Not today" — excluded from organize request */
  hiddenTodayIds?: string[];
  /** Map of habitId → completions in rolling 7 days */
  habitRolling7?: Map<string, number>;
  /** Map of habitId → completions in rolling 30 days */
  habitRolling30?: Map<string, number>;
  /** IDs of tasks the user has locked as priorities via capacity gate */
  lockedIds?: Set<string>;
}

export function buildOrganizeDayRequest(params: BuildRequestParams): OrganizeDayRequest {
  const {
    todos,
    habits,
    calendarEvents,
    capacity,
    today,
    currentHour,
    hiddenTodayIds = [],
    habitRolling7,
    habitRolling30,
    lockedIds,
  } = params;

  // Convert todos to OrganizeDayTask format
  const todoTasks: OrganizeDayTask[] = todos
    .filter(
      (t) =>
        !t.archived && !t.completed_at && t.due_day === today && !hiddenTodayIds.includes(t.id),
    )
    .map((t) => {
      const estimateMinutes = t.time_estimate_minutes ?? 30;
      const prepBuffer = (t as any).prep_buffer_minutes ?? 0;
      const cooldownBuffer = (t as any).cooldown_buffer_minutes ?? 0;
      return {
        id: t.id,
        title: t.name || t.title || '',
        type: 'todo' as const,
        estimateMinutes: t.time_estimate_minutes ?? null,
        visibleMinutes: estimateMinutes,
        totalMinutes: computeTotalMinutes(estimateMinutes, prepBuffer, cooldownBuffer),
        energyType: validateEnergyType((t as any).energy_type),
        dueDate: t.due_day ?? null,
        priority: null, // Todo type doesn't have priority
        isLockedIn: t.locked_in ?? false,
        currentBlock:
          t.time_window && t.time_window !== 'any'
            ? (t.time_window as 'morning' | 'day' | 'evening')
            : null,
        timeWindowPreference: t.time_window as 'morning' | 'day' | 'evening' | 'any' | null,
        ...(lockedIds?.has(t.id) && { locked: true }),
      };
    });

  // Convert habits to OrganizeDayTask format
  const habitTasks: OrganizeDayTask[] = habits
    .filter((h) => {
      if (h.archived) return false;
      if (hiddenTodayIds.includes(h.id)) return false;
      if (!h.start_date || h.start_date > today) return false;
      if (h.end_date && h.end_date < today) return false;
      return true;
    })
    .map((h) => {
      const estimateMinutes = h.time_estimate_minutes ?? 30;
      const prepBuffer = (h as any).prep_buffer_minutes ?? 0;
      const cooldownBuffer = (h as any).cooldown_buffer_minutes ?? 0;
      return {
        id: h.id,
        title: h.name,
        type: 'habit' as const,
        estimateMinutes: h.time_estimate_minutes ?? null,
        visibleMinutes: estimateMinutes,
        totalMinutes: computeTotalMinutes(estimateMinutes, prepBuffer, cooldownBuffer),
        energyType: validateEnergyType((h as any).energy_type),
        dueDate: null,
        priority: null,
        isLockedIn: false,
        currentBlock:
          h.time_window && h.time_window !== 'any'
            ? (h.time_window as 'morning' | 'day' | 'evening')
            : null,
        timeWindowPreference: h.time_window as 'morning' | 'day' | 'evening' | 'any' | null,
        isAtGoal: (() => {
          const cadence = h.cadence ?? 'daily';
          const target = h.target_per_period ?? 1;
          if (cadence === 'weekly' && habitRolling7) {
            return (habitRolling7.get(h.id) ?? 0) >= target;
          }
          if (cadence === 'monthly' && habitRolling30) {
            return (habitRolling30.get(h.id) ?? 0) >= target;
          }
          return false;
        })(),
        ...(lockedIds?.has(h.id) && { locked: true }),
      };
    });

  // Convert calendar events
  const events: OrganizeDayCalendarEvent[] = calendarEvents.map((e) => ({
    id: `${e.provider}-${e.providerEventId}`,
    title: e.title,
    startAt: e.startAt,
    endAt: e.endAt,
    durationMinutes: Math.round(
      (new Date(e.endAt).getTime() - new Date(e.startAt).getTime()) / (1000 * 60),
    ),
  }));

  // Calculate realistic available time for each block
  const realisticMorning = calculateRealisticAvailableMinutes(
    'morning',
    calendarEvents,
    today,
    {},
    undefined,
  );
  const realisticDay = calculateRealisticAvailableMinutes(
    'day',
    calendarEvents,
    today,
    {},
    undefined,
  );
  const realisticEvening = calculateRealisticAvailableMinutes(
    'evening',
    calendarEvents,
    today,
    {},
    undefined,
  );

  // Compute gaps for each block
  const morningBounds = getBlockBoundaryIso(
    today,
    capacity.blocks.morning.startHour,
    capacity.blocks.morning.endHour,
  );
  const dayBounds = getBlockBoundaryIso(
    today,
    capacity.blocks.day.startHour,
    capacity.blocks.day.endHour,
  );
  const eveningBounds = getBlockBoundaryIso(
    today,
    capacity.blocks.evening.startHour,
    capacity.blocks.evening.endHour,
  );

  const morningGaps = computeTimeGaps(calendarEvents, morningBounds.startIso, morningBounds.endIso);
  const dayGaps = computeTimeGaps(calendarEvents, dayBounds.startIso, dayBounds.endIso);
  const eveningGaps = computeTimeGaps(calendarEvents, eveningBounds.startIso, eveningBounds.endIso);

  const toGapData = (gaps: typeof morningGaps): OrganizeDayGap[] =>
    gaps.map((g) => ({
      startIso: g.startIso,
      endIso: g.endIso,
      durationMinutes: g.durationMinutes,
    }));

  const blocks = {
    morning: {
      startHour: capacity.blocks.morning.startHour,
      endHour: capacity.blocks.morning.endHour,
      availableMinutes: capacity.blocks.morning.availableMinutes,
      realisticAvailableMinutes: realisticMorning,
      gaps: toGapData(morningGaps),
    },
    day: {
      startHour: capacity.blocks.day.startHour,
      endHour: capacity.blocks.day.endHour,
      availableMinutes: capacity.blocks.day.availableMinutes,
      realisticAvailableMinutes: realisticDay,
      gaps: toGapData(dayGaps),
    },
    evening: {
      startHour: capacity.blocks.evening.startHour,
      endHour: capacity.blocks.evening.endHour,
      availableMinutes: capacity.blocks.evening.availableMinutes,
      realisticAvailableMinutes: realisticEvening,
      gaps: toGapData(eveningGaps),
    },
  };

  return {
    tasks: [...todoTasks, ...habitTasks],
    calendarEvents: events,
    blocks,
    currentHour,
  };
}
