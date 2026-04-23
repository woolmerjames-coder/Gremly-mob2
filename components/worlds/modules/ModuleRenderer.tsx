import type { ComponentType } from 'react';
import { View } from 'react-native';
import { computeEffectiveLayout } from '../../../lib/worlds/moduleLayout';
import { useCurrentChapterForWorld } from '../../../lib/store/worldsSelectors';
import type { World } from '../../../lib/supabase/types';
import { NextActionsModule } from './NextActionsModule';
import { HabitStreaksModule } from './HabitStreaksModule';
import { RecentThoughtsModule } from './RecentThoughtsModule';
import { ReflectionTimelineModule } from './ReflectionTimelineModule';
import { ChapterStripModule } from './ChapterStripModule';
import { PeopleInvolvedModule } from './PeopleInvolvedModule';
import type { WorldModuleProps } from './types';

const MODULE_REGISTRY: Record<string, ComponentType<WorldModuleProps>> = {
  next_actions: NextActionsModule,
  habit_streaks: HabitStreaksModule,
  recent_thoughts: RecentThoughtsModule,
  reflection_timeline: ReflectionTimelineModule,
  chapter_strip: ChapterStripModule,
  people_involved: PeopleInvolvedModule,
};

const warnedUnknownModules = new Set<string>();

interface ModuleRendererProps {
  world: World;
}

export function ModuleRenderer({ world }: ModuleRendererProps) {
  const currentChapter = useCurrentChapterForWorld(world.id);
  const effective = computeEffectiveLayout(world, currentChapter);

  return (
    <View>
      {effective.map((entry) => {
        const Component = MODULE_REGISTRY[entry.module];
        if (!Component) {
          if (!warnedUnknownModules.has(entry.module)) {
            warnedUnknownModules.add(entry.module);
            console.warn(
              `[ModuleRenderer] unknown module "${entry.module}" in world "${world.id}" layout; skipping. Register in MODULE_REGISTRY when implemented.`,
            );
          }
          return null;
        }
        return <Component key={entry.module} world={world} currentChapter={currentChapter} />;
      })}
    </View>
  );
}
