import { Pressable, View, StyleSheet } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import type { World } from '../../lib/supabase/types';

interface WorldCardEmergingProps {
  world: World;
  onPress: (worldId: string) => void;
}

export function WorldCardEmerging({ world, onPress }: WorldCardEmergingProps) {
  const name = world.display_name || world.name;
  // Placeholder until signal count is available from the store
  const signalCount = '7 signals across 3 weeks';

  return (
    <Pressable
      onPress={() => onPress(world.id)}
      style={styles.card}
      testID={`world-card-emerging-${world.id}`}
    >
      <Text style={styles.title} numberOfLines={2}>
        {name}
      </Text>
      <Text style={styles.sub} numberOfLines={2}>
        {signalCount}
      </Text>
      <View style={styles.tag}>
        <Text style={styles.tagText}>EMERGING</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: lightTokens.colors.emergingSurface,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: lightTokens.colors.emergingBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    height: 140,
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 13,
    fontWeight: '700',
    color: lightTokens.colors.worldsInk,
  },
  sub: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 15,
    color: lightTokens.colors.warmGrey,
    marginTop: 4,
  },
  tag: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: lightTokens.colors.emergingTag,
    borderRadius: 6,
  },
  tagText: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: lightTokens.colors.ambergoldDeep,
  },
});
