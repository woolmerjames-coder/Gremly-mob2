// components/worlds/layouts/RelationshipWorldLayout.tsx
//
// Archetype layout for Relationship worlds (people networks, family, community).
// People and upcoming items are the primary artifacts; chapters are optional.
//
// Section order: Hero → UNFOLDING (if chapter) → WITH YOU → UPCOMING → OPEN → RECENT
// Each section is data-driven and returns null silently when empty.

import { View } from 'react-native';
import { ArchetypeWorldHero } from '../ArchetypeWorldHero';
import { UnfoldingSection } from '../sections/UnfoldingSection';
import { WithYouSection } from '../sections/WithYouSection';
import { UpcomingSection } from '../sections/UpcomingSection';
import { AlsoOpenModule } from '../sections/AlsoOpenModule';
import { RecentSection } from '../sections/RecentSection';
import { lightTokens } from '../../../design/tokens';
import { useWorldDrops, useBlockerCountForChapter } from '../../../lib/store/worldsSelectors';
import { capitalizeVelocity } from './archetypeHelpers';
import type { World, Chapter } from '../../../lib/supabase/types';

interface RelationshipWorldLayoutProps {
  world: World;
  currentChapter: Chapter | null;
}

export function RelationshipWorldLayout({ world, currentChapter }: RelationshipWorldLayoutProps) {
  const drops = useWorldDrops(world.id);
  const itemCount =
    drops.todos.filter((t) => !t.completed_at && !t.archived).length +
    drops.habits.filter((h) => !h.archived).length +
    drops.notes.filter((n) => !n.archived).length;

  const blockerCount = useBlockerCountForChapter(currentChapter?.id ?? '');

  const parts: string[] = [capitalizeVelocity(world.signal_velocity_delta), `${itemCount} items`];
  if (currentChapter && blockerCount > 0) {
    parts.push(`${blockerCount} ${blockerCount === 1 ? 'blocker' : 'blockers'}`);
  }
  const statusLine = parts.join(' \u00B7 ');

  const velocityDotColor = resolveRelationshipVelocityDotColor(world.signal_velocity_delta);

  return (
    <View>
      <ArchetypeWorldHero
        world={world}
        statusLine={statusLine}
        velocityDotColor={velocityDotColor}
      />

      {currentChapter ? <UnfoldingSection chapter={currentChapter} worldId={world.id} /> : null}

      <WithYouSection worldId={world.id} />
      <UpcomingSection worldId={world.id} />

      <AlsoOpenModule worldId={world.id} label="OPEN" />

      <RecentSection worldId={world.id} />
    </View>
  );
}

function resolveRelationshipVelocityDotColor(delta: World['signal_velocity_delta']): string {
  switch (delta) {
    case 'growing':
      return lightTokens.colors.velocityDotGrowing;
    case 'stable':
      return lightTokens.colors.velocityDotSteady;
    case 'declining':
      return lightTokens.colors.velocityDotCooling;
    default:
      return lightTokens.colors.velocityDotDormant;
  }
}
