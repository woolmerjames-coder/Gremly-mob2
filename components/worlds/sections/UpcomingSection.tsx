// components/worlds/sections/UpcomingSection.tsx
//
// UPCOMING section — future-dated todos linked to this world, sorted asc.
// Mirrors RecentSection's date-chip + body row shape so RECENT and UPCOMING
// look like a matched pair on the page. Returns null silently when 0 items.

import { View, Pressable, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import { useUpcomingForWorld } from '../../../lib/store/worldsSelectors';

interface UpcomingSectionProps {
  worldId: string;
  limit?: number;
  onPressItem?: (todoId: string) => void;
  onPressSeeAll?: () => void;
}

export function UpcomingSection({
  worldId,
  limit = 3,
  onPressItem,
  onPressSeeAll,
}: UpcomingSectionProps) {
  // Request one beyond limit to know whether to show "see all"
  const items = useUpcomingForWorld(worldId, limit + 1);
  if (items.length === 0) {
    return null;
  }

  const visible = items.slice(0, limit);
  const hasMore = items.length > limit;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        UPCOMING {'\u00B7'} {visible.length}
        {hasMore ? '+' : ''}
      </Text>
      {visible.map((item, idx) => {
        const isLast = idx === visible.length - 1 && !hasMore;
        const dateLabel = format(new Date(item.scheduledIso), 'MMM d').toUpperCase();
        return (
          <Pressable
            key={item.id}
            style={[styles.row, !isLast && styles.rowDivider]}
            onPress={() => onPressItem?.(item.id)}
            testID={`upcoming-item-${item.id}`}
          >
            <Text style={styles.date}>{dateLabel}</Text>
            <Text style={styles.body} numberOfLines={1}>
              {item.title}
            </Text>
          </Pressable>
        );
      })}
      {hasMore ? (
        <Pressable style={styles.seeAll} onPress={onPressSeeAll}>
          <Text style={styles.seeAllText}>see all {'\u2192'}</Text>
        </Pressable>
      ) : null}
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
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
    gap: 16,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTokens.colors.worldsCardBorder,
  },
  date: {
    minWidth: 44,
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: lightTokens.colors.warmGrey,
  },
  body: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 19,
    color: lightTokens.colors.worldsInk,
  },
  seeAll: {
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  seeAllText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: lightTokens.colors.mossGreen,
  },
});
