import { View, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useMostRecentClosedChapterForWorld } from '../../lib/store/worldsSelectors';
import type { RootStackParamList } from '../../navigation/RootNavigator';

interface NoCurrentChapterCardProps {
  worldId: string;
}

export function NoCurrentChapterCard({ worldId }: NoCurrentChapterCardProps) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const mostRecent = useMostRecentClosedChapterForWorld(worldId);

  if (mostRecent) {
    const closedDate = mostRecent.closed_at
      ? format(new Date(mostRecent.closed_at), 'MMM d')
      : null;
    return (
      <Pressable
        onPress={() => nav.navigate('ChapterDetail', { chapterId: mostRecent.id })}
        style={styles.anchorCard}
        testID="no-current-chapter-anchor"
      >
        <Text style={styles.anchorLabel}>LAST CHAPTER</Text>
        <Text style={styles.anchorTitle} numberOfLines={2}>
          {mostRecent.title}
        </Text>
        {closedDate ? (
          <Text style={styles.anchorMeta}>Closed {closedDate} · No open chapter</Text>
        ) : (
          <Text style={styles.anchorMeta}>No open chapter</Text>
        )}
      </Pressable>
    );
  }

  return (
    <View style={styles.emptyCard} testID="no-current-chapter-empty">
      <Text style={styles.emptyLabel}>NO OPEN CHAPTER</Text>
      <Text style={styles.emptyBody}>
        Chapters appear here when Gremly notices a pattern, or when you create one.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  anchorCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    paddingHorizontal: 16,
    backgroundColor: lightTokens.colors.worldsCard,
    borderWidth: 1,
    borderColor: lightTokens.colors.worldsCardBorder,
    borderRadius: 14,
    opacity: 0.88,
  },
  anchorLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: lightTokens.colors.warmGrey,
    marginBottom: 4,
  },
  anchorTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: lightTokens.colors.worldsInk,
    marginBottom: 4,
  },
  anchorMeta: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: lightTokens.colors.warmGrey,
  },
  emptyCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: lightTokens.colors.worldsCardBorder,
    borderRadius: 14,
  },
  emptyLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: lightTokens.colors.warmGrey,
    marginBottom: 6,
  },
  emptyBody: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 17,
    color: lightTokens.colors.warmGrey,
  },
});
