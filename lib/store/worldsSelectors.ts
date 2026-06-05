/**
 * Worlds & Chapters selectors (Phase 4a.1)
 *
 * Memoized derivations on top of useGremlyStore state.
 * See docs/worlds-chapters-phase-4a-spec.md section 7 for the full shape.
 * This batch covers: base state selectors and the four derived maps.
 */

import { useMemo } from 'react';
import { startOfISOWeek } from 'date-fns';
import { startOfIsoWeek } from '../date/isoWeek';
import { createSelector } from 'reselect';
import { useShallow } from 'zustand/react/shallow';
import { useGremlyStore } from './useGremlyStore';
import { getDateService } from '../date/DateService';
import { lightTokens } from '../../design/tokens';
import { buildUpcomingDatesForWorld, type UpcomingDate } from '../worlds/upcomingDates';
import type { GremlyState } from './useGremlyStore';
import type {
  Chapter,
  ChapterType,
  DropType,
  AssignedBy,
  World,
  KeyMoment,
  SlipEvent,
} from '../supabase/types';
import type { Todo, Habit, Note, DcoWorldsSummary } from '../types';
import type { HabitProgressRow } from './useGremlyStore';

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
  if (!world) return lightTokens.colors.worldPalette.generic;

  // Future path: honor world.visual_style.color when classifier authors it (deferred to 4b).
  // For 4a, always use archetype-derived palette.

  const archetypes = world.archetypes ?? [];
  if (archetypes.length === 0) return lightTokens.colors.worldPalette.generic;

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
  return lightTokens.colors.worldPalette[bestType] ?? lightTokens.colors.worldPalette.generic;
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
  now: Date = getDateService().now(),
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
  now: Date = getDateService().now(),
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

// ============================================================================
// People derivation from @tags
//
// People are not currently stored in entity_people / people tables for testers.
// They live as @tag entries in notes.tags. This selector parses, normalizes,
// and ranks them. A future phase may backfill entity_people and swap the source.
// ============================================================================

export function extractPeopleFromNotes(notes: Note[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of notes) {
    const tags = Array.isArray(n.tags) ? n.tags : [];
    for (const raw of tags) {
      if (typeof raw !== 'string') continue;
      if (!raw.startsWith('@')) continue;
      const name = raw.slice(1).trim();
      if (name.length === 0) continue;
      const canonical = titleCase(name);
      counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
    }
  }
  return counts;
}

export function titleCase(raw: string): string {
  return raw
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function selectWorldPeople(state: GremlyState, worldId: string): WorldPerson[] {
  const refs = selectWorldIdToDropRefs(state).get(worldId) ?? [];
  const noteIds = new Set(refs.filter((r) => r.drop_type === 'note').map((r) => r.drop_id));
  const worldNotes = state.notes.filter((n) => noteIds.has(n.id));
  const counts = extractPeopleFromNotes(worldNotes);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, dropCount]) => ({
      id: name.toLowerCase(),
      name,
      initials: initialsOf(name),
      dropCount,
    }));
}

export function selectAllPeopleForUser(state: GremlyState, limit: number = 6): WorldPerson[] {
  const counts = extractPeopleFromNotes(state.notes);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, dropCount]) => ({
      id: name.toLowerCase(),
      name,
      initials: initialsOf(name),
      dropCount,
    }));
}

// Memoized via createSelector so the returned array reference is stable when
// state.notes hasn't changed — prevents useSyncExternalStore tearing/loops.
const selectAllPeopleMemo = createSelector(
  (s: GremlyState) => s.notes,
  (notes) => {
    const counts = extractPeopleFromNotes(notes);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, dropCount]) => ({
        id: name.toLowerCase(),
        name,
        initials: initialsOf(name),
        dropCount,
      }));
  },
);

// ============================================================================
// Weekly summary card
// ============================================================================

// startOfIsoWeek imported from lib/date/isoWeek.ts

/**
 * Multi-clause cross-world summary that evolves with activity.
 * Each clause is optional and only emitted if its signal is strong enough.
 * The component joins non-null clauses with " · " separator.
 */
export interface WorldsSummary {
  dropClause: string; // always present
  topWorldClause: string | null;
  chapterCountdownClause: string | null;
  chapterClosedClause: string | null;
  peopleClause: string | null;
  trajectoryClause: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function pluralize(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : (plural ?? singular + 's')}`;
}

export function selectWorldsSummary(
  state: GremlyState,
  now: Date = getDateService().now(),
): WorldsSummary {
  const weekStart = startOfIsoWeek(now);
  const weekStartIso = weekStart.toISOString();

  // Drop clause — always present
  const dropsThisWeek = [
    ...state.todos.filter((t) => t.created_at >= weekStartIso),
    ...state.habits.filter((h) => h.created_at >= weekStartIso),
    ...state.notes.filter((n) => n.created_at >= weekStartIso),
  ];
  const dropCount = dropsThisWeek.length;

  // Active worlds this week
  const linksThisWeek = state.dropWorldLinks.filter((l) => l.created_at >= weekStartIso);
  const worldTouchCounts = new Map<string, number>();
  for (const l of linksThisWeek) {
    worldTouchCounts.set(l.world_id, (worldTouchCounts.get(l.world_id) ?? 0) + 1);
  }
  const activeWorldCount = worldTouchCounts.size;

  const dropClause =
    dropCount === 0
      ? 'Quiet week so far. Drop something when you have a moment.'
      : `${pluralize(dropCount, 'drop')} across ${pluralize(activeWorldCount || 1, 'world')} this week.`;

  // Top world clause — only emit if there's a clear leader (top > 1.5× second)
  let topWorldClause: string | null = null;
  if (worldTouchCounts.size >= 2) {
    const sorted = [...worldTouchCounts.entries()].sort((a, b) => b[1] - a[1]);
    const [topId, topCount] = sorted[0];
    const secondCount = sorted[1][1];
    if (topCount >= secondCount * 1.5) {
      const w = state.worlds.find((x) => x.id === topId);
      const name = w?.display_name ?? w?.name;
      if (name) topWorldClause = `Most active in ${name}.`;
    }
  } else if (worldTouchCounts.size === 1) {
    const [topId] = [...worldTouchCounts.keys()];
    const w = state.worlds.find((x) => x.id === topId);
    const name = w?.display_name ?? w?.name;
    if (name) topWorldClause = `All in ${name}.`;
  }

  // Chapter countdown — nearest open chapter ending within 14 days
  const fourteenOut = new Date(now.getTime() + 14 * DAY_MS);
  const upcomingChapters = state.chapters
    .filter((c) => c.end_date && c.phase !== 'closed')
    .filter((c) => {
      const ed = new Date(c.end_date as string);
      return ed >= now && ed <= fourteenOut;
    })
    .sort((a, b) => (a.end_date ?? '').localeCompare(b.end_date ?? ''));

  let chapterCountdownClause: string | null = null;
  if (upcomingChapters[0]) {
    const c = upcomingChapters[0];
    const days = Math.ceil((new Date(c.end_date as string).getTime() - now.getTime()) / DAY_MS);
    if (days === 0) chapterCountdownClause = `${c.title} ends today.`;
    else if (days === 1) chapterCountdownClause = `${c.title} ends tomorrow.`;
    else chapterCountdownClause = `${c.title} ends in ${days} days.`;
  }

  // Chapter closed this week — only if no countdown (countdown is more action-relevant)
  const closedThisWeek = state.chapters
    .filter((c) => c.phase === 'closed' && c.closed_at && c.closed_at >= weekStartIso)
    .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''));

  let chapterClosedClause: string | null = null;
  if (closedThisWeek[0] && !chapterCountdownClause) {
    chapterClosedClause = `${closedThisWeek[0].title} wrapped.`;
  }

  // People clause — top @-mentioned people across this week's notes
  const peopleCounts = new Map<string, number>();
  for (const n of state.notes) {
    if (n.created_at < weekStartIso) continue;
    const tags = Array.isArray(n.tags) ? n.tags : [];
    for (const raw of tags) {
      if (typeof raw !== 'string' || !raw.startsWith('@')) continue;
      const name = titleCase(raw.slice(1).trim());
      if (!name) continue;
      peopleCounts.set(name, (peopleCounts.get(name) ?? 0) + 1);
    }
  }
  let peopleClause: string | null = null;
  if (peopleCounts.size > 0) {
    const top = [...peopleCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([name]) => name);
    if (top.length === 1 && (peopleCounts.get(top[0]) ?? 0) >= 3) {
      peopleClause = `Thinking a lot about ${top[0]}.`;
    } else if (top.length === 2) {
      peopleClause = `Top this week: ${top.join(', ')}.`;
    }
  }

  // Trajectory clause — active world that flipped to 'declining'
  let trajectoryClause: string | null = null;
  const decliningWorlds = state.worlds.filter(
    (w) => w.signal_velocity_delta === 'declining' && worldTouchCounts.has(w.id),
  );
  if (decliningWorlds.length > 0) {
    const w = decliningWorlds[0];
    const name = w.display_name ?? w.name;
    trajectoryClause = `${name} trending down.`;
  }

  return {
    dropClause,
    topWorldClause,
    chapterCountdownClause,
    chapterClosedClause,
    peopleClause,
    trajectoryClause,
  };
}

// Memoized variant: createSelector caches on the six state slices so that
// selectWorldsSummary only runs (and returns a new object) when one of the
// input arrays actually changes reference. This gives useShallow a stable
// summary reference to compare against, preventing the getSnapshot loop.
const _selectWorldsSummaryMemo = createSelector(
  (s: GremlyState) => s.todos,
  (s: GremlyState) => s.habits,
  (s: GremlyState) => s.notes,
  (s: GremlyState) => s.dropWorldLinks,
  (s: GremlyState) => s.worlds,
  (s: GremlyState) => s.chapters,
  (_todos, _habits, _notes, _dropWorldLinks, _worlds, _chapters): WorldsSummary =>
    selectWorldsSummary(
      {
        todos: _todos,
        habits: _habits,
        notes: _notes,
        dropWorldLinks: _dropWorldLinks,
        worlds: _worlds,
        chapters: _chapters,
      } as GremlyState,
      getDateService().now(),
    ),
);

export type WeeklySummaryCardState =
  | { kind: 'new_unread'; summary: any /* WeeklySummary type already exists in types.ts */ }
  | { kind: 'authored'; summary: DcoWorldsSummary }
  | { kind: 'in_progress'; summary: WorldsSummary };

export function selectDcoWorldsSummary(state: GremlyState): DcoWorldsSummary | null {
  return state.dco?.worlds_summary ?? null;
}

export function selectWeeklySummaryCardState(
  state: GremlyState,
  now: Date = getDateService().now(),
): WeeklySummaryCardState {
  const weeklySummaries = (state as unknown as { weeklySummaries?: any[] }).weeklySummaries ?? [];

  if (weeklySummaries.length > 0) {
    const weekStart = startOfIsoWeek(now);
    const weekStartIsoDate = weekStart.toISOString().slice(0, 10);
    const currentWeek = weeklySummaries.find(
      (s: any) => (s.week_start_date ?? '').slice(0, 10) === weekStartIsoDate,
    );
    if (currentWeek && !currentWeek.last_viewed_at) {
      return { kind: 'new_unread', summary: currentWeek };
    }
  }

  const dcoSummary = selectDcoWorldsSummary(state);
  if (dcoSummary?.headline) {
    return { kind: 'authored', summary: dcoSummary };
  }

  return { kind: 'in_progress', summary: _selectWorldsSummaryMemo(state) };
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
  useGremlyStore(useShallow((s) => selectWorldIdToChapters(s).get(worldId) ?? []));

export const useWorldDropRefs = (worldId: string) =>
  useGremlyStore(useShallow((s) => selectWorldIdToDropRefs(s).get(worldId) ?? []));
export const useChapterDropRefs = (chapterId: string) =>
  useGremlyStore(useShallow((s) => selectChapterIdToDropRefs(s).get(chapterId) ?? []));
export const useContextDropRefs = (contextId: string) =>
  useGremlyStore(useShallow((s) => selectContextIdToDropRefs(s).get(contextId) ?? []));

export const useWorldPalette = (worldId: string) =>
  useGremlyStore((s) => selectWorldPalette(s, worldId));
export const useWorldDormancy = (worldId: string) =>
  useGremlyStore((s) => selectWorldDormancy(s, worldId));
export const useWorldIsEmerging = (worldId: string) =>
  useGremlyStore((s) => selectWorldIsEmerging(s, worldId));
// Per-worldId memoized selector factory — stable reference when inputs unchanged.
const _worldPeopleSelectors = new Map<string, (s: GremlyState) => WorldPerson[]>();
function getWorldPeopleSelector(worldId: string) {
  if (!_worldPeopleSelectors.has(worldId)) {
    _worldPeopleSelectors.set(
      worldId,
      createSelector(
        (s: GremlyState) => selectWorldIdToDropRefs(s).get(worldId),
        (s: GremlyState) => s.notes,
        (refs, notes) => {
          const noteIds = new Set(
            (refs ?? []).filter((r) => r.drop_type === 'note').map((r) => r.drop_id),
          );
          const worldNotes = notes.filter((n) => noteIds.has(n.id));
          const counts = extractPeopleFromNotes(worldNotes);
          return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([name, dropCount]) => ({
              id: name.toLowerCase(),
              name,
              initials: initialsOf(name),
              dropCount,
            }));
        },
      ),
    );
  }
  return _worldPeopleSelectors.get(worldId)!;
}

export const useWorldPeople = (worldId: string) => useGremlyStore(getWorldPeopleSelector(worldId));

export const useWorldObservationForWorld = (worldId: string) =>
  useGremlyStore(
    (s) =>
      s.worldObservations
        .filter((o) => o.world_id === worldId && !o.dismissed_at)
        .sort((a, b) => b.generated_at.localeCompare(a.generated_at))[0] ?? null,
  );

export const useWeeklySummaryCardState = () =>
  useGremlyStore(useShallow((s) => selectWeeklySummaryCardState(s)));

export const usePendingProposalCount = () => useGremlyStore(selectPendingProposalCount);
export const useAllPeople = () => useGremlyStore(selectAllPeopleMemo);

// ============================================================================
// Upcoming dates per world
// ============================================================================

export function selectUpcomingDatesForWorld(
  state: GremlyState,
  worldId: string,
  now: Date = getDateService().now(),
): UpcomingDate[] {
  const chapterRefs = state.chapters.filter((c) => c.primary_world_id === worldId);
  const chapterLinkIds = new Set(
    state.chapterWorldLinks
      .filter((l) => l.world_id === worldId && l.relevance_score >= 0.5)
      .map((l) => l.chapter_id),
  );
  const allChapters = [
    ...chapterRefs,
    ...state.chapters.filter((c) => chapterLinkIds.has(c.id) && c.primary_world_id !== worldId),
  ];

  const refs = selectWorldIdToDropRefs(state).get(worldId) ?? [];
  const todoIds = new Set(refs.filter((r) => r.drop_type === 'todo').map((r) => r.drop_id));
  const noteIds = new Set(refs.filter((r) => r.drop_type === 'note').map((r) => r.drop_id));
  const todos = state.todos.filter((t) => todoIds.has(t.id));
  const notes = state.notes.filter((n) => noteIds.has(n.id));

  return buildUpcomingDatesForWorld(allChapters, todos, notes, now);
}

// Per-worldId memoized selector factory — stable reference when inputs unchanged.
const _upcomingDatesSelectors = new Map<string, (s: GremlyState) => UpcomingDate[]>();
function getUpcomingDatesSelector(worldId: string) {
  if (!_upcomingDatesSelectors.has(worldId)) {
    _upcomingDatesSelectors.set(
      worldId,
      createSelector(
        (s: GremlyState) => selectWorldIdToDropRefs(s).get(worldId),
        (s: GremlyState) => s.chapters,
        (s: GremlyState) => s.chapterWorldLinks,
        (s: GremlyState) => s.todos,
        (s: GremlyState) => s.notes,
        (refs, chapters, chapterWorldLinks, todos, notes) => {
          const chapterRefs = chapters.filter((c) => c.primary_world_id === worldId);
          const chapterLinkIds = new Set(
            chapterWorldLinks
              .filter((l) => l.world_id === worldId && l.relevance_score >= 0.5)
              .map((l) => l.chapter_id),
          );
          const allChapters = [
            ...chapterRefs,
            ...chapters.filter((c) => chapterLinkIds.has(c.id) && c.primary_world_id !== worldId),
          ];
          const safeRefs = refs ?? [];
          const todoIds = new Set(
            safeRefs.filter((r) => r.drop_type === 'todo').map((r) => r.drop_id),
          );
          const noteIds = new Set(
            safeRefs.filter((r) => r.drop_type === 'note').map((r) => r.drop_id),
          );
          return buildUpcomingDatesForWorld(
            allChapters,
            todos.filter((t) => todoIds.has(t.id)),
            notes.filter((n) => noteIds.has(n.id)),
            getDateService().now(),
          );
        },
      ),
    );
  }
  return _upcomingDatesSelectors.get(worldId)!;
}

export const useUpcomingDatesForWorld = (worldId: string) =>
  useGremlyStore(useShallow(getUpcomingDatesSelector(worldId)));

// ============================================================================
// World narrative
// ============================================================================

/**
 * Short 1–2 clause narrative synthesized from live state.
 * Prefers concrete data (people, chapter, velocity direction) over silence.
 * Returns null if not enough signal — hero then hides the quote slot entirely.
 */
export function selectWorldNarrative(
  state: GremlyState,
  worldId: string,
  now: Date = getDateService().now(),
): string | null {
  const world = state.worlds.find((w) => w.id === worldId);
  if (!world) return null;

  const refs = selectWorldIdToDropRefs(state).get(worldId) ?? [];
  const noteIds = new Set(refs.filter((r) => r.drop_type === 'note').map((r) => r.drop_id));
  const worldNotes = state.notes.filter((n) => noteIds.has(n.id));

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const recentNotes = worldNotes.filter((n) => n.created_at >= thirtyDaysAgo);

  // Top people in this world's notes over last 30 days
  const peopleCounts = new Map<string, number>();
  for (const n of recentNotes) {
    const tags = Array.isArray(n.tags) ? n.tags : [];
    for (const raw of tags) {
      if (typeof raw !== 'string' || !raw.startsWith('@')) continue;
      const name = titleCase(raw.slice(1).trim());
      if (!name) continue;
      peopleCounts.set(name, (peopleCounts.get(name) ?? 0) + 1);
    }
  }
  const topPeople = [...peopleCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);

  // Chapter arc — open chapter count + closed-this-quarter count
  const worldChapters = selectWorldIdToChapters(state).get(worldId) ?? [];
  const openCount = worldChapters.filter((c) => c.phase !== 'closed').length;
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const closedThisQuarter = worldChapters.filter(
    (c) => c.phase === 'closed' && c.closed_at && c.closed_at >= ninetyDaysAgo,
  ).length;

  const clauses: string[] = [];

  if (topPeople.length === 2) {
    clauses.push(`Mostly ${topPeople[0]} and ${topPeople[1]}.`);
  } else if (topPeople.length === 1) {
    clauses.push(`Mostly about ${topPeople[0]}.`);
  }

  if (closedThisQuarter > 0 && openCount > 0) {
    clauses.push(
      `${closedThisQuarter} chapter${closedThisQuarter === 1 ? '' : 's'} closed this quarter, ${openCount} still open.`,
    );
  } else if (openCount > 0) {
    clauses.push(`${openCount} open chapter${openCount === 1 ? '' : 's'}.`);
  } else if (closedThisQuarter > 0) {
    clauses.push(
      `${closedThisQuarter} chapter${closedThisQuarter === 1 ? '' : 's'} closed this quarter.`,
    );
  }

  if (world.signal_velocity_delta === 'growing') {
    clauses.push('Trending up.');
  } else if (world.signal_velocity_delta === 'declining') {
    clauses.push('Cooling a bit.');
  }

  if (clauses.length === 0) return null;
  return clauses.join(' ');
}

export const useWorldNarrative = (worldId: string) =>
  useGremlyStore((s) => selectWorldNarrative(s, worldId));

// ============================================================================
// Most recent closed chapter per world
// ============================================================================

export function selectMostRecentClosedChapterForWorld(
  state: GremlyState,
  worldId: string,
): Chapter | null {
  const candidates = (selectWorldIdToChapters(state).get(worldId) ?? [])
    .filter((c) => c.phase === 'closed')
    .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''));
  return candidates[0] ?? null;
}

export const useMostRecentClosedChapterForWorld = (worldId: string) =>
  useGremlyStore((s) => selectMostRecentClosedChapterForWorld(s, worldId));

export function selectCurrentChapterForWorld(state: GremlyState, worldId: string): Chapter | null {
  const candidates = state.chapters.filter(
    (c) => c.primary_world_id === worldId && c.phase !== 'closed',
  );
  if (candidates.length === 0) return null;
  const priority: Record<ChapterType, number> = {
    milestone: 0,
    bounded: 1,
    season: 2,
  };
  candidates.sort((a, b) => {
    const pa = priority[a.chapter_type] ?? 99;
    const pb = priority[b.chapter_type] ?? 99;
    if (pa !== pb) return pa - pb;
    return (b.start_date ?? '').localeCompare(a.start_date ?? '');
  });
  return candidates[0];
}

export const useCurrentChapterForWorld = (worldId: string): Chapter | null =>
  useGremlyStore((s) => selectCurrentChapterForWorld(s, worldId));

// ============================================================================
// Composite drop hooks
// ============================================================================

export interface WorldDrops {
  todos: Todo[];
  habits: Habit[];
  notes: Note[];
}

// Each drop type uses its own useShallow subscription so that element-wise
// identity comparison (Object.is on store item references) prevents tearing.
export const useWorldDrops = (worldId: string): WorldDrops => {
  const todos = useGremlyStore(
    useShallow((s) => {
      const refs = selectWorldIdToDropRefs(s).get(worldId) ?? [];
      const ids = new Set(refs.filter((r) => r.drop_type === 'todo').map((r) => r.drop_id));
      return s.todos.filter((t: Todo) => ids.has(t.id));
    }),
  );
  const habits = useGremlyStore(
    useShallow((s) => {
      const refs = selectWorldIdToDropRefs(s).get(worldId) ?? [];
      const ids = new Set(refs.filter((r) => r.drop_type === 'habit').map((r) => r.drop_id));
      return s.habits.filter((h: Habit) => ids.has(h.id));
    }),
  );
  const notes = useGremlyStore(
    useShallow((s) => {
      const refs = selectWorldIdToDropRefs(s).get(worldId) ?? [];
      const ids = new Set(refs.filter((r) => r.drop_type === 'note').map((r) => r.drop_id));
      return s.notes.filter((n: Note) => ids.has(n.id));
    }),
  );
  return { todos, habits, notes };
};

export const useChapterDrops = (chapterId: string): WorldDrops => {
  const todos = useGremlyStore(
    useShallow((s) => {
      const refs = selectChapterIdToDropRefs(s).get(chapterId) ?? [];
      const ids = new Set(refs.filter((r) => r.drop_type === 'todo').map((r) => r.drop_id));
      return s.todos.filter((t: Todo) => ids.has(t.id));
    }),
  );
  const habits = useGremlyStore(
    useShallow((s) => {
      const refs = selectChapterIdToDropRefs(s).get(chapterId) ?? [];
      const ids = new Set(refs.filter((r) => r.drop_type === 'habit').map((r) => r.drop_id));
      return s.habits.filter((h: Habit) => ids.has(h.id));
    }),
  );
  const notes = useGremlyStore(
    useShallow((s) => {
      const refs = selectChapterIdToDropRefs(s).get(chapterId) ?? [];
      const ids = new Set(refs.filter((r) => r.drop_type === 'note').map((r) => r.drop_id));
      return s.notes.filter((n: Note) => ids.has(n.id));
    }),
  );
  return { todos, habits, notes };
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase B.0 selectors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count of open (non-completed, non-archived) todos linked to this chapter
 * where priority_kind = 'blocker'.
 */
export function selectBlockerCountForChapter(state: GremlyState, chapterId: string): number {
  if (!chapterId) return 0;
  const refs = selectChapterIdToDropRefs(state).get(chapterId) ?? [];
  const todoIds = new Set(refs.filter((r) => r.drop_type === 'todo').map((r) => r.drop_id));
  if (todoIds.size === 0) return 0;
  let count = 0;
  for (const t of state.todos) {
    if (!todoIds.has(t.id)) continue;
    if (t.completed_at) continue;
    if (t.archived) continue;
    if (t.priority_kind === 'blocker') count++;
  }
  return count;
}

export const useBlockerCountForChapter = (chapterId: string) =>
  useGremlyStore((s) => selectBlockerCountForChapter(s, chapterId));

/**
 * Open (non-completed, non-archived) todos linked to this world that are
 * NOT linked to the world's currently active chapter. This is the "ALSO OPEN"
 * set from mockup 05 — todos in the world but beyond the sprint.
 *
 * Sort order: blockers first, then by due_date ascending (nulls last),
 * then by created_at descending.
 */
export function selectOpenNonChapterTodosForWorld(state: GremlyState, worldId: string): Todo[] {
  if (!worldId) return [];
  const refs = selectWorldIdToDropRefs(state).get(worldId) ?? [];
  const worldTodoIds = new Set(refs.filter((r) => r.drop_type === 'todo').map((r) => r.drop_id));
  if (worldTodoIds.size === 0) return [];

  const activeChapter = selectCurrentChapterForWorld(state, worldId);
  const chapterTodoIds = new Set<string>();
  if (activeChapter) {
    const chRefs = selectChapterIdToDropRefs(state).get(activeChapter.id) ?? [];
    for (const r of chRefs) {
      if (r.drop_type === 'todo') chapterTodoIds.add(r.drop_id);
    }
  }

  const results: Todo[] = [];
  for (const t of state.todos) {
    if (!worldTodoIds.has(t.id)) continue;
    if (t.completed_at) continue;
    if (t.archived) continue;
    if (chapterTodoIds.has(t.id)) continue;
    results.push(t);
  }

  results.sort((a, b) => {
    // Blockers first
    const aBlocker = a.priority_kind === 'blocker' ? 0 : 1;
    const bBlocker = b.priority_kind === 'blocker' ? 0 : 1;
    if (aBlocker !== bBlocker) return aBlocker - bBlocker;
    // Due date ascending (nulls last)
    const aDue = a.due_date ?? '';
    const bDue = b.due_date ?? '';
    if (aDue && bDue) return aDue.localeCompare(bDue);
    if (aDue) return -1;
    if (bDue) return 1;
    // Created at descending
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  });

  return results;
}

export const useOpenNonChapterTodosForWorld = (worldId: string) =>
  useGremlyStore(useShallow((s) => selectOpenNonChapterTodosForWorld(s, worldId)));

/**
 * Count of all open (non-completed, non-archived) todos linked to this world.
 * Used for the "NEEDS YOU · N" badge on domestic world pages. Distinct from
 * selectOpenNonChapterTodosForWorld.length — NEEDS YOU is the full open count,
 * ALSO OPEN excludes chapter-linked todos.
 */
export function selectNeedsYouCountForWorld(state: GremlyState, worldId: string): number {
  if (!worldId) return 0;
  const refs = selectWorldIdToDropRefs(state).get(worldId) ?? [];
  const todoIds = new Set(refs.filter((r) => r.drop_type === 'todo').map((r) => r.drop_id));
  if (todoIds.size === 0) return 0;
  let count = 0;
  for (const t of state.todos) {
    if (!todoIds.has(t.id)) continue;
    if (t.completed_at) continue;
    if (t.archived) continue;
    count++;
  }
  return count;
}

export const useNeedsYouCountForWorld = (worldId: string) =>
  useGremlyStore((s) => selectNeedsYouCountForWorld(s, worldId));

/**
 * Non-archived habits linked to this world. Sorted by created_at ascending
 * (oldest/most established first).
 */
export function selectActiveHabitsForWorld(state: GremlyState, worldId: string): Habit[] {
  if (!worldId) return [];
  const refs = selectWorldIdToDropRefs(state).get(worldId) ?? [];
  const habitIds = new Set(refs.filter((r) => r.drop_type === 'habit').map((r) => r.drop_id));
  if (habitIds.size === 0) return [];
  const results = state.habits.filter((h) => habitIds.has(h.id) && !h.archived);
  results.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  return results;
}

export const useActiveHabitsForWorld = (worldId: string) =>
  useGremlyStore(useShallow((s) => selectActiveHabitsForWorld(s, worldId)));

export interface HabitLastActivity {
  status: 'on' | 'done' | 'paid' | 'pending';
  text: string;
  date?: string;
}

/**
 * Derives the display idiom for a habit's current status based on its frequency
 * and most recent completion. Used in the RECURRING section on domestic worlds.
 *
 * Rules (by habit frequency):
 *   - daily: entry today → 'on'; entry in last 7 days → 'done MMM D'; else 'pending'
 *   - weekly: entry in last 7 days → 'done MMM D'; else 'pending'
 *   - monthly + financial tag (contains 'rent', 'bill', 'subscription', 'payment' in name): entry this month → 'paid MMM D'; else 'pending'
 *   - monthly (other): entry this month → 'done MMM D'; else 'pending'
 *   - anything else: entry in last 30 days → 'done MMM D'; else 'pending'
 */
export function selectHabitLastActivity(
  state: GremlyState,
  habitId: string,
): HabitLastActivity | null {
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return null;

  const progressEntries: HabitProgressRow[] = state.habitProgress.filter(
    (p) => p.habit_id === habitId,
  );

  const today = getDateService().now();
  const todayStr = today.toISOString().slice(0, 10);
  const todayMonth = todayStr.slice(0, 7); // YYYY-MM

  const msPerDay = 1000 * 60 * 60 * 24;

  // Latest entry by occurred_day descending
  const latest = progressEntries.reduce<HabitProgressRow | null>((best, p) => {
    if (!best) return p;
    return p.occurred_day > best.occurred_day ? p : best;
  }, null);

  const formatDate = (isoDay: string): string => {
    return getDateService().formatForChip(isoDay);
  };

  const daysAgo = (isoDay: string): number => {
    const diff =
      new Date(todayStr + 'T00:00:00').getTime() - new Date(isoDay + 'T00:00:00').getTime();
    return Math.round(diff / msPerDay);
  };

  const freq = (habit.frequency ?? '').toLowerCase();

  if (freq === 'daily') {
    if (!latest) return { status: 'pending', text: 'pending' };
    if (latest.occurred_day === todayStr)
      return { status: 'on', text: 'on', date: latest.occurred_day };
    if (daysAgo(latest.occurred_day) <= 7)
      return {
        status: 'done',
        text: `done ${formatDate(latest.occurred_day)}`,
        date: latest.occurred_day,
      };
    return { status: 'pending', text: 'pending' };
  }

  if (freq === 'weekly') {
    if (!latest) return { status: 'pending', text: 'pending' };
    if (daysAgo(latest.occurred_day) <= 7)
      return {
        status: 'done',
        text: `done ${formatDate(latest.occurred_day)}`,
        date: latest.occurred_day,
      };
    return { status: 'pending', text: 'pending' };
  }

  if (freq === 'monthly') {
    const isFinancial = /rent|bill|subscription|payment/i.test(habit.name);
    if (!latest) return { status: 'pending', text: 'pending' };
    if (latest.occurred_day.slice(0, 7) === todayMonth) {
      if (isFinancial)
        return {
          status: 'paid',
          text: `paid ${formatDate(latest.occurred_day)}`,
          date: latest.occurred_day,
        };
      return {
        status: 'done',
        text: `done ${formatDate(latest.occurred_day)}`,
        date: latest.occurred_day,
      };
    }
    return { status: 'pending', text: 'pending' };
  }

  // anything else
  if (!latest) return { status: 'pending', text: 'pending' };
  if (daysAgo(latest.occurred_day) <= 30)
    return {
      status: 'done',
      text: `done ${formatDate(latest.occurred_day)}`,
      date: latest.occurred_day,
    };
  return { status: 'pending', text: 'pending' };
}

export const useHabitLastActivity = (habitId: string) =>
  useGremlyStore(useShallow((s) => selectHabitLastActivity(s, habitId)));

/**
 * Returns the key_moments array for a chapter, sorted by date ascending.
 * Returns empty array if chapter has no key_moments (null or []).
 */
export function selectKeyMomentsForChapter(state: GremlyState, chapterId: string): KeyMoment[] {
  if (!chapterId) return [];
  const chapter = state.chapters.find((c) => c.id === chapterId);
  if (!chapter?.key_moments) return [];
  return [...chapter.key_moments].sort((a, b) => a.date.localeCompare(b.date));
}

export const useKeyMomentsForChapter = (chapterId: string) =>
  useGremlyStore(useShallow((s) => selectKeyMomentsForChapter(s, chapterId)));

/**
 * Returns the slip_events array for a chapter, sorted by date ascending.
 * Returns empty array if chapter has no slip_events.
 */
export function selectSlipEventsForChapter(state: GremlyState, chapterId: string): SlipEvent[] {
  if (!chapterId) return [];
  const chapter = state.chapters.find((c) => c.id === chapterId);
  if (!chapter?.slip_events) return [];
  return [...chapter.slip_events].sort((a, b) => a.date.localeCompare(b.date));
}

export const useSlipEventsForChapter = (chapterId: string) =>
  useGremlyStore(useShallow((s) => selectSlipEventsForChapter(s, chapterId)));

export interface HeldDaysSummary {
  heldDays: number;
  slipDays: number;
  totalDays: number;
}

/**
 * For commitment chapters: how many days held vs slipped, and total duration.
 * Returns zeros if chapter dates are missing. slipDays = count of slip_events.
 */
export function selectHeldDaysForChapter(state: GremlyState, chapterId: string): HeldDaysSummary {
  const chapter = state.chapters.find((c) => c.id === chapterId);
  if (!chapter?.start_date || !chapter?.end_date) {
    return { heldDays: 0, slipDays: 0, totalDays: 0 };
  }
  const startMs = new Date(chapter.start_date).getTime();
  const endMs = new Date(chapter.end_date).getTime();
  const totalDays = Math.max(0, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
  const slipDays = chapter.slip_events?.length ?? 0;
  const heldDays = Math.max(0, totalDays - slipDays);
  return { heldDays, slipDays, totalDays };
}

export const useHeldDaysForChapter = (chapterId: string): HeldDaysSummary => {
  const chapter = useGremlyStore((s) => s.chapters.find((c) => c.id === chapterId));
  return useMemo(() => {
    if (!chapter?.start_date || !chapter?.end_date) {
      return { heldDays: 0, slipDays: 0, totalDays: 0 };
    }
    const startMs = new Date(chapter.start_date).getTime();
    const endMs = new Date(chapter.end_date).getTime();
    const totalDays = Math.max(0, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
    const slipDays = chapter.slip_events?.length ?? 0;
    const heldDays = Math.max(0, totalDays - slipDays);
    return { heldDays, slipDays, totalDays };
  }, [chapter?.start_date, chapter?.end_date, chapter?.slip_events, chapterId]);
};

/**
 * Returns worlds (other than the chapter's primary_world_id) that have at
 * least one drop linked to this chapter via drop_world_links intersected with
 * the chapter's drops. Used for the "ALSO TOUCHED" chip row on closed chapters.
 *
 * Sort: archetype-alphabetical, then world name.
 */
export function selectAlsoTouchedWorldsForChapter(state: GremlyState, chapterId: string): World[] {
  if (!chapterId) return [];
  const chapter = state.chapters.find((c) => c.id === chapterId);
  if (!chapter) return [];
  const primaryWorldId = chapter.primary_world_id;

  // Collect drop IDs linked to this chapter
  const chRefs = selectChapterIdToDropRefs(state).get(chapterId) ?? [];
  const chapterDropIds = new Set(chRefs.map((r) => r.drop_id));
  if (chapterDropIds.size === 0) return [];

  // Find every world_id that has a drop_world_link for any of those drop_ids
  const touchedWorldIds = new Set<string>();
  for (const link of state.dropWorldLinks) {
    if (link.world_id === primaryWorldId) continue;
    if (chapterDropIds.has(link.drop_id)) touchedWorldIds.add(link.world_id);
  }

  const results = state.worlds.filter((w) => touchedWorldIds.has(w.id));
  results.sort((a, b) => {
    const at = a.world_type ?? 'zzz';
    const bt = b.world_type ?? 'zzz';
    if (at !== bt) return at.localeCompare(bt);
    return (a.display_name ?? a.name).localeCompare(b.display_name ?? b.name);
  });
  return results;
}

export const useAlsoTouchedWorldsForChapter = (chapterId: string) =>
  useGremlyStore(useShallow((s) => selectAlsoTouchedWorldsForChapter(s, chapterId)));

/**
 * Returns the most recent DropRefs for a world, sorted by the drop's
 * created_at (or target_date where relevant) descending, limited to `limit`.
 * Wraps selectWorldIdToDropRefs with ordering and slicing.
 */
export function selectRecentDropsForWorld(
  state: GremlyState,
  worldId: string,
  limit: number = 2,
): DropRef[] {
  if (!worldId) return [];
  const refs = selectWorldIdToDropRefs(state).get(worldId) ?? [];
  if (refs.length === 0) return [];

  // For each ref, look up the drop's created_at to sort.
  const refsWithDate = refs.map((r) => {
    let created_at = '';
    if (r.drop_type === 'todo') {
      const t = state.todos.find((x) => x.id === r.drop_id);
      created_at = t?.created_at ?? '';
    } else if (r.drop_type === 'habit') {
      const h = state.habits.find((x) => x.id === r.drop_id);
      created_at = h?.created_at ?? '';
    } else if (r.drop_type === 'note') {
      const n = state.notes.find((x) => x.id === r.drop_id);
      created_at = n?.created_at ?? '';
    }
    return { ref: r, created_at };
  });

  refsWithDate.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return refsWithDate.slice(0, limit).map((x) => x.ref);
}

export const useRecentDropsForWorld = (worldId: string, limit: number = 2) =>
  useGremlyStore(useShallow((s) => selectRecentDropsForWorld(s, worldId, limit)));

// ─── Habit 13-week grid ────────────────────────────────────────────────────────

/**
 * Returns a boolean array of length `weeksBack` (oldest → newest, current week
 * last) where `true` means the user logged at least one progress entry for this
 * habit in that calendar week (Mon–Sun).
 *
 * Used by RecurringHabitsModule (world BUILDING section) and
 * ChapterRhythmSection (chapter THIS CHAPTER'S RHYTHM section).
 *
 * When `sinceDate` is provided the first week is the ISO week containing that
 * date; weeksBack is still respected as a max cap.
 */
export interface HabitWeekGrid {
  weeks: boolean[]; // length == weeksBack, oldest first
  hitCount: number;
}

// Pure compute function — takes plain arrays, not store state.
function computeHabitWeekGrid(
  habitProgress: GremlyState['habitProgress'],
  habitId: string,
  weeksBack: number,
): HabitWeekGrid {
  const now = getDateService().now();
  const currentWeekStart = startOfIsoWeek(now);

  // Build one boolean per week, from (weeksBack-1) weeks ago to current week
  const weeks = Array.from({ length: weeksBack }, (_, i) => {
    const weekOffset = weeksBack - 1 - i; // i=0 → oldest week
    const ms = weekOffset * 7 * 24 * 60 * 60 * 1000;
    const weekStart = new Date(currentWeekStart.getTime() - ms);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const wStartStr = weekStart.toISOString().slice(0, 10);
    const wEndStr = weekEnd.toISOString().slice(0, 10);

    return habitProgress.some(
      (p) => p.habit_id === habitId && p.occurred_day >= wStartStr && p.occurred_day < wEndStr,
    );
  });

  return { weeks, hitCount: weeks.filter(Boolean).length };
}

// Backwards-compat shim for any callers that pass a full state snapshot.
export function selectHabitWeekGrid(
  state: GremlyState,
  habitId: string,
  weeksBack: number = 13,
): HabitWeekGrid {
  return computeHabitWeekGrid(state.habitProgress, habitId, weeksBack);
}

export const useHabitWeekGrid = (habitId: string, weeksBack: number = 13): HabitWeekGrid => {
  // Subscribe to reference-stable raw arrays — only change when the store
  // actually mutates them, so Object.is equality never fires spuriously.
  const habitProgress = useGremlyStore((s) => s.habitProgress);
  // useMemo returns the same object reference until deps change,
  // preventing the fresh-array infinite re-render loop.
  return useMemo(
    () => computeHabitWeekGrid(habitProgress, habitId, weeksBack),
    [habitProgress, habitId, weeksBack],
  );
};

// ============================================================================
// People per world (B.3c) — @mention extraction from world notes
// ============================================================================

function computePeopleForWorld(
  notes: GremlyState['notes'],
  dropWorldLinks: GremlyState['dropWorldLinks'],
  worldId: string,
): WorldPerson[] {
  const noteIdsInWorld = new Set<string>();
  for (const link of dropWorldLinks) {
    if (link.world_id === worldId && link.drop_type === 'note') {
      noteIdsInWorld.add(link.drop_id);
    }
  }
  if (noteIdsInWorld.size === 0) return [];

  const worldNotes = notes.filter((n) => noteIdsInWorld.has(n.id));
  const counts = extractPeopleFromNotes(worldNotes);

  return Array.from(counts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .map(([name, dropCount]) => ({
      id: name.toLowerCase(),
      name,
      initials: initialsOf(name),
      dropCount,
    }));
}

export function selectPeopleForWorld(state: GremlyState, worldId: string): WorldPerson[] {
  return computePeopleForWorld(state.notes, state.dropWorldLinks, worldId);
}

export const usePeopleForWorld = (worldId: string): WorldPerson[] => {
  const notes = useGremlyStore((s) => s.notes);
  const dropWorldLinks = useGremlyStore((s) => s.dropWorldLinks);
  return useMemo(
    () => computePeopleForWorld(notes, dropWorldLinks, worldId),
    [notes, dropWorldLinks, worldId],
  );
};

// ============================================================================
// Upcoming items for world (B.3c) — future-dated todos
// ============================================================================

export interface UpcomingItem {
  id: string;
  title: string;
  scheduledIso: string;
}

function computeUpcomingForWorld(
  todos: GremlyState['todos'],
  dropWorldLinks: GremlyState['dropWorldLinks'],
  worldId: string,
  limit: number,
): UpcomingItem[] {
  const todoIdsInWorld = new Set<string>();
  for (const link of dropWorldLinks) {
    if (link.world_id === worldId && link.drop_type === 'todo') {
      todoIdsInWorld.add(link.drop_id);
    }
  }
  if (todoIdsInWorld.size === 0) return [];

  const now = getDateService().now();
  const upcoming: UpcomingItem[] = [];
  for (const t of todos) {
    if (t.completed_at) continue;
    if (t.archived) continue;
    if (!t.scheduled_start_iso) continue;
    if (!todoIdsInWorld.has(t.id)) continue;
    const scheduled = new Date(t.scheduled_start_iso);
    if (scheduled <= now) continue;
    upcoming.push({
      id: t.id,
      title: t.title || t.name || '(untitled)',
      scheduledIso: t.scheduled_start_iso,
    });
  }
  upcoming.sort((a, b) => new Date(a.scheduledIso).getTime() - new Date(b.scheduledIso).getTime());
  return upcoming.slice(0, limit);
}

export function selectUpcomingForWorld(
  state: GremlyState,
  worldId: string,
  limit: number = 3,
): UpcomingItem[] {
  return computeUpcomingForWorld(state.todos, state.dropWorldLinks, worldId, limit);
}

export const useUpcomingForWorld = (worldId: string, limit: number = 3): UpcomingItem[] => {
  const todos = useGremlyStore((s) => s.todos);
  const dropWorldLinks = useGremlyStore((s) => s.dropWorldLinks);
  return useMemo(
    () => computeUpcomingForWorld(todos, dropWorldLinks, worldId, limit),
    [todos, dropWorldLinks, worldId, limit],
  );
};

// ============================================================================
// Eras for world (B.3c-phase1) — closed chapters linked to this world
// ============================================================================

export interface WorldEra {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  momentCount: number;
  epigraph: string | null;
}

function computeErasForWorld(
  chapters: GremlyState['chapters'],
  chapterWorldLinks: GremlyState['chapterWorldLinks'],
  dropChapterLinks: GremlyState['dropChapterLinks'],
  worldId: string,
): WorldEra[] {
  const linkedChapterIds = new Set<string>();
  for (const link of chapterWorldLinks) {
    if (link.world_id === worldId) {
      linkedChapterIds.add(link.chapter_id);
    }
  }
  if (linkedChapterIds.size === 0) return [];

  const closedChapters = chapters.filter((c) => c.closed_at != null && linkedChapterIds.has(c.id));
  if (closedChapters.length === 0) return [];

  const dropCounts = new Map<string, number>();
  for (const link of dropChapterLinks) {
    if (linkedChapterIds.has(link.chapter_id)) {
      dropCounts.set(link.chapter_id, (dropCounts.get(link.chapter_id) ?? 0) + 1);
    }
  }

  return closedChapters
    .map((c) => {
      const start = c.start_date ? new Date(c.start_date) : null;
      const end = c.end_date ? new Date(c.end_date) : null;
      const durationDays =
        start && end ? Math.round((end.getTime() - start.getTime()) / 86_400_000) : null;
      return {
        id: c.id,
        title: c.title ?? '(untitled)',
        startDate: c.start_date ?? null,
        endDate: c.end_date ?? null,
        durationDays,
        momentCount: dropCounts.get(c.id) ?? 0,
        epigraph: c.epigraph ?? null,
      };
    })
    .sort((a, b) => {
      if (b.endDate && a.endDate) return b.endDate.localeCompare(a.endDate);
      if (b.endDate) return 1;
      if (a.endDate) return -1;
      return 0;
    });
}

export const useErasForWorld = (worldId: string): WorldEra[] => {
  const chapters = useGremlyStore((s) => s.chapters);
  const chapterWorldLinks = useGremlyStore((s) => s.chapterWorldLinks);
  const dropChapterLinks = useGremlyStore((s) => s.dropChapterLinks);
  return useMemo(
    () => computeErasForWorld(chapters, chapterWorldLinks, dropChapterLinks, worldId),
    [chapters, chapterWorldLinks, dropChapterLinks, worldId],
  );
};

// ============================================================================
// Also Touched worlds for world (B.3c-phase1) — other worlds sharing drops
// ============================================================================

export interface AlsoTouchedWorld {
  id: string;
  name: string;
  worldType: string | null;
  count: number;
}

function computeAlsoTouchedForWorld(
  worlds: GremlyState['worlds'],
  dropWorldLinks: GremlyState['dropWorldLinks'],
  worldId: string,
): AlsoTouchedWorld[] {
  const dropIdsInWorld = new Set<string>();
  for (const link of dropWorldLinks) {
    if (link.world_id === worldId) {
      dropIdsInWorld.add(link.drop_id);
    }
  }
  if (dropIdsInWorld.size === 0) return [];

  const overlap = new Map<string, number>();
  for (const link of dropWorldLinks) {
    if (link.world_id === worldId) continue;
    if (!dropIdsInWorld.has(link.drop_id)) continue;
    overlap.set(link.world_id, (overlap.get(link.world_id) ?? 0) + 1);
  }
  if (overlap.size === 0) return [];

  const worldIndex = new Map(worlds.map((w) => [w.id, w]));
  return Array.from(overlap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([wid, count]) => {
      const w = worldIndex.get(wid);
      return {
        id: wid,
        name: w?.display_name || w?.name || '(world)',
        worldType: w?.world_type ?? null,
        count,
      };
    });
}

export const useAlsoTouchedForWorld = (worldId: string): AlsoTouchedWorld[] => {
  const worlds = useGremlyStore((s) => s.worlds);
  const dropWorldLinks = useGremlyStore((s) => s.dropWorldLinks);
  return useMemo(
    () => computeAlsoTouchedForWorld(worlds, dropWorldLinks, worldId),
    [worlds, dropWorldLinks, worldId],
  );
};

// ============================================================================
// Pulse — 18-week sparkline with chapter bands (B.3c-phase2a)
// ============================================================================

export interface PulseWeek {
  weekStart: string; // YYYY-MM-DD (ISO Monday of the week)
  dropCount: number;
}

export interface PulseChapterBand {
  id: string; // chapter id
  startWeekIndex: number; // 0..numWeeks-1, clamped to visible window
  endWeekIndex: number; // 0..numWeeks-1, clamped
  isClosed: boolean;
  label: string; // chapter.title
}

export interface WorldPulse {
  weeks: PulseWeek[]; // length numWeeks; weeks[0] oldest, weeks[N-1] current
  chapterBands: PulseChapterBand[];
  totalDrops: number; // sum of weeks[*].dropCount; used for empty-state guard
  numWeeks: number;
}

function computeWorldPulse(
  todos: GremlyState['todos'],
  habits: GremlyState['habits'],
  notes: GremlyState['notes'],
  dropWorldLinks: GremlyState['dropWorldLinks'],
  chapters: GremlyState['chapters'],
  chapterWorldLinks: GremlyState['chapterWorldLinks'],
  worldId: string,
  numWeeks: number,
): WorldPulse {
  // 1. drop ids in this world (regardless of type)
  const dropIdsInWorld = new Set<string>();
  for (const link of dropWorldLinks) {
    if (link.world_id === worldId) dropIdsInWorld.add(link.drop_id);
  }

  // 2. build week buckets, oldest -> newest
  const now = getDateService().now();
  const currentWeekStart = startOfISOWeek(now);
  const oldestWeekStart = new Date(currentWeekStart);
  oldestWeekStart.setDate(oldestWeekStart.getDate() - (numWeeks - 1) * 7);

  const weeks: PulseWeek[] = [];
  for (let i = 0; i < numWeeks; i++) {
    const ws = new Date(oldestWeekStart);
    ws.setDate(ws.getDate() + i * 7);
    weeks.push({
      weekStart: ws.toISOString().slice(0, 10),
      dropCount: 0,
    });
  }

  // 3. helper: map a date to a week index in [0, numWeeks-1] or -1 if outside
  const oldestMs = oldestWeekStart.getTime();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  function indexFor(date: Date): number {
    const ws = startOfISOWeek(date);
    const idx = Math.floor((ws.getTime() - oldestMs) / weekMs);
    if (idx < 0 || idx >= numWeeks) return -1;
    return idx;
  }

  // 4. count drops per week — todos, habits, notes union
  let totalDrops = 0;
  function countDrop(id: string, createdAt: string | null | undefined) {
    if (!dropIdsInWorld.has(id)) return;
    if (!createdAt) return;
    const idx = indexFor(new Date(createdAt));
    if (idx < 0) return;
    weeks[idx].dropCount += 1;
    totalDrops += 1;
  }
  for (const t of todos) countDrop(t.id, t.created_at);
  for (const h of habits) countDrop(h.id, h.created_at);
  for (const n of notes) countDrop(n.id, n.created_at);

  // 5. chapter bands — chapters linked to this world via chapter_world_links
  const chapterIdsInWorld = new Set<string>();
  for (const link of chapterWorldLinks) {
    if (link.world_id === worldId) chapterIdsInWorld.add(link.chapter_id);
  }

  const chapterBands: PulseChapterBand[] = [];
  for (const c of chapters) {
    if (!chapterIdsInWorld.has(c.id)) continue;
    if (!c.start_date) continue;

    const startDateObj = new Date(c.start_date);
    // Skip chapters that start entirely in the future (beyond current week)
    if (startDateObj.getTime() > now.getTime() + weekMs) continue;

    const startIdxRaw = indexFor(startDateObj);
    const endDateStr = c.end_date ?? c.closed_at?.slice(0, 10) ?? now.toISOString().slice(0, 10);
    const endIdxRaw = indexFor(new Date(endDateStr));

    const clampedStart = Math.max(0, Math.min(numWeeks - 1, startIdxRaw < 0 ? 0 : startIdxRaw));
    const clampedEnd = Math.max(
      0,
      Math.min(numWeeks - 1, endIdxRaw < 0 ? numWeeks - 1 : endIdxRaw),
    );

    chapterBands.push({
      id: c.id,
      startWeekIndex: clampedStart,
      endWeekIndex: clampedEnd,
      isClosed: !!c.closed_at,
      label: c.title || '(untitled)',
    });
  }

  return { weeks, chapterBands, totalDrops, numWeeks };
}

export const useWorldPulse = (worldId: string, numWeeks: number = 18): WorldPulse => {
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  const notes = useGremlyStore((s) => s.notes);
  const dropWorldLinks = useGremlyStore((s) => s.dropWorldLinks);
  const chapters = useGremlyStore((s) => s.chapters);
  const chapterWorldLinks = useGremlyStore((s) => s.chapterWorldLinks);
  return useMemo(
    () =>
      computeWorldPulse(
        todos,
        habits,
        notes,
        dropWorldLinks,
        chapters,
        chapterWorldLinks,
        worldId,
        numWeeks,
      ),
    [todos, habits, notes, dropWorldLinks, chapters, chapterWorldLinks, worldId, numWeeks],
  );
};

// ─── useWorldsForEntity ───────────────────────────────────────────────────────

export interface WorldForEntity {
  id: string;
  name: string;
  accentColor: string;
  assignedBy: 'classifier' | 'user' | 'migration';
  relevanceScore: number;
}

export function computeWorldsForEntity(
  worlds: GremlyState['worlds'],
  dropWorldLinks: GremlyState['dropWorldLinks'],
  entityId: string | null | undefined,
): WorldForEntity[] {
  if (!entityId) return [];

  // Build a map of world_id → { assignedBy, relevanceScore } for this entity
  const linkMeta = new Map<string, { assignedBy: AssignedBy; relevanceScore: number }>();
  for (const link of dropWorldLinks) {
    if (link.drop_id === entityId) {
      linkMeta.set(link.world_id, {
        assignedBy: link.assigned_by,
        relevanceScore: link.relevance_score,
      });
    }
  }
  if (linkMeta.size === 0) return [];

  const result: WorldForEntity[] = [];
  for (const w of worlds) {
    const meta = linkMeta.get(w.id);
    if (!meta) continue;
    const palette = selectWorldPalette({ worlds } as any, w.id);
    result.push({
      id: w.id,
      name: w.name,
      accentColor: palette.dot,
      assignedBy: meta.assignedBy,
      relevanceScore: meta.relevanceScore,
    });
  }

  // If the user has explicitly pinned any world, show ONLY user-pinned worlds.
  // Classifier links disappear from the pill — the user's choice is definitive.
  const hasUserPin = result.some((r) => r.assignedBy === 'user');
  const visible = hasUserPin ? result.filter((r) => r.assignedBy === 'user') : result;

  // Sort: user pins first, then relevanceScore DESC, then name (stable tiebreak)
  visible.sort((a, b) => {
    const aUser = a.assignedBy === 'user' ? 0 : 1;
    const bUser = b.assignedBy === 'user' ? 0 : 1;
    if (aUser !== bUser) return aUser - bUser;
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
    return a.name.localeCompare(b.name);
  });

  return visible;
}

export const useWorldsForEntity = (entityId: string | null | undefined): WorldForEntity[] => {
  const worlds = useGremlyStore((s) => s.worlds);
  const dropWorldLinks = useGremlyStore((s) => s.dropWorldLinks);
  return useMemo(
    () => computeWorldsForEntity(worlds, dropWorldLinks, entityId),
    [entityId, worlds, dropWorldLinks],
  );
};
