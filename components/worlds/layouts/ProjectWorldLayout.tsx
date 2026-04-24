// components/worlds/layouts/ProjectWorldLayout.tsx

import { View } from 'react-native';
import { lightTokens } from '../../../design/tokens';
import { ArchetypeWorldHero } from '../ArchetypeWorldHero';
import { AlsoOpenModule } from '../sections/AlsoOpenModule';
import { UnfoldingSection } from '../sections/UnfoldingSection';
import { RecentSection } from '../sections/RecentSection';
import { useWorldDrops, useBlockerCountForChapter } from '../../../lib/store/worldsSelectors';
import { capitalizeVelocity } from './archetypeHelpers';
import type { World, Chapter } from '../../../lib/supabase/types';

interface ProjectWorldLayoutProps {
  world: World;
  currentChapter: Chapter | null;
}

export function ProjectWorldLayout({ world, currentChapter }: ProjectWorldLayoutProps) {
  const drops = useWorldDrops(world.id);
  const blockerCount = useBlockerCountForChapter(currentChapter?.id ?? '');

  const itemCount =
    drops.todos.filter((t) => !t.completed_at && !t.archived).length +
    drops.habits.filter((h) => !h.archived).length +
    drops.notes.filter((n) => !n.archived).length;

  const velocityLabel = capitalizeVelocity(world.signal_velocity_delta);
  const blockerClause =
    blockerCount > 0 ? `${blockerCount} blocker${blockerCount === 1 ? '' : 's'}` : null;

  const statusParts = [velocityLabel, `${itemCount} items`];
  if (blockerClause) statusParts.push(blockerClause);
  const statusLine = statusParts.join(' \u00B7 ');

  const velocityDotColor = (() => {
    switch (world.signal_velocity_delta) {
      case 'growing':
        return lightTokens.colors.velocityDotGrowing;
      case 'stable':
        return lightTokens.colors.velocityDotSteady;
      case 'declining':
        return lightTokens.colors.velocityDotCooling;
      default:
        return lightTokens.colors.velocityDotDormant;
    }
  })();

  return (
    <View>
      <ArchetypeWorldHero
        world={world}
        statusLine={statusLine}
        velocityDotColor={velocityDotColor}
      />

      {currentChapter ? <UnfoldingSection chapter={currentChapter} worldId={world.id} /> : null}

      <AlsoOpenModule
        worldId={world.id}
        caption="beyond the sprint"
        onPressSeeAll={() => console.log('[ProjectWorldLayout] see all todos', world.id)}
        onPressTodo={() => {
          /* TODO(phaseC): navigate to todo */
        }}
      />

      <RecentSection worldId={world.id} />
    </View>
  );
}
