/**
 * Worlds module layout helpers.
 *
 * computeEffectiveLayout applies rules on top of the classifier-authored layout:
 *  - Fall back to DEFAULT_MODULE_LAYOUT when a world has module_layout = null (user-created worlds).
 *  - Suppress `active_goals` when a current milestone chapter is already shown in the big card
 *    (the big card already communicates active goal context; repeating it as a module is noise).
 *  - Deduplicate by module name (classifier should not emit duplicates, but be defensive).
 *  - Sort by descending weight; ties preserve original index.
 */

import type { Chapter, World, WorldModuleLayoutEntry } from '../supabase/types';

export const DEFAULT_MODULE_LAYOUT: WorldModuleLayoutEntry[] = [
  { module: 'upcoming_dates', weight: 0.35 },
  { module: 'next_actions', weight: 0.3 },
  { module: 'recent_thoughts', weight: 0.25 },
  { module: 'reflection_timeline', weight: 0.2 },
  { module: 'chapter_strip', weight: 0.15 },
  { module: 'people_involved', weight: 0.1 },
];

export function computeEffectiveLayout(
  world: World,
  currentChapter: Chapter | null,
): WorldModuleLayoutEntry[] {
  const raw = world.module_layout ?? DEFAULT_MODULE_LAYOUT;

  const hasCurrentMilestone =
    currentChapter !== null && currentChapter.chapter_type === 'milestone';

  const seen = new Set<string>();
  const deduped: WorldModuleLayoutEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry.module !== 'string') continue;
    if (hasCurrentMilestone && entry.module === 'active_goals') continue;
    if (seen.has(entry.module)) continue;
    seen.add(entry.module);
    deduped.push(entry);
  }

  return [...deduped].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
}
