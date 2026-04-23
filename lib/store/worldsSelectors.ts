/**
 * Worlds & Chapters selectors (Phase 4a.1)
 *
 * Memoized derivations on top of useGremlyStore state.
 * See docs/worlds-chapters-phase-4a-spec.md section 7 for the full shape.
 * This batch covers: base state selectors and the four derived maps.
 */

import { createSelector } from 'reselect';
import { useGremlyStore } from './useGremlyStore';
import { today } from '../date/DateService';
import type { GremlyState } from './useGremlyStore';
import type { Chapter, DropType, AssignedBy } from '../supabase/types';
import type { Todo, Habit, Note } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Base state selectors (not memoized)
// ─────────────────────────────────────────────────────────────────────────────

export const selectWorlds = (s: GremlyState) => s.worlds;
export const selectChapters = (s: GremlyState) => s.chapters;
export const selectLifeContexts = (s: GremlyState) => s.lifeContexts;
export const selectChapterWorldLinks = (s: GremlyState) => s.chapterWorldLinks;
export const selectDropWorldLinks = (s: GremlyState) => s.dropWorldLinks;
export const selectDropChapterLinks = (s: GremlyState) => s.dropChapterLinks;
export const selectDropContextLinks = (s: GremlyState) => s.dropContextLinks;
export const selectWorldObservations = (s: GremlyState) => s.worldObservations;

// ─────────────────────────────────────────────────────────────────────────────
// Shared DropRef type
// ─────────────────────────────────────────────────────────────────────────────

export interface DropRef {
  drop_id: string;
  drop_type: DropType;
  relevance_score: number;
  reason: string | null;
  last_confirmed_at: string | null;
  assigned_by: AssignedBy;
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived maps: drop refs by entity id
// ─────────────────────────────────────────────────────────────────────────────

export const selectWorldIdToDropRefs = createSelector(
  [selectDropWorldLinks],
  (links): Map<string, DropRef[]> => {
    const map = new Map<string, DropRef[]>();
    for (const l of links) {
      const ref: DropRef = {
        drop_id: l.drop_id,
        drop_type: l.drop_type,
        relevance_score: l.relevance_score,
        reason: l.reason,
        last_confirmed_at: l.last_confirmed_at,
        assigned_by: l.assigned_by,
      };
      const arr = map.get(l.world_id);
      if (arr) arr.push(ref);
      else map.set(l.world_id, [ref]);
    }
    return map;
  },
);

export const selectChapterIdToDropRefs = createSelector(
  [selectDropChapterLinks],
  (links): Map<string, DropRef[]> => {
    const map = new Map<string, DropRef[]>();
    for (const l of links) {
      const ref: DropRef = {
        drop_id: l.drop_id,
        drop_type: l.drop_type,
        relevance_score: l.relevance_score,
        reason: l.reason,
        last_confirmed_at: l.last_confirmed_at,
        assigned_by: l.assigned_by,
      };
      const arr = map.get(l.chapter_id);
      if (arr) arr.push(ref);
      else map.set(l.chapter_id, [ref]);
    }
    return map;
  },
);

export const selectContextIdToDropRefs = createSelector(
  [selectDropContextLinks],
  (links): Map<string, DropRef[]> => {
    const map = new Map<string, DropRef[]>();
    for (const l of links) {
      const ref: DropRef = {
        drop_id: l.drop_id,
        drop_type: l.drop_type,
        relevance_score: l.relevance_score,
        reason: l.reason,
        last_confirmed_at: l.last_confirmed_at,
        assigned_by: l.assigned_by,
      };
      const arr = map.get(l.context_id);
      if (arr) arr.push(ref);
      else map.set(l.context_id, [ref]);
    }
    return map;
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// selectWorldIdToChapters
//
// A chapter belongs to a world via two paths:
//   (a) chapters.primary_world_id
//   (b) chapter_world_links rows with relevance_score >= 0.5
// Both sources are merged; duplicates are deduplicated by chapter id.
//
// Ordering: open chapters (suggested/upcoming/active) first, sorted by
// start_date desc; then closed chapters sorted by end_date desc. Nulls last.
// ─────────────────────────────────────────────────────────────────────────────

export const selectWorldIdToChapters = createSelector(
  [selectChapters, selectChapterWorldLinks],
  (chapters, links): Map<string, Chapter[]> => {
    const byId = new Map<string, Chapter>();
    for (const c of chapters) byId.set(c.id, c);

    const worldToChapterIds = new Map<string, Set<string>>();
    const add = (worldId: string | null | undefined, chapterId: string) => {
      if (!worldId) return;
      const set = worldToChapterIds.get(worldId);
      if (set) set.add(chapterId);
      else worldToChapterIds.set(worldId, new Set([chapterId]));
    };

    for (const c of chapters) add(c.primary_world_id, c.id);
    for (const l of links) {
      if (l.relevance_score >= 0.5) add(l.world_id, l.chapter_id);
    }

    const result = new Map<string, Chapter[]>();
    const isOpen = (c: Chapter) => c.phase !== 'closed';

    for (const [worldId, chapterIdSet] of worldToChapterIds) {
      const list: Chapter[] = [];
      for (const id of chapterIdSet) {
        const c = byId.get(id);
        if (c) list.push(c);
      }
      list.sort((a, b) => {
        const aOpen = isOpen(a),
          bOpen = isOpen(b);
        if (aOpen !== bOpen) return aOpen ? -1 : 1;
        if (aOpen) {
          return (b.start_date ?? '').localeCompare(a.start_date ?? '');
        } else {
          return (b.end_date ?? '').localeCompare(a.end_date ?? '');
        }
      });
      result.set(worldId, list);
    }
    return result;
  },
);

// ============================================================================
// Palette resolver
// ============================================================================

export interface WorldPalette {
  base: string;
  tint: string;
  dot: string;
  textOnBase: string;
}

// NOTE: values mirror the spec appendix A and the mockup palette.
// These move to design/tokens.ts in sub-phase 4a.2 under `worldPalette` key.
const ARCHETYPE_PALETTE: Record<import('../supabase/types').WorldArchetype, WorldPalette> = {
  creative: {
    base: '#2E5540',
    tint: 'rgba(143,163,136,0.22)',
    dot: '#8FA388',
    textOnBase: '#F4EDD7',
  },
  professional: {
    base: '#3A4C60',
    tint: 'rgba(138,148,165,0.22)',
    dot: '#8A94A5',
    textOnBase: '#F4EDD7',
  },
  wellness_body: {
    base: '#8C6A2A',
    tint: 'rgba(193,152,88,0.2)',
    dot: '#C19858',
    textOnBase: '#F4EDD7',
  },
  wellness_mind: {
    base: '#5B4F8C',
    tint: 'rgba(162,153,201,0.22)',
    dot: '#A299C9',
    textOnBase: '#F4EDD7',
  },
  relational: {
    base: '#8C3F1E',
    tint: 'rgba(197,139,125,0.22)',
    dot: '#C58B7D',
    textOnBase: '#F4EDD7',
  },
  domestic: {
    base: '#6A6F76',
    tint: 'rgba(122,118,101,0.12)',
    dot: '#A59E88',
    textOnBase: '#F4EDD7',
  },
  learning: {
    base: '#3A4C60',
    tint: 'rgba(138,148,165,0.22)',
    dot: '#8A94A5',
    textOnBase: '#F4EDD7',
  },
  generic: {
    base: '#3A4C60',
    tint: 'rgba(138,148,165,0.22)',
    dot: '#8A94A5',
    textOnBase: '#F4EDD7',
  },
};

// Priority order for tie-breaking between equal-weight archetypes.
const ARCHETYPE_PRIORITY: import('../supabase/types').WorldArchetype[] = [
  'creative',
  'professional',
  'wellness_body',
  'wellness_mind',
  'relational',
  'domestic',
  'learning',
  'generic',
];

export function selectWorldPalette(state: GremlyState, worldId: string): WorldPalette {
  const world = state.worlds.find((w) => w.id === worldId);
  if (!world) return ARCHETYPE_PALETTE.generic;

  // Future path: honor world.visual_style.color when classifier authors it (deferred to 4b).
  // For 4a, always use archetype-derived palette.

  const archetypes = world.archetypes ?? [];
  if (archetypes.length === 0) return ARCHETYPE_PALETTE.generic;

  // Find max weight; if tie, use priority order.
  let bestType = archetypes[0].type;
  let bestWeight = archetypes[0].weight;
  for (let i = 1; i < archetypes.length; i++) {
    const a = archetypes[i];
    if (a.weight > bestWeight) {
      bestWeight = a.weight;
      bestType = a.type;
    } else if (a.weight === bestWeight) {
      if (ARCHETYPE_PRIORITY.indexOf(a.type) < ARCHETYPE_PRIORITY.indexOf(bestType)) {
        bestType = a.type;
      }
    }
  }
  return ARCHETYPE_PALETTE[bestType] ?? ARCHETYPE_PALETTE.generic;
}

// ============================================================================
// Dormancy resolver
// ============================================================================

export type DormancyState = 'active' | 'cooling' | 'quiet' | 'dormant' | 'archived';

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function selectWorldDormancy(
  state: GremlyState,
  worldId: string,
  now: Date = today(),
): DormancyState {
  const world = state.worlds.find((w) => w.id === worldId);
  if (!world) return 'active';

  // Step 1
  if (world.phase === 'archived') return 'archived';
  // Step 2
  if (world.phase === 'dormant') return 'dormant';

  // Step 3: compute daysSinceSignal; if last_signal_at null, fall back to created_at then 30-day rule
  const signalRef = world.last_signal_at ?? world.created_at;
  if (!signalRef) return 'active';
  const daysSinceSignal = daysBetween(new Date(signalRef), now);

  // Step 4
  if (daysSinceSignal > 60) return 'dormant';
  // Step 5
  if (daysSinceSignal > 30) return 'quiet';

  // Step 6
  const vNumRaw = world.signal_velocity;
  const vNum = typeof vNumRaw === 'number' ? vNumRaw : parseFloat(String(vNumRaw ?? ''));
  if (world.signal_velocity_delta === 'declining' && !isNaN(vNum) && vNum < 1.5) return 'cooling';

  // Step 7
  return 'active';
}

// ============================================================================
// Emerging detector
// ============================================================================

export function selectWorldIsEmerging(
  state: GremlyState,
  worldId: string,
  now: Date = today(),
): boolean {
  const world = state.worlds.find((w) => w.id === worldId);
  if (!world) return false;
  if (world.phase !== 'candidate') return false;
  if (world.source === 'user') return false;
  if (!world.first_signal_at) return false;
  const daysSinceFirst = daysBetween(new Date(world.first_signal_at), now);
  return daysSinceFirst < 30 && world.signal_velocity_delta === 'growing';
}

// ============================================================================
// People per world
// ============================================================================

export interface WorldPerson {
  id: string;
  name: string;
  initials: string;
  dropCount: number;
}

let peopleWarningLogged = false;

export function selectWorldPeople(state: GremlyState, _worldId: string): WorldPerson[] {
  // Primary path requires entity_people + people in state. If either is absent, return empty.
  // Fallback parsing of notes.tags / body is deferred to 4a.4.
  const anyState = state as unknown as { entityPeople?: unknown[]; people?: unknown[] };
  if (!Array.isArray(anyState.entityPeople) || !Array.isArray(anyState.people)) {
    if (!peopleWarningLogged) {
      console.warn(
        '[worldsSelectors] selectWorldPeople: entity_people / people not hydrated yet; returning empty. Fallback lands in 4a.4.',
      );
      peopleWarningLogged = true;
    }
    return [];
  }
  return [];
}

// ============================================================================
// Weekly summary card
// ============================================================================

function startOfIsoWeek(d: Date): Date {
  const day = d.getDay() || 7; // Sun = 7
  const offset = day - 1; // Mon = 0
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - offset);
  return r;
}

export function selectWeekInProgressHeadline(state: GremlyState, now: Date = today()): string {
  const weekStart = startOfIsoWeek(now);
  const weekStartIso = weekStart.toISOString();

  const dropsThisWeek = [
    ...state.todos.filter((t) => t.created_at >= weekStartIso),
    ...state.habits.filter((h) => h.created_at >= weekStartIso),
    ...state.notes.filter((n) => n.created_at >= weekStartIso),
  ];
  const dropCount = dropsThisWeek.length;

  if (dropCount === 0) {
    return 'Gremly is listening. Drop something when you have a moment.';
  }

  // Top world by new drop link count this week
  const linksThisWeek = state.dropWorldLinks.filter((l) => l.created_at >= weekStartIso);
  const worldCounts = new Map<string, number>();
  for (const l of linksThisWeek) {
    worldCounts.set(l.world_id, (worldCounts.get(l.world_id) ?? 0) + 1);
  }
  let topWorldName = '';
  if (worldCounts.size > 0) {
    let topCount = -1;
    for (const [wid, count] of worldCounts) {
      const w = state.worlds.find((ww) => ww.id === wid);
      const wname = w?.display_name ?? w?.name ?? '';
      if (count > topCount || (count === topCount && wname.localeCompare(topWorldName) < 0)) {
        topCount = count;
        topWorldName = wname;
      }
    }
  }

  // Nearest upcoming chapter within 30 days
  const thirtyOut = new Date(now);
  thirtyOut.setDate(thirtyOut.getDate() + 30);
  const upcomingChapters = state.chapters
    .filter((c) => c.end_date && c.phase !== 'closed')
    .filter((c) => {
      const ed = new Date(c.end_date as string);
      return ed >= now && ed <= thirtyOut;
    })
    .sort((a, b) => (a.end_date ?? '').localeCompare(b.end_date ?? ''));

  let chapterReminder = '';
  if (upcomingChapters[0]) {
    const c = upcomingChapters[0];
    const days = Math.ceil(
      (new Date(c.end_date as string).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    chapterReminder = `${c.title} in ${days} days`;
  }

  const parts: string[] = [`${dropCount} drops this week.`];
  if (topWorldName) parts.push(`Mostly ${topWorldName}.`);
  if (chapterReminder) parts.push(`${chapterReminder}.`);
  return parts.join(' ');
}

export type WeeklySummaryCardState =
  | { kind: 'new_unread'; summary: any /* WeeklySummary type already exists in types.ts */ }
  | { kind: 'read_or_in_progress'; headline: string }
  | { kind: 'never' };

export function selectWeeklySummaryCardState(
  state: GremlyState,
  now: Date = today(),
): WeeklySummaryCardState {
  const summaries = (state as unknown as { weeklySummaries?: any[] }).weeklySummaries ?? [];
  if (summaries.length === 0) return { kind: 'never' };

  const weekStart = startOfIsoWeek(now);
  const weekStartIsoDate = weekStart.toISOString().slice(0, 10);

  const currentWeek = summaries.find(
    (s: any) => (s.week_start_date ?? '').slice(0, 10) === weekStartIsoDate,
  );

  if (currentWeek && !currentWeek.last_viewed_at) {
    return { kind: 'new_unread', summary: currentWeek };
  }

  return { kind: 'read_or_in_progress', headline: selectWeekInProgressHeadline(state, now) };
}

// ============================================================================
// Proposal count (stub for 4b)
// ============================================================================

// TODO(4b): read from events table + proposal_decisions cooldown table
// See docs/worlds-chapters-phase-4a-spec.md section 12.
export function selectPendingProposalCount(_state: GremlyState): number {
  return 0;
}

// ============================================================================
// React hooks
// ============================================================================

export const useWorlds = () => useGremlyStore(selectWorlds);
export const useWorldById = (worldId: string) =>
  useGremlyStore((s) => s.worlds.find((w) => w.id === worldId) ?? null);
export const useChapters = () => useGremlyStore(selectChapters);
export const useChapterById = (chapterId: string) =>
  useGremlyStore((s) => s.chapters.find((c) => c.id === chapterId) ?? null);
export const useLifeContexts = () => useGremlyStore(selectLifeContexts);

export const useChaptersForWorld = (worldId: string) =>
  useGremlyStore((s) => selectWorldIdToChapters(s).get(worldId) ?? []);

export const useWorldDropRefs = (worldId: string) =>
  useGremlyStore((s) => selectWorldIdToDropRefs(s).get(worldId) ?? []);
export const useChapterDropRefs = (chapterId: string) =>
  useGremlyStore((s) => selectChapterIdToDropRefs(s).get(chapterId) ?? []);
export const useContextDropRefs = (contextId: string) =>
  useGremlyStore((s) => selectContextIdToDropRefs(s).get(contextId) ?? []);

export const useWorldPalette = (worldId: string) =>
  useGremlyStore((s) => selectWorldPalette(s, worldId));
export const useWorldDormancy = (worldId: string) =>
  useGremlyStore((s) => selectWorldDormancy(s, worldId));
export const useWorldIsEmerging = (worldId: string) =>
  useGremlyStore((s) => selectWorldIsEmerging(s, worldId));
export const useWorldPeople = (worldId: string) =>
  useGremlyStore((s) => selectWorldPeople(s, worldId));

export const useWorldObservationForWorld = (worldId: string) =>
  useGremlyStore(
    (s) =>
      s.worldObservations
        .filter((o) => o.world_id === worldId && !o.dismissed_at)
        .sort((a, b) => b.generated_at.localeCompare(a.generated_at))[0] ?? null,
  );

export const useWeeklySummaryCardState = () =>
  useGremlyStore((s) => selectWeeklySummaryCardState(s));

export const usePendingProposalCount = () => useGremlyStore(selectPendingProposalCount);

// ============================================================================
// Composite drop hooks
// ============================================================================

export interface WorldDrops {
  todos: Todo[];
  habits: Habit[];
  notes: Note[];
}

export const useWorldDrops = (worldId: string): WorldDrops => {
  return useGremlyStore((s) => {
    const refs = selectWorldIdToDropRefs(s).get(worldId) ?? [];
    const todoIds = new Set(refs.filter((r) => r.drop_type === 'todo').map((r) => r.drop_id));
    const habitIds = new Set(refs.filter((r) => r.drop_type === 'habit').map((r) => r.drop_id));
    const noteIds = new Set(refs.filter((r) => r.drop_type === 'note').map((r) => r.drop_id));
    return {
      todos: s.todos.filter((t: Todo) => todoIds.has(t.id)),
      habits: s.habits.filter((h: Habit) => habitIds.has(h.id)),
      notes: s.notes.filter((n: Note) => noteIds.has(n.id)),
    };
  });
};

export const useChapterDrops = (chapterId: string): WorldDrops => {
  return useGremlyStore((s) => {
    const refs = selectChapterIdToDropRefs(s).get(chapterId) ?? [];
    const todoIds = new Set(refs.filter((r) => r.drop_type === 'todo').map((r) => r.drop_id));
    const habitIds = new Set(refs.filter((r) => r.drop_type === 'habit').map((r) => r.drop_id));
    const noteIds = new Set(refs.filter((r) => r.drop_type === 'note').map((r) => r.drop_id));
    return {
      todos: s.todos.filter((t: Todo) => todoIds.has(t.id)),
      habits: s.habits.filter((h: Habit) => habitIds.has(h.id)),
      notes: s.notes.filter((n: Note) => noteIds.has(n.id)),
    };
  });
};
