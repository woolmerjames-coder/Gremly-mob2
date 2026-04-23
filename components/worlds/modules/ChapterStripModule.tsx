import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';
import { ModuleSection } from './ModuleSection';
import { useChaptersForWorld, useWorldPalette } from '../../../lib/store/worldsSelectors';
import type { WorldModuleProps } from './types';
import type { Chapter } from '../../../lib/supabase/types';
import type { RootStackParamList } from '../../../navigation/RootNavigator';

export function ChapterStripModule({ world }: WorldModuleProps) {
  const chapters = useChaptersForWorld(world.id);
  const palette = useWorldPalette(world.id);
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  if (chapters.length === 0) return null;

  const closedCount = chapters.filter((c) => c.phase === 'closed').length;
  const openCount = chapters.length - closedCount;

  return (
    <ModuleSection label={`CHAPTERS \u00B7 ${openCount} OPEN \u00B7 ${closedCount} CLOSED`}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {chapters.map((c) => (
          <ChapterChip
            key={c.id}
            chapter={c}
            accent={palette.dot}
            onPress={() => nav.navigate('ChapterDetail', { chapterId: c.id })}
          />
        ))}
      </ScrollView>
    </ModuleSection>
  );
}

interface ChapterChipProps {
  chapter: Chapter;
  accent: string;
  onPress: () => void;
}

function ChapterChip({ chapter, accent, onPress }: ChapterChipProps) {
  const isOpen = chapter.phase !== 'closed';
  return (
    <Pressable onPress={onPress} style={styles.chip} testID={`chapter-chip-${chapter.id}`}>
      <View
        style={[
          styles.chipBar,
          { backgroundColor: isOpen ? accent : lightTokens.colors.oatDeeper },
        ]}
      />
      <View style={styles.chipBody}>
        <Text style={styles.chipPhase}>{isOpen ? chapter.phase.toUpperCase() : 'CLOSED'}</Text>
        <Text style={styles.chipTitle} numberOfLines={2}>
          {chapter.title}
        </Text>
        <Text style={styles.chipMeta}>{chapter.chapter_type}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: { paddingHorizontal: 16, gap: 8 },
  chip: {
    width: 180,
    backgroundColor: 'rgba(250,244,222,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(26,58,40,0.05)',
    borderRadius: 13,
    overflow: 'hidden',
    position: 'relative',
  },
  chipBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  chipBody: { padding: 11, paddingLeft: 14 },
  chipPhase: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: lightTokens.colors.warmGrey,
    marginBottom: 4,
  },
  chipTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
    color: lightTokens.colors.deepForest,
    lineHeight: 16,
  },
  chipMeta: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: lightTokens.colors.warmGrey,
    marginTop: 4,
  },
});
