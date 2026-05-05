// components/worlds/layouts/PracticeWorldLayout.tsx
//
// Archetype layout for Practice worlds (ongoing rhythms: fitness, health,
// craft, professional development). Habits are the primary artifact; an
// active chapter (UNFOLDING) is optional.
//
// Section order with active chapter: Hero → UNFOLDING → RECURRING → OPEN → RECENT
// Section order without chapter:     Hero → RECURRING → OPEN → RECENT

import { View } from 'react-native';
import { ArchetypeWorldHero } from '../ArchetypeWorldHero';
import { UnfoldingSection } from '../sections/UnfoldingSection';
import { RecurringHabitsModule } from '../sections/RecurringHabitsModule';
import { AlsoOpenModule } from '../sections/AlsoOpenModule';
import { RecentSection } from '../sections/RecentSection';
import { lightTokens } from '../../../design/tokens';
import { useWorldDrops, useBlockerCountForChapter } from '../../../lib/store/worldsSelectors';
import { capitalizeVelocity } from './archetypeHelpers';
import type { World, Chapter } from '../../../lib/supabase/types';

interface PracticeWorldLayoutProps {
  world: World;
  currentChapter: Chapter | null;
}

export function PracticeWorldLayout({ world, currentChapter }: PracticeWorldLayoutProps) {
  const drops = useWorldDrops(world.id);
  const itemCount =
    drops.todos.filter((t) => !t.completed_at && !t.archived).length +
    drops.habits.filter((h) => !h.archived).length +
    drops.notes.filter((n) => !n.archived).length;

  const blockerCount = useBlockerCountForChapter(currentChapter?.id ?? '');

  // Status line: velocity · N items · [X blockers if any]
  // No "· no chapter" clause — practice worlds don't announce absence of chapter.
  const parts: string[] = [capitalizeVelocity(world.signal_velocity_delta), `${itemCount} items`];
  if (currentChapter && blockerCount > 0) {
    parts.push(`${blockerCount} ${blockerCount === 1 ? 'blocker' : 'blockers'}`);
  }
  const statusLine = parts.join(' \u00B7 ');

  // Practice uses sageGreen for 'growing' (calmer than project's vivid velocityDotGrowing).
  const velocityDotColor = resolvePracticeVelocityDotColor(world.signal_velocity_delta);

  return (
    <View>
      <ArchetypeWorldHero
        world={world}
        statusLine={statusLine}
        velocityDotColor={velocityDotColor}
      />

      {currentChapter ? <UnfoldingSection chapter={currentChapter} worldId={world.id} /> : null}

      <RecurringHabitsModule worldId={world.id} />

      <AlsoOpenModule worldId={world.id} label="OPEN" />

      <RecentSection worldId={world.id} />
    </View>
  );
}

function resolvePracticeVelocityDotColor(delta: World['signal_velocity_delta']): string {
  switch (delta) {
    case 'growing':
      return lightTokens.colors.sageGreen;
    case 'stable':
      return lightTokens.colors.velocityDotSteady;
    case 'declining':
      return lightTokens.colors.velocityDotCooling;
    default:
      return lightTokens.colors.velocityDotDormant;
  }
}
