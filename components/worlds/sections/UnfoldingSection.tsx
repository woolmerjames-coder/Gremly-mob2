// components/worlds/sections/UnfoldingSection.tsx
//
// Shared UNFOLDING section primitive — used by Project, Practice, and Domestic
// archetype layouts. Renders the UNFOLDING label + the chapter card with left-
// border accent, optional blocker pill, and arc-shape-aware progress via
// UnfoldingProgress. Navigation to ChapterDetail is handled internally.

import { View, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { lightTokens } from '../../../design/tokens';
import { Text } from '../../../ui';
import { UnfoldingProgress } from '../layouts/UnfoldingProgress';
import { useBlockerCountForChapter } from '../../../lib/store/worldsSelectors';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import type { Chapter } from '../../../lib/supabase/types';

interface UnfoldingSectionProps {
  chapter: Chapter;
  worldId: string;
  /**
   * Optional override for the section label. Defaults to "UNFOLDING".
   * Not currently needed but future-proofs for custom labels per archetype.
   */
  label?: string;
}

export function UnfoldingSection({ chapter, label = 'UNFOLDING' }: UnfoldingSectionProps) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const blockerCount = useBlockerCountForChapter(chapter.id);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Pressable
        onPress={() => nav.navigate('ChapterDetail', { chapterId: chapter.id })}
        style={styles.card}
      >
        {/* Title + blocker pill */}
        <View style={styles.topRow}>
          <Text style={styles.chapterTitle} numberOfLines={2}>
            {chapter.title}
          </Text>
          {blockerCount > 0 ? (
            <View style={styles.blockerPill}>
              <Text style={styles.blockerPillText}>
                {blockerCount} blocker{blockerCount === 1 ? '' : 's'}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Arc-shape-aware progress bar + label */}
        <UnfoldingProgress chapter={chapter} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginBottom: 26,
  },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: lightTokens.colors.mossGreen,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  card: {
    backgroundColor: lightTokens.colors.worldsCard,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderLeftWidth: 4,
    borderLeftColor: lightTokens.colors.mossGreen,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  chapterTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
    lineHeight: 22,
    color: lightTokens.colors.worldsInk,
    flex: 1,
    marginRight: 8,
  },
  blockerPill: {
    backgroundColor: lightTokens.colors.blockerRedBg,
    borderWidth: 1,
    borderColor: lightTokens.colors.blockerRedBorder,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  blockerPillText: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    color: lightTokens.colors.blockerRed,
    letterSpacing: 0.4,
  },
});
