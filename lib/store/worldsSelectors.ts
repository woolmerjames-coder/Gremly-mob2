/**
 * Worlds & Chapters selectors (Phase 4a.1)
 *
 * Memoized derivations on top of useGremlyStore state.
 * See docs/worlds-chapters-phase-4a-spec.md section 7 for the full shape.
 * This batch covers: base state selectors and the four derived maps.
 */

import { createSelector } from 'reselect';
import { useShallow } from 'zustand/react/shallow';
import { useGremlyStore } from './useGremlyStore';
import { getDateService } from '../date/DateService';
import { lightTokens } from '../../design/tokens';
import { buildUpcomingDatesForWorld, type UpcomingDate } from '../worlds/upcomingDates';
import type { GremlyState } from './useGremlyStore';
import type { Chapter, ChapterType, DropType, AssignedBy } from '../supabase/types';
import type { Todo, Habit, Note, DcoWorldsSummary } from '../types';

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

function extractPeopleFromNotes(notes: Note[]): Map<string, number> {
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

function titleCase(raw: string): string {
  return raw
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function initialsOf(name: string): string {
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

function startOfIsoWeek(d: Date): Date {
  const day = d.getDay() || 7; // Sun = 7
  const offset = day - 1; // Mon = 0
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - offset);
  return r;
}

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
