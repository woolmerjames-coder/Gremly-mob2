import { Pressable, StyleSheet } from 'react-native';
import { formatDistanceToNowStrict } from 'date-fns';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import type { World } from '../../lib/supabase/types';

interface WorldCardDormantProps {
  world: World;
  onPress: (worldId: string) => void;
}

export function WorldCardDormant({ world, onPress }: WorldCardDormantProps) {
  const name = world.display_name || world.name;
  const authoredSubtitle = world.card_subtitle?.trim() || null;
  const subtitle = authoredSubtitle ?? deriveDormantSubtitle(world);
  return (
    <Pressable
      onPress={() => onPress(world.id)}
      style={styles.card}
      testID={`world-card-dormant-${world.id}`}
    >
      <Text style={styles.title} numberOfLines={2}>
        {name}
      </Text>
      {subtitle ? (
        <Text style={styles.sub} numberOfLines={3}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

function deriveDormantSubtitle(world: World): string {
  if (!world.last_signal_at) return 'quiet';
  const rel = formatDistanceToNowStrict(new Date(world.last_signal_at), { addSuffix: false });
  return `quiet for ${rel}`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: lightTokens.colors.dormantSurface,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: lightTokens.colors.dormantBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    height: 140,
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    fontWeight: '600',
    color: lightTokens.colors.warmGrey,
  },
  sub: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 15,
    color: lightTokens.colors.doneTextMuted,
    marginTop: 6,
  },
});
