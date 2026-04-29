import { View, Pressable, StyleSheet } from 'react-native';
import { useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import { parseLocalYMD } from '../../../lib/utils/dates';
import { useRecentDropsForChapter } from '../../../lib/store/chaptersSelectors';
import { useRepo } from '../../../providers/RepoProvider';
import { useUnifiedOverlayController } from '../../../hooks/useUnifiedOverlayController';

interface ChapterRecentSectionProps {
  chapterId: string;
  limit?: number;
}

export function ChapterRecentSection({ chapterId, limit = 4 }: ChapterRecentSectionProps) {
  const drops = useRecentDropsForChapter(chapterId, limit);
  const repo = useRepo();
  const { openEdit } = useUnifiedOverlayController();
  const openingRef = useRef(false);

  const handlePressDrop = useCallback(
    async (dropId: string) => {
      if (openingRef.current) return;
      openingRef.current = true;
      try {
        const record = await repo.getById(dropId);
        if (record) openEdit({ record });
      } finally {
        openingRef.current = false;
      }
    },
    [repo, openEdit],
  );

  if (drops.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>RECENT</Text>
      {drops.map((d, i) => {
        const isLast = i === drops.length - 1;
        const dateLabel = d.date ? format(parseLocalYMD(d.date), 'MMM d').toUpperCase() : '';
        return (
          <Pressable
            key={d.id}
            style={[styles.row, !isLast && styles.rowDivider]}
            onPress={() => handlePressDrop(d.id)}
            hitSlop={4}
            testID={`chapter-recent-${d.id}`}
          >
            <Text style={styles.date}>{dateLabel}</Text>
            <Text style={styles.body} numberOfLines={2}>
              {d.title || d.content_preview || '(note)'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 26,
    paddingHorizontal: 16,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: lightTokens.colors.warmGrey,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 7,
    gap: 10,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTokens.colors.worldsCardBorder,
  },
  date: {
    width: 54,
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    letterSpacing: 0.4,
    color: lightTokens.colors.warmGrey,
    flexShrink: 0,
    paddingTop: 2,
  },
  body: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 18,
    color: lightTokens.colors.worldsInk,
  },
});
