// components/worlds/layouts/DefaultWorldLayout.tsx
//
// Fallback layout used when world.world_type is null. Preserves the
// pre-Phase-B rendering path (WorldHero + CurrentChapterBigCard + ModuleRenderer)
// so every existing world without a classified world_type keeps working.

import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { World, Chapter } from '../../../lib/supabase/types';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { WorldHero } from '../WorldHero';
import { CurrentChapterBigCard } from '../CurrentChapterBigCard';
import { NoCurrentChapterCard } from '../NoCurrentChapterCard';
import { ModuleRenderer } from '../modules/ModuleRenderer';

interface DefaultWorldLayoutProps {
  world: World;
  currentChapter: Chapter | null;
}

export function DefaultWorldLayout({ world, currentChapter }: DefaultWorldLayoutProps) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <View>
      <WorldHero world={world} />
      {currentChapter ? (
        <CurrentChapterBigCard
          chapter={currentChapter}
          worldId={world.id}
          onPress={(chapterId) => nav.navigate('ChapterDetail', { chapterId })}
        />
      ) : (
        <NoCurrentChapterCard worldId={world.id} />
      )}
      <ModuleRenderer world={world} />
    </View>
  );
}
