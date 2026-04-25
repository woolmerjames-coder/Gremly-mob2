// components/worlds/sections/WithYouSection.tsx
//
// WITH YOU section — people who appear in @mention text in notes linked to this
// world, sorted by mention count desc. Returns null silently when 0 people.

import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import { usePeopleForWorld } from '../../../lib/store/worldsSelectors';

const AVATAR_SIZE = 28;

interface WithYouSectionProps {
  worldId: string;
  limit?: number;
  onPressPerson?: (personId: string) => void;
  onPressSeeAll?: () => void;
}

export function WithYouSection({
  worldId,
  limit = 4,
  onPressPerson,
  onPressSeeAll,
}: WithYouSectionProps) {
  const people = usePeopleForWorld(worldId);
  if (people.length === 0) {
    return null;
  }

  const visible = people.slice(0, limit);
  const hasMore = people.length > limit;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        WITH YOU {'\u00B7'} {people.length}
      </Text>
      {visible.map((person, idx) => {
        const isLast = idx === visible.length - 1 && !hasMore;
        return (
          <Pressable
            key={person.id}
            style={[styles.row, !isLast && styles.rowDivider]}
            onPress={() => onPressPerson?.(person.id)}
            testID={`with-you-person-${person.id}`}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarLetter}>{person.name.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {person.name}
            </Text>
            <Text style={styles.count}>{person.dropCount}</Text>
          </Pressable>
        );
      })}
      {hasMore ? (
        <Pressable style={styles.seeAll} onPress={onPressSeeAll}>
          <Text style={styles.seeAllText}>
            see all {people.length} {'\u2192'}
          </Text>
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
    gap: 12,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTokens.colors.worldsCardBorder,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: lightTokens.colors.sageGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  name: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 19,
    color: lightTokens.colors.worldsInk,
  },
  count: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: lightTokens.colors.warmGrey,
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
