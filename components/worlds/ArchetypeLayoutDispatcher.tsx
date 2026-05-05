// components/worlds/ArchetypeLayoutDispatcher.tsx

import type { World, Chapter } from '../../lib/supabase/types';
import { ProjectWorldLayout } from './layouts/ProjectWorldLayout';
import { PracticeWorldLayout } from './layouts/PracticeWorldLayout';
import { DomesticWorldLayout } from './layouts/DomesticWorldLayout';
import { RelationshipWorldLayout } from './layouts/RelationshipWorldLayout';
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
    case 'practice':
      return <PracticeWorldLayout world={world} currentChapter={currentChapter} />;
    case 'domestic':
      return <DomesticWorldLayout world={world} currentChapter={currentChapter} />;
    case 'relationship':
      return <RelationshipWorldLayout world={world} currentChapter={currentChapter} />;
    default:
      return <DefaultWorldLayout world={world} currentChapter={currentChapter} />;
  }
}
