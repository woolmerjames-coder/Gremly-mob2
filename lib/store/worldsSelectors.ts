/**
 * Worlds selectors: the base selectors, a World's colours for the pickers,
 * and the Worlds an item is filed in. The Worlds screens read their own
 * (lib/worlds); the old Phase 4a selectors nothing read any more went in
 * the Stage 4 clean up.
 */

import { useMemo } from 'react';
import { useGremlyStore } from './useGremlyStore';
import { lightTokens } from '../../design/tokens';
import { TINT, W } from '../worlds/look';
import { worldTint } from '../worlds/model';
import type { GremlyState } from './useGremlyStore';
import type { AssignedBy } from '../supabase/types';

// ─────────────────────────────────────────────────────────────────────────────
// Base state selectors (not memoized)
// ─────────────────────────────────────────────────────────────────────────────

export const selectWorlds = (s: GremlyState) => s.worlds;
export const selectDropWorldLinks = (s: GremlyState) => s.dropWorldLinks;

export interface WorldPalette {
  base: string;
  tint: string;
  dot: string;
  textOnBase: string;
}

/**
 * A World's colours for the pickers that mark it with a dot: its tint in the
 * Worlds look (lib/worlds/look.ts TINT, chosen by worldTint), the same colour
 * it wears on the Worlds screens. Reads no old Worlds field (stage 4e).
 */
export function selectWorldPalette(state: GremlyState, worldId: string): WorldPalette {
  const world = state.worlds.find((w) => w.id === worldId);
  if (!world) return lightTokens.colors.worldPalette.generic;
  const tint = TINT[worldTint(world)];
  return { base: tint.ink, tint: tint.wash, dot: tint.ink, textOnBase: W.linen };
}

// ============================================================================
// Their Worlds, and the Worlds an item is filed in
// ============================================================================

export const useWorlds = () => useGremlyStore(selectWorlds);

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

  const safeWorlds = Array.isArray(worlds) ? worlds : [];
  const safeDropWorldLinks = Array.isArray(dropWorldLinks) ? dropWorldLinks : [];

  // Build a map of world_id → { assignedBy, relevanceScore } for this entity
  const linkMeta = new Map<string, { assignedBy: AssignedBy; relevanceScore: number }>();
  for (const link of safeDropWorldLinks) {
    if (link.drop_id === entityId) {
      linkMeta.set(link.world_id, {
        assignedBy: link.assigned_by,
        relevanceScore: link.relevance_score,
      });
    }
  }
  if (linkMeta.size === 0) return [];

  const result: WorldForEntity[] = [];
  for (const w of safeWorlds) {
    const meta = linkMeta.get(w.id);
    if (!meta) continue;
    const palette = selectWorldPalette({ worlds: safeWorlds } as any, w.id);
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
