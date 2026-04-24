// components/worlds/ArchetypeLayoutDispatcher.tsx

import type { World, Chapter } from '../../lib/supabase/types';
import { ProjectWorldLayout } from './layouts/ProjectWorldLayout';
import { DomesticWorldLayout } from './layouts/DomesticWorldLayout';
import { DefaultWorldLayout } from './layouts/DefaultWorldLayout';

interface ArchetypeLayoutDispatcherProps {
  world: World;
  currentChapter: Chapter | null;
}

export function ArchetypeLayoutDispatcher({
  world,
  currentChapter,
}: ArchetypeLayoutDispatcherProps) {
  switch (world.world_type) {
    case 'project':
      return <ProjectWorldLayout world={world} currentChapter={currentChapter} />;
    case 'domestic':
      return <DomesticWorldLayout world={world} currentChapter={currentChapter} />;
    case 'practice':
    case 'relationship':
    // Practice and Relationship layouts land in B.3b; fall through to default.
    default:
      return <DefaultWorldLayout world={world} currentChapter={currentChapter} />;
  }
}
